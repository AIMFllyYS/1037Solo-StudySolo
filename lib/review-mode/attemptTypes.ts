import type { QuizData, QuizQuestion, UserAnswer } from "@/lib/quiz/types";

export const REVIEW_QUIZ_SOURCE_KINDS = ["static", "review-wrong", "review-chapter", "classroom"] as const;
export type ReviewQuizSourceKind = (typeof REVIEW_QUIZ_SOURCE_KINDS)[number];
export type ReviewAttemptKind = "quiz" | "legacy-summary";
export type ReviewAttemptPhase = "answering" | "scoring" | "summary";
export type ReviewAttemptStage = "submitted" | "final" | null;
export type ReviewAttemptSyncState = "local-only" | "pending" | "synced" | "conflict";

export interface ReviewQuizSet {
  /** Stable per source and full canonical content hash; the server recomputes it. */
  quizKey: string;
  contentHash: string;
  sourceKind: ReviewQuizSourceKind;
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  quizId: string;
  title: string;
  quizData: QuizData;
  serverId?: string;
}

export interface ReviewQuestionResult {
  id: string;
  /** Set-scoped stable ID: distinct across chapters even when question IDs repeat. */
  questionKey: string;
  awarded: number;
  max: number;
  correct: boolean | null;
  objective: boolean;
  scored: boolean;
}

export interface ReviewAttemptScore {
  earned: number;
  max: number;
  percent: number | null;
  objectiveCount: number;
  correctCount: number;
  scoredCount: number;
}

/** Full local recovery state. `quizData` is stored once in the per-owner question-set record. */
export interface ReviewQuizAttempt {
  /** Captured local owner; retained only in device storage as an async account-switch guard. */
  ownerId: string | null;
  attemptId: string;
  attemptKind: ReviewAttemptKind;
  sourceKind: ReviewQuizSourceKind | "legacy-import";
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  quizId: string;
  title: string;
  quizKey: string | null;
  contentHash: string | null;
  quizSetId: string | null;
  phase: ReviewAttemptPhase;
  stage: ReviewAttemptStage;
  answers: Record<string, UserAnswer>;
  currentIndex: number;
  revealedQuestionIds: string[];
  hintsUsed: string[];
  selfScores: Record<string, number>;
  questionResults: ReviewQuestionResult[];
  score: ReviewAttemptScore;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Local revision can advance offline without mutating the last acknowledged server revision. */
  revision: number;
  serverRevision: number;
  /** Highest local revision acknowledged by the cloud. */
  syncedRevision: number;
  seedOperationId: string;
  operationId: string;
  syncState: ReviewAttemptSyncState;
  /** Exact v1 aggregate copied only after the user explicitly imports local history. */
  legacyData?: LegacyProgressSummary;
}

export interface ReviewQuizAttemptPage {
  rows: ReviewQuizAttempt[];
  nextCursor: string | null;
}

export interface ReviewQuestionContext {
  questionKey: string;
  questionId: string;
  quizKey: string;
  quizId: string;
  sourceKind: ReviewQuizSourceKind;
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  title: string;
  question: QuizQuestion;
  misses: number;
  latestCorrect: boolean;
  lastAttemptAt: string;
}

export interface LegacyProgressSummary {
  version: 1;
  best: number;
  attempts: number;
  last: {
    earned: number;
    max: number;
    percent: number | null;
    completedAt: string;
    stage: "submitted" | "final";
    perQuestion?: Array<{ id: string; awarded: number; max: number; correct: boolean | null }>;
  };
}

export interface LegacyImportRequest {
  subjectId: string;
  chapterId: string;
  categoryId: string | null;
  title: string;
  progress: Omit<LegacyProgressSummary, "version">;
}
