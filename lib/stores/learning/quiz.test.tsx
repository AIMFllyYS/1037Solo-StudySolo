import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "11111111-1111-4111-8111-111111111111";
const f = vi.hoisted(() => ({
  saveAttempt: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(() => null),
  clearSession: vi.fn(),
  createQuizSetIdentity: vi.fn(),
  createAndCheckpointReviewAttempt: vi.fn(),
  findResumableReviewAttempt: vi.fn(),
  loadReviewAttemptById: vi.fn(),
  loadLatestCompletedStaticAttempt: vi.fn(),
  prepareReviewAttemptCheckpoint: vi.fn(),
  savePreparedReviewAttempt: vi.fn(),
  recordQuestionOutcomes: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/quiz-progress", () => ({
  saveAttempt: f.saveAttempt,
  saveSession: f.saveSession,
  getSession: f.getSession,
  clearSession: f.clearSession,
}));
vi.mock("@/lib/review-mode/quizSnapshot", () => ({ createQuizSetIdentity: f.createQuizSetIdentity }));
vi.mock("@/lib/review-mode/progressSync", () => ({
  createAndCheckpointReviewAttempt: f.createAndCheckpointReviewAttempt,
  findResumableReviewAttempt: f.findResumableReviewAttempt,
  loadReviewAttemptById: f.loadReviewAttemptById,
  loadLatestCompletedStaticAttempt: f.loadLatestCompletedStaticAttempt,
  createReviewAttempt: (set: Record<string, unknown>, ownerId: string | null) => ({ ...attempt, ...set, ownerId }),
  prepareReviewAttemptCheckpoint: (value: Record<string, unknown>) => ({ ...value, revision: Number(value.revision ?? 0) + 1, syncState: "pending" }),
  savePreparedReviewAttempt: f.savePreparedReviewAttempt,
}));
vi.mock("@/lib/review-mode/wrongBook", () => ({ recordQuestionOutcomes: f.recordQuestionOutcomes }));
vi.mock("@/lib/storage/ownerScope", () => ({ getStorageOwner: () => OWNER }));

import { useQuizStore } from "./quiz";

const baseQuiz = {
  subjectId: "chemistry",
  chapterId: "ch01",
  generatedAt: "2026-10-04T00:00:00.000Z",
  examConfig: { source: "chapter material", totalPoints: 1 },
  questions: [{
    id: "q1", type: "single_choice", difficulty: "basic", source: "current_chapter", points: 1,
    stem: "氧化数升高表示？", options: ["得到电子", "失去电子"], answer: 1, explanation: "失电子。",
  }],
};
const attempt = {
  ownerId: OWNER, attemptId: "22222222-2222-4222-8222-222222222222", attemptKind: "quiz", sourceKind: "static",
  subjectId: "chemistry", categoryId: "detail", chapterId: "ch01", quizId: "bank-quiz", title: "化学",
  quizKey: "ss-review-v1|static|hash", contentHash: "c".repeat(64), quizSetId: null,
  phase: "answering", stage: null, answers: {}, currentIndex: 0, revealedQuestionIds: [], hintsUsed: [], selfScores: {},
  questionResults: [], score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 },
  completedAt: null, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z",
  revision: 1, serverRevision: 0, syncedRevision: -1,
  seedOperationId: "33333333-3333-4333-8333-333333333333", operationId: "44444444-4444-4444-8444-444444444444", syncState: "pending",
};

describe("static quiz attempt persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.createQuizSetIdentity.mockResolvedValue({ quizKey: attempt.quizKey, contentHash: attempt.contentHash });
    f.createAndCheckpointReviewAttempt.mockResolvedValue(attempt);
    f.findResumableReviewAttempt.mockResolvedValue(null);
    f.loadReviewAttemptById.mockResolvedValue(null);
    f.loadLatestCompletedStaticAttempt.mockResolvedValue(null);
    f.prepareReviewAttemptCheckpoint.mockImplementation((value: Record<string, unknown>) => ({ ...value, revision: Number(value.revision ?? 0) + 1, syncState: "pending" }));
    f.savePreparedReviewAttempt.mockResolvedValue(undefined);
    f.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ quiz: baseQuiz }) });
    vi.stubGlobal("fetch", f.fetch);
    useQuizStore.getState().reset();
  });
  afterEach(() => { vi.unstubAllGlobals(); useQuizStore.getState().reset(); });

  it("stores the immutable static question set and reuses one attempt ID for submitted/final score", async () => {
    await useQuizStore.getState().load("chemistry", "ch01", "detail");
    expect(f.createAndCheckpointReviewAttempt).toHaveBeenCalledWith(expect.objectContaining({
      sourceKind: "static", subjectId: "chemistry", categoryId: "detail", chapterId: "ch01",
      quizData: expect.objectContaining({ questions: baseQuiz.questions }),
    }), OWNER);
    expect(useQuizStore.getState().data?.questions[0].stem).toBe(baseQuiz.questions[0].stem);
    expect(useQuizStore.getState().attemptId).toBe(attempt.attemptId);

    useQuizStore.getState().setAnswer("q1", 0);
    useQuizStore.getState().submit();
    const submitted = f.saveAttempt.mock.calls.at(-1)![2];
    expect(submitted).toMatchObject({ attemptId: attempt.attemptId, stage: "submitted", answersSnapshot: { q1: 0 }, correctCount: 0, objectiveCount: 1 });
    useQuizStore.getState().finishScoring();
    const final = f.saveAttempt.mock.calls.at(-1)![2];
    expect(final).toMatchObject({ attemptId: attempt.attemptId, stage: "final", correctCount: 0, objectiveCount: 1 });
    expect(f.recordQuestionOutcomes).toHaveBeenCalledWith(
      [expect.objectContaining({ question: baseQuiz.questions[0], correct: false, answer: 0 })],
      expect.objectContaining({ attemptId: attempt.attemptId, contentHash: attempt.contentHash }),
      attempt.contentHash,
      attempt.attemptId,
    );
    expect(f.savePreparedReviewAttempt).toHaveBeenCalled();
  });

  it("restores the preserved snapshot instead of replacing it with the current bank", async () => {
    const oldSnapshot = { ...baseQuiz, questions: [{ ...baseQuiz.questions[0], stem: "保存时的原题干" }] };
    f.findResumableReviewAttempt.mockResolvedValue({
      attempt: { ...attempt, answers: { q1: 0 }, currentIndex: 0 },
      set: { quizKey: attempt.quizKey, contentHash: attempt.contentHash, sourceKind: "static", subjectId: "chemistry", categoryId: "detail", chapterId: "ch01", quizId: attempt.quizId, title: attempt.title, quizData: oldSnapshot },
    });
    await useQuizStore.getState().load("chemistry", "ch01", "detail");
    expect(useQuizStore.getState().data?.questions[0].stem).toBe("保存时的原题干");
    expect(useQuizStore.getState().answers).toEqual({ q1: 0 });
    expect(f.createAndCheckpointReviewAttempt).not.toHaveBeenCalled();
  });

  it("re-reads the latest completed server attempt on a fresh device without creating a duplicate", async () => {
    const completed = { ...attempt, phase: "summary", stage: "final", answers: { q1: 0 }, completedAt: "2026-10-04T00:02:00.000Z" };
    const storedQuiz = { ...baseQuiz, questions: [{ ...baseQuiz.questions[0], stem: "跨设备恢复的原题干" }] };
    f.loadLatestCompletedStaticAttempt.mockResolvedValue({
      attempt: completed,
      set: { quizKey: attempt.quizKey, contentHash: attempt.contentHash, sourceKind: "static", subjectId: "chemistry", categoryId: "detail", chapterId: "ch01", quizId: attempt.quizId, title: attempt.title, quizData: storedQuiz },
    });
    await useQuizStore.getState().load("chemistry", "ch01", "detail");
    expect(useQuizStore.getState().attemptId).toBe(attempt.attemptId);
    expect(useQuizStore.getState().data?.questions[0].stem).toBe("跨设备恢复的原题干");
    expect(useQuizStore.getState().phase).toBe("summary");
    expect(f.createAndCheckpointReviewAttempt).not.toHaveBeenCalled();
  });
});
