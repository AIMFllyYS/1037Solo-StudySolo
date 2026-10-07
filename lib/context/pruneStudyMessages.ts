// #81：toModelMessages 之后、agent.stream 之前调用。只移除，不摘要。
// F0 实测丢掉 reasoning 仍 200；kimi / mimo 不例外，禁止 preservesReasoning。

import { pruneMessages, type ModelMessage } from "ai";

export function pruneStudyMessages(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({
    messages,
    reasoning: "all",
    toolCalls: "none",
    emptyMessages: "remove",
  });
}
