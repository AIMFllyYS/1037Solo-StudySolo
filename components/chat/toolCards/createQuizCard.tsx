"use client";

import { useEffect } from "react";
import ChatQuizCard from "@/components/chat/messages/ChatQuizCard";
import { openAgentQuiz } from "@/lib/quiz-dock/open";
import { useIsAgentSurface } from "@/lib/window/useManagedWindowSurface";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { agentQuizSet } from "@/lib/review-mode/agentQuizProgress";
import { getOwnerEpoch } from "@/lib/storage/ownerScope";
import { useToast } from "@/lib/stores/toast";
import { translateNow } from "@/lib/i18n";

/**
 * createQuiz 结果卡。
 * - Studio / 非 Agent 面：原来的折叠答题卡（`ChatQuizCard`），行为不变。
 * - Agent 面：中间栏不渲染任何「已出题 / 到右侧作答」提示；题目进右栏出题窗，
 *   入口改挂右上参考列。挂载仍自动打开一次，靠 `lib/quiz-dock/open.ts`
 *   的 sessionStorage 集合保证「同会话同 quizId 只自动弹一次」。
 */
export default function CreateQuizResultCard({ part }: ResultCardProps<"createQuiz">) {
  const isAgentSurface = useIsAgentSurface();
  const output =
    part.state === "output-available" && part.output.questions?.length ? part.output : null;

  useEffect(() => {
    if (!isAgentSurface || !output) return;
    let active = true;
    const ownerEpoch = getOwnerEpoch();
    const isCurrent = () => active && ownerEpoch === getOwnerEpoch();
    const open = (quizId: string) => isCurrent() && openAgentQuiz(
      {
        quizId,
        title: output.title,
        intent: output.intent,
        questions: output.questions,
        droppedCount: output.droppedCount,
      },
      { auto: true },
    );
    if (output.quizId) open(output.quizId);
    else void agentQuizSet(output.title, output.questions, "legacy").then((set) => open(set.quizId)).catch(() => {
      if (isCurrent()) useToast.getState().show(translateNow("review.quiz.error"));
    });
    return () => { active = false; };
  }, [isAgentSurface, output]);

  if (!output || isAgentSurface) return null;

  return (
    <ChatQuizCard
      quizId={output.quizId || "legacy"}
      title={output.title}
      questions={output.questions}
      intent={output.intent}
      droppedCount={output.droppedCount}
    />
  );
}
