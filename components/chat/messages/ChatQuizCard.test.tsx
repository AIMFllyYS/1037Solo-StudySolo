import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatQuizCard from './ChatQuizCard';
import type { QuizQuestion } from '@/lib/quiz/types';

vi.mock('@/components/quiz/QuizQuestion', () => ({
  default: ({ question, mode, onChange }: { question: QuizQuestion; mode: string; onChange?: (a: number) => void }) => (
    <div data-testid="quiz-question" data-mode={mode} data-id={question.id}>
      <span>{question.stem}</span>
      <button type="button" onClick={() => onChange?.(0)}>作答</button>
    </div>
  ),
}));

afterEach(() => cleanup());

function q(id: string, stem: string, type: QuizQuestion['type'] = 'single_choice'): QuizQuestion {
  return {
    id,
    type,
    difficulty: 'basic',
    source: 'current_chapter',
    points: 2,
    stem,
    options: type === 'single_choice' || type === 'multiple_choice' ? ['甲', '乙'] : undefined,
    answer: type === 'fill_blank' ? '贝叶斯' : 0,
    explanation: '这是解析',
  };
}

function expandQuiz(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
}

describe('ChatQuizCard', () => {
  it('stays collapsed by default', () => {
    render(<ChatQuizCard title="即时检验" questions={[q('a', '第一题')]} intent="check" />);
    expect(screen.getByText(/即时检验 · 1 题/)).toBeVisible();
    expect(screen.queryByTestId('quiz-question')).not.toBeInTheDocument();
  });

  it('reveals correctness as soon as a single-choice option is picked', () => {
    render(<ChatQuizCard title="即时检验" questions={[q('a', '第一题'), q('b', '第二题')]} intent="check" />);
    expandQuiz('即时检验');
    const cards = screen.getAllByTestId('quiz-question');
    expect(cards[0]).toHaveAttribute('data-mode', 'answer');
    fireEvent.click(screen.getAllByRole('button', { name: '作答' })[0]);
    expect(screen.getAllByTestId('quiz-question')[0]).toHaveAttribute('data-mode', 'review');
    expect(screen.getAllByTestId('quiz-question')[1]).toHaveAttribute('data-mode', 'answer');
  });

  it('keeps fill-blank in answer mode until 查看答案 is clicked', () => {
    render(<ChatQuizCard title="填空" questions={[q('f', '公式名', 'fill_blank')]} />);
    expandQuiz('填空');
    expect(screen.getByTestId('quiz-question')).toHaveAttribute('data-mode', 'answer');
    expect(screen.getByRole('button', { name: '查看答案' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '作答' }));
    fireEvent.click(screen.getByRole('button', { name: '查看答案' }));
    expect(screen.getByTestId('quiz-question')).toHaveAttribute('data-mode', 'review');
  });
});
