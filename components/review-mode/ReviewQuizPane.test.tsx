import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const f = vi.hoisted(() => ({
  auth: { status: "signedIn", userId: "11111111-1111-4111-8111-111111111111" },
  entries: [] as Array<Record<string, unknown>>,
  getAllProgress: vi.fn(() => []),
  saveAttempt: vi.fn(),
  recordQuestionOutcomes: vi.fn(),
  createQuizSetIdentity: vi.fn(),
  createAndCheckpointReviewAttempt: vi.fn(),
  loadNewestReviewAttempt: vi.fn(),
    loadWrongAttemptIdsFromAccount: vi.fn(),
  prepareReviewAttemptCheckpoint: vi.fn(),
  savePreparedReviewAttempt: vi.fn(),
  markReinforced: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, values?: Record<string, unknown>) => values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@/lib/hooks/useAuthSession", () => ({ useAuthSession: () => f.auth }));
vi.mock("@/lib/quiz-progress", () => ({ getAllProgress: f.getAllProgress, saveAttempt: f.saveAttempt }));
vi.mock("@/lib/review-mode/wrongQuestions", () => ({ selectWeakPoints: () => [] }));
vi.mock("@/lib/review-mode/wrongBook", () => ({
  readWrongBook: () => f.entries,
  recordQuestionOutcomes: f.recordQuestionOutcomes,
  markReinforced: f.markReinforced,
  sourceHref: () => null,
}));
vi.mock("@/lib/review-mode/quizSnapshot", () => ({ createQuizSetIdentity: f.createQuizSetIdentity }));
vi.mock("@/lib/review-mode/progressSync", () => ({
  createAndCheckpointReviewAttempt: f.createAndCheckpointReviewAttempt,
  loadNewestReviewAttempt: f.loadNewestReviewAttempt,
  loadWrongAttemptIdsFromAccount: f.loadWrongAttemptIdsFromAccount,
  prepareReviewAttemptCheckpoint: f.prepareReviewAttemptCheckpoint,
  savePreparedReviewAttempt: f.savePreparedReviewAttempt,
  retryReviewAttemptSync: vi.fn(),
}));
vi.mock("@/lib/review-mode/classSources", () => ({ listClassSources: vi.fn(async () => []) }));
vi.mock("@/lib/storage/ownerScope", () => ({ getStorageOwner: () => f.auth.status === "signedIn" ? f.auth.userId : null }));
vi.mock("@/lib/content-data", () => ({ getSubject: () => null }));
vi.mock("@/lib/content-data/subjects.registry", () => ({ SUBJECT_REGISTRY: [] }));
vi.mock("@/lib/notes/userNote", () => ({ subjectLabel: (id: string) => id }));
vi.mock("@/components/quiz/QuizQuestion", () => ({
  default: ({ question, onChange }: { question: { stem: string }; onChange: (answer: number) => void }) => (
    <div><p>{question.stem}</p><button type="button" onClick={() => onChange(0)}>choose wrong</button></div>
  ),
}));

import ReviewQuizPane from "./ReviewQuizPane";

const question = {
  id: "q1", type: "single_choice", difficulty: "basic", source: "current_chapter", points: 1,
  stem: "2 + 2 = ?", options: ["3", "4"], answer: 1, explanation: "2+2 equals four.",
};
const attempt = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
  attemptKind: "quiz",
  sourceKind: "review-wrong",
  subjectId: "review",
  categoryId: null,
  chapterId: "wrong-questions",
  quizId: "quiz-generated",
  title: "诊断题",
  quizKey: "ss-review-v1|review-wrong|hash",
  contentHash: "c".repeat(64),
  quizSetId: null,
  phase: "answering",
  stage: null,
  answers: {},
  currentIndex: 0,
  revealedQuestionIds: [],
  hintsUsed: [],
  selfScores: {},
  questionResults: [],
  score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 },
  completedAt: null,
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
  revision: 1,
  serverRevision: 0,
  syncedRevision: -1,
  seedOperationId: "33333333-3333-4333-8333-333333333333",
  operationId: "44444444-4444-4444-8444-444444444444",
  syncState: "pending",
};

describe("ReviewQuizPane attempt workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.auth = { status: "signedIn", userId: "11111111-1111-4111-8111-111111111111" };
    f.entries = [{
      id: "wrong-entry-1",
      questionKey: `ssq-v1:${"c".repeat(64)}:q1`,
      stem: "Original wrong question",
      question,
      source: { subjectId: "chemistry", chapterId: "ch01", categoryId: "detail", label: "Chemistry · 1", quizId: "old-quiz" },
      createdAt: "2026-10-03T00:00:00.000Z",
      attemptIds: ["55555555-5555-4555-8555-555555555555"],
      misses: 1,
      latestCorrect: false,
    }];
    f.createQuizSetIdentity.mockResolvedValue({ quizKey: "ss-review-v1|review-wrong|hash", contentHash: "c".repeat(64) });
    f.createAndCheckpointReviewAttempt.mockResolvedValue(attempt);
    f.loadNewestReviewAttempt.mockResolvedValue(null);
    f.loadWrongAttemptIdsFromAccount.mockResolvedValue({ attemptIds: [], hasMoreAttemptRecords: false });
    f.prepareReviewAttemptCheckpoint.mockImplementation((value: Record<string, unknown>) => ({
      ...value,
      revision: Number(value.revision ?? 0) + 1,
      operationId: "66666666-6666-4666-8666-666666666666",
      syncState: "pending",
    }));
    f.savePreparedReviewAttempt.mockResolvedValue(undefined);
    f.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        quizId: "quiz-generated", title: "针对错题的变式", intent: "diagnose", questions: [question], droppedCount: 0,
        contextCoverage: {
          includedQuestions: 1, totalQuestions: 1, omittedQuestions: 0,
          includedMaterials: 0, totalMaterials: 0, omittedMaterials: 0,
          estimatedInputTokens: 400, maxInputTokens: 20_000, estimate: "conservative",
          includedQuestionKeys: [`ssq-v1:${"c".repeat(64)}:q1`],
        },
      }),
    });
    vi.stubGlobal("fetch", f.fetch);
    vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "77777777-7777-4777-8777-777777777777" });
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("uses a typed wrong-context request, checkpoints answers, records the same attempt, and exposes coverage", async () => {
    render(<ReviewQuizPane />);
    fireEvent.click(screen.getByTestId("review-quiz-wrong-cta"));
    await screen.findByText("2 + 2 = ?");
    expect(f.fetch).toHaveBeenCalledWith("/api/review/quiz", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"kind":"wrong"'),
    }));
    const payload = JSON.parse(f.fetch.mock.calls[0][1].body as string);
    expect(payload).not.toHaveProperty("instruction");
    expect(payload.source.attemptIds).toContain("55555555-5555-4555-8555-555555555555");
    expect(screen.getByTestId("review-context-coverage").textContent).toContain("totalQuestions");

    fireEvent.click(screen.getByRole("button", { name: "choose wrong" }));
    await waitFor(() => expect(f.savePreparedReviewAttempt).toHaveBeenCalled());
    const record = await screen.findByTestId("review-quiz-record");
    fireEvent.click(record);
    await waitFor(() => expect(f.saveAttempt).toHaveBeenCalledWith("review", "wrong-questions", expect.objectContaining({
      attemptId: attempt.attemptId,
      stage: "final",
      objectiveCount: 1,
      correctCount: 0,
    })));
    expect(f.recordQuestionOutcomes).toHaveBeenCalledWith(
      [expect.objectContaining({ question, correct: false, answer: 0 })],
      expect.objectContaining({ attemptId: attempt.attemptId, contentHash: attempt.contentHash }),
      attempt.contentHash,
      attempt.attemptId,
    );
    expect(f.prepareReviewAttemptCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ phase: "summary", stage: "final" }), attempt.ownerId);
    expect(f.markReinforced).toHaveBeenCalledWith(["wrong-entry-1"]);
  });
});
