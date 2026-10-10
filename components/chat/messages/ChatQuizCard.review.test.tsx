import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatQuizCard from './ChatQuizCard';
import type { QuizQuestion } from '@/lib/quiz/types';

afterEach(() => cleanup());

const choice: QuizQuestion = {
  id: 'tf-1',
  type: 'true_false',
  difficulty: 'basic',
  source: 'current_chapter',
  points: 1,
  stem: '1+1=2',
  answer: 1,
  explanation: '深度解析正文',
};

const blank: QuizQuestion = {
  id: 'fb-1',
  type: 'fill_blank',
  difficulty: 'basic',
  source: 'current_chapter',
  points: 2,
  stem: '写出公式名',
  answer: '贝叶斯公式',
  explanation: '填空解析正文',
};

function expandQuiz(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
}

describe('ChatQuizCard real renderer', () => {
  it('judges a choice immediately after the student picks an option', () => {
    render(<ChatQuizCard title="判断练习" questions={[choice]} intent="check" />);
    expandQuiz('判断练习');
    expect(screen.queryByText(/深度解析正文/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /正确/ }));
    expect(screen.getByText(/深度解析正文/)).toBeVisible();
    expect(screen.getByRole("button", { name: "让 Agent 更详细解答" })).toBeVisible();
    expect(screen.getByText(/回答正确/)).toBeVisible();
  });

  it('shows fill-blank answers only after 查看答案', () => {
    render(<ChatQuizCard title="填空练习" questions={[blank]} />);
    expandQuiz('填空练习');
    expect(screen.queryByText(/填空解析正文/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/在此输入你的答案/), { target: { value: '贝叶斯公式' } });
    fireEvent.click(screen.getByRole('button', { name: '查看答案' }));
    expect(screen.getByText(/填空解析正文/)).toBeVisible();
    expect(screen.getByText(/贝叶斯公式/)).toBeVisible();
  });
});
