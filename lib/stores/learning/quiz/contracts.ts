import type { QuizData, QuizQuestion, UserAnswer } from "@/lib/quiz/types";

import type { ReviewQuizSourceKind } from "@/lib/review-mode/attemptTypes";
import type { ReviewQuizAttempt, ReviewQuizSet } from "@/lib/review-mode/attemptTypes";

export type QuizStatus = "idle" | "loading" | "ready" | "empty" | "error";

/** 做题流程阶段：作答 → 评分/自评 → 总结。 */
export type QuizPhase = "answering" | "scoring" | "summary";

/** 单题评分结果（提交后计算）。 */
export interface QuestionResult {
  question: QuizQuestion;
  answer: UserAnswer;
  /** 客观题：自动判分；主观题：用户自评（提交时初始化为 0）。 */
  awarded: number;
  max: number;
  /** 仅客观题有意义：是否完全答对。 */
  correct: boolean;
  /** 客观题为 true（自动判分），主观题为 false（需自评）。 */
  objective: boolean;
  /** 用户明确给主观题打分后才为 true。 */
  selfScored: boolean;
}

export interface QuizState {
  // ── 数据加载 ───────────────────────────────
  status: QuizStatus;
  data: QuizData | null;
  subjectId: string;
  chapterId: string;
  categoryId: string;
  quizId: string;
  attemptId: string;
  sourceKind: ReviewQuizSourceKind;
  quizSet: ReviewQuizSet | null;
  reviewAttempt: ReviewQuizAttempt | null;
  /** 当前已加载的 quiz 键（subject/category/chapter），用于避免重复加载。 */
  loadedKey: string | null;
  errorMessage: string | null;
  persistenceError: "local-save-failed" | "owner-changed" | null;

  // ── 做题状态 ───────────────────────────────
  phase: QuizPhase;
  currentIndex: number;
  /** questionId → 用户作答 */
  answers: Record<string, UserAnswer>;
  /** 已查看提示的题目 id（交卷前点击提示） */
  hintsUsed: string[];
  /** 提交后计算的逐题结果（含主观题自评分，可被 setSelfScore 修改） */
  results: QuestionResult[];

  // ── actions ────────────────────────────────
  load: (subjectId: string, chapterId: string, categoryId?: string) => Promise<void>;
  reset: () => void;
  setAnswer: (id: string, answer: UserAnswer) => void;
  useHint: (id: string) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  /** 作答 → 评分：自动判分客观题，主观题初始化为 0 待自评；并把当前成绩先落地本地。 */
  submit: () => void;
  /** 主观题自评打分（0 ~ 满分），同时同步到 results。 */
  setSelfScore: (id: string, awarded: number) => void;
  /** 评分 → 总结：存最终成绩到本地。 */
  finishScoring: () => void;
  /** 回到评分面板（从总结返回修改自评）。 */
  backToScoring: () => void;
  /** 重做本套题（保留已加载数据，清空作答）。 */
  restart: () => void;
}

// ── 派生统计（供 QuizSummary 使用，非 store 状态）───────────────

export interface QuizScoreBreakdown {
  earned: number;
  max: number;
  /** 百分制总分（earned/max*100，保留一位小数） */
  percent: number;
  byType: Record<string, { earned: number; max: number; count: number }>;
  bySource: Record<string, { earned: number; max: number; count: number }>;
  byDifficulty: Record<string, { earned: number; max: number; count: number }>;
}