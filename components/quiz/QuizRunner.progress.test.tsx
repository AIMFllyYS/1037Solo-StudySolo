import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuizRunner from './QuizRunner';
import type { ReviewQuizAttempt, ReviewQuizSet } from '@/lib/review-mode/attemptTypes';
import type { QuizQuestion } from '@/lib/quiz/types';

const f = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn(), aggregate: vi.fn(), outcomes: vi.fn() }));
vi.mock('@/lib/review-mode/agentQuizProgress', async (load) => ({ ...await load<typeof import('@/lib/review-mode/agentQuizProgress')>(), openAgentQuizAttempt: f.open }));
vi.mock('@/lib/review-mode/progressSync', async (load) => ({ ...await load<typeof import('@/lib/review-mode/progressSync')>(), savePreparedReviewAttempt: f.save }));
vi.mock('@/lib/quiz-progress', () => ({ saveAttempt: f.aggregate }));
vi.mock('@/lib/review-mode/wrongBook', () => ({ recordQuestionOutcomes: f.outcomes }));

const question: QuizQuestion = { id: 'original-q1', type: 'true_false', difficulty: 'basic', source: 'current_chapter', stem: '公开测试：1+1=2', answer: 1, points: 2, explanation: '加法定义' };
let saved: ReviewQuizAttempt | null;
function blank(set: ReviewQuizSet): ReviewQuizAttempt {
  return { ownerId: null, attemptId: crypto.randomUUID(), attemptKind: 'quiz', sourceKind: set.sourceKind, subjectId: set.subjectId, categoryId: set.categoryId, chapterId: set.chapterId, quizId: set.quizId, title: set.title, quizKey: set.quizKey, contentHash: set.contentHash, quizSetId: null, phase: 'answering', stage: null, answers: {}, currentIndex: 0, revealedQuestionIds: [], hintsUsed: [], selfScores: {}, questionResults: [], score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 }, completedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 1, serverRevision: 0, syncedRevision: -1, seedOperationId: crypto.randomUUID(), operationId: crypto.randomUUID(), syncState: 'local-only' };
}
beforeEach(() => {
  saved = null;
  vi.clearAllMocks();
  f.open.mockImplementation(async (set: ReviewQuizSet, _owner: string | null, fresh: boolean) => saved && !fresh ? saved : blank(set));
  f.save.mockImplementation(async (attempt: ReviewQuizAttempt) => { saved = attempt; });
});
afterEach(cleanup);

it('records original IDs and score, restores after remount, and redo creates a new attempt that corrects the miss', async () => {
  const props = { quizId: 'tool-quiz-public', title: '公开测试', questions: [question] };
  const view = render(<QuizRunner {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /错误 ×/ }).closest('fieldset')).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: /错误 ×/ }));
  fireEvent.click(screen.getByTestId('agent-quiz-record'));
  await waitFor(() => expect(saved?.phase).toBe('summary'));
  const firstId = saved!.attemptId;
  expect(saved!.answers[question.id]).toBe(0);
  expect(saved!.questionResults[0]).toMatchObject({ id: question.id, correct: false, awarded: 0, max: 2, scored: true });
  expect(saved!.questionResults[0].questionKey).toMatch(/^ssq-v1:[a-f0-9]{64}:original-q1$/);
  expect(f.aggregate).toHaveBeenCalledWith('review', expect.stringMatching(/^agent:/), expect.objectContaining({ attemptId: firstId, quizId: props.quizId, perQuestion: expect.arrayContaining([expect.objectContaining({ id: question.id })]) }));
  view.unmount();
  render(<QuizRunner {...props} />);
  await waitFor(() => expect(screen.getByTestId('agent-quiz-score')).toHaveTextContent('0 / 2'));
  fireEvent.click(screen.getByRole('button', { name: '重做' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /正确 √/ }).closest('fieldset')).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: /正确 √/ }));
  fireEvent.click(screen.getByTestId('agent-quiz-record'));
  await waitFor(() => expect(screen.getByTestId('agent-quiz-score')).toHaveTextContent('2 / 2'));
  expect(saved!.attemptId).not.toBe(firstId);
  expect(saved!.questionResults[0].correct).toBe(true);
  expect(f.outcomes).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ question, correct: true, answer: 1 })]), expect.anything(), saved!.contentHash, saved!.attemptId);
});

it('keeps unattempted and subjective questions out of objective accuracy and wrong outcomes', async () => {
  const other = { ...question, id: 'unanswered' };
  const essay: QuizQuestion = { ...question, id: 'essay', type: 'essay', answer: '参考答案' };
  render(<QuizRunner quizId="partial-public" title="部分提交" questions={[question, other, essay]} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /正确 √/ })[0].closest('fieldset')).not.toBeDisabled());
  fireEvent.click(screen.getAllByRole('button', { name: /正确 √/ })[0]);
  fireEvent.click(screen.getByTestId('agent-quiz-record'));
  await waitFor(() => expect(saved?.phase).toBe('summary'));
  expect(saved!.score).toMatchObject({ objectiveCount: 1, correctCount: 1, max: 2, percent: 100 });
  expect(saved!.questionResults.filter((result) => !result.scored).map((result) => result.correct)).toEqual([null, null]);
});
