import type { QuizData, QuizQuestion as Q } from "@/lib/quiz/types";

import type { ReviewQuizAttempt } from "@/lib/review-mode/attemptTypes";

export interface GeneratedQuiz {
  quizId: string;
  title: string;
  intent?: string;
  questions: Q[];
  droppedCount: number;
  quizData: QuizData;
  attempt: ReviewQuizAttempt;
  contextCoverage?: {
    includedQuestions: number;
    totalQuestions: number;
    omittedQuestions: number;
    includedMaterials: number;
    totalMaterials: number;
    omittedMaterials: number;
    estimatedInputTokens: number;
    maxInputTokens: number;
    estimate: string;
    omittedClientAttemptIds?: number;
    omittedClientLocalQuestions?: number;
    omittedClientWeakPoints?: number;
    unavailableOwnerAttemptIds?: number;
    hasUnscannedAttemptRecords?: boolean;
    includedQuestionKeys?: string[];
  };
  /** 记录归属（chapter 模式带 subject/chapter；wrong 模式记到虚拟章节）。 */
  subjectId: string;
  chapterId: string;
  /** Studio 板块 id（错题回跳 /<subject>/<category>/<item>）。 */
  categoryId?: string;
  /** 本卷依据的错题（交卷成功后标记为已加固）。 */
  reinforcing?: string[];
}
