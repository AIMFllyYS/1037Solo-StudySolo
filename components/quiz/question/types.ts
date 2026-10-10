import type { QuizQuestion as Q, UserAnswer } from "@/lib/quiz/types";

import type { QuestionResult } from "@/lib/quiz-store";

export interface QuizQuestionProps {
  question: Q;
  index: number;
  total: number;
  mode: "answer" | "review";
  answer: UserAnswer;
  onChange?: (a: UserAnswer) => void;
  result?: QuestionResult;
  /** 可选：外部控制提示状态；未提供时使用全局 quiz store。 */
  hintsUsed?: string[];
  onUseHint?: (id: string) => void;
}
export type AnswerFieldProps = Pick<QuizQuestionProps, "question" | "mode" | "answer" | "onChange">;
