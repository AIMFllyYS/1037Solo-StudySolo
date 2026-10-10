import { extractFollowUpQuestionsFromContent } from "@/lib/chat/rendering/parseChatContent";
import { getAnswerText, getMessageText } from "@/lib/chat/messages/messageParts";
import type { ChatMessage } from "@/lib/types/chat";

export function fallbackQuestions(userQuestion: string): string[] {
  if (/解释|什么是|讲讲|说说|为什么/.test(userQuestion)) {
    return ["能举个例子说明吗？", "这个知识点考试怎么考？", "给我出一道练习题检验一下"];
  }
  if (/出题|练习|做题|题目/.test(userQuestion)) {
    return ["直接给我答案和解析吧", "这道题的考点是什么？", "再出一道类似的题"];
  }
  if (/推导|证明|公式/.test(userQuestion)) {
    return ["每一步的依据是什么？", "有没有更简单的推导方法？", "这个公式怎么记忆？"];
  }
  if (/区别|比较|对比|异同/.test(userQuestion)) {
    return ["能举个具体例子对比吗？", "它们有什么联系？", "考试容易怎么考？"];
  }
  return ["能再详细解释一下吗？", "这个知识点考试怎么考？", "给我出一道练习题"];
}

/** 已有 data-followup 则不动；否则从正文抽，再退回本地兜底。无答案时返回 undefined。 */
export function resolveFollowUps(latest: ChatMessage, userContent: string): string[] | undefined {
  const answer = getAnswerText(latest);
  if (!answer || latest.followUpQuestions?.length) return undefined;
  const extracted = extractFollowUpQuestionsFromContent(getMessageText(latest));
  return extracted.length ? extracted : fallbackQuestions(userContent);
}
