import type { QuizData, UserAnswer } from "@/lib/quiz/types";

/** 单题得分快照（用于回看 / 统计）。 */
export interface QuestionScore {
  id: string;
  /** Stable location id: static questions include subject/category/chapter; generated questions include quizId. */
  questionKey?: string;
  awarded: number;
  max: number;
  /** 客观题是否完全答对；主观题为 null。 */
  correct: boolean | null;
  /** 主观题只有用户明确自评后才计入分母。 */
  scored?: boolean;
}

/** 一次作答记录。 */
export interface QuizAttempt {
  /** Human-readable source title; generated quiz namespaces aren't chapter labels. */
  title?: string;
  earned: number;
  max: number;
  /** 百分制得分（保留一位小数）。 */
  percent: number | null;
  /** 完成时间（ISO 字符串）。 */
  completedAt: string;
  /** 阶段：submitted=刚交卷(客观分已定)，final=自评完成。 */
  stage: "submitted" | "final";
  hintsUsed?: number;
  perQuestion?: QuestionScore[];
  attemptId?: string;
  quizId?: string;
  categoryId?: string;
  sourceKind?: "static" | "review-wrong" | "review-chapter" | "classroom" | "legacy-import";
  objectiveCount?: number;
  correctCount?: number;
  scoredCount?: number;
  /** Accuracy over objectively gradable questions only. */
  objectiveAccuracy?: number | null;
  answersSnapshot?: Record<string, UserAnswer>;
  selfScores?: Record<string, number>;
  currentIndex?: number;
  quizSnapshot?: QuizData;
  /** Local idempotency ledger: prevents a repeated final/save from counting twice. */
  completedAttemptIds?: string[];
}

/** 某章节的成绩档案。 */
export interface ChapterProgress {
  /** 历史最佳百分制。 */
  best: number;
  /** 最近一次作答。 */
  last: QuizAttempt;
  /** 累计作答次数（仅统计 final）。 */
  attempts: number;
  objectiveBest?: number;
  objectiveAttempts?: number;
  objectiveAttemptIds?: string[];
  completedAttemptIds?: string[];
  /** 最新答题会话（用于恢复退出前的答题现场，仅保留一份）。 */
  session?: QuizSession;
}

/** 答题会话快照（仅保留一份最新，用于恢复退出前的答题现场）。 */
export interface QuizSession {
  answers: Record<string, UserAnswer>;
  phase: "answering" | "scoring" | "summary";
  currentIndex: number;
  hintsUsed: string[];
  /** 主观题自评分快照（questionId → awarded），用于恢复 scoring/summary 阶段。 */
  selfScores: Record<string, number>;
  savedAt: string;
  attemptId?: string;
  quizId?: string;
  categoryId?: string;
  sourceKind?: "static" | "review-wrong" | "review-chapter" | "classroom";
}

export type ProgressMap = Record<string, ChapterProgress>;

// ── 全局成绩（设置面板「全局分数」消费）─────────────────────────

/** 一条章节成绩档案（已带回 subject/chapter 标识，便于聚合展示）。 */
export interface ProgressEntry {
  subjectId: string;
  categoryId?: string;
  chapterId: string;
  progress: ChapterProgress;
}

/** 全局成绩汇总。 */
export interface GlobalSummary {
  /** 已测验的章节数 */
  chapters: number;
  /** 各章历史最佳分的平均（百分制，保留一位小数） */
  avgBest: number;
  /** 累计作答次数（final） */
  totalAttempts: number;
  /** 单章最高分 */
  bestEver: number;
}