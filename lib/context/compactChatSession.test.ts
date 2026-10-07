import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "@/lib/types/chat";
import {
  CHAT_COMPACT_KEEP_TURNS,
  compactChatMessages,
  extractiveChatSummary,
  splitChatKeptTurns,
} from "./compactChatSession.ts";

function msg(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, parts: [{ type: "text", text }], timestamp: 1 };
}

function turns(count: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    out.push(msg(`u${i}`, "user", `问${i}`));
    out.push(msg(`a${i}`, "assistant", `答${i}`));
  }
  return out;
}

test("splitChatKeptTurns：未超过保留轮数不切开", () => {
  const messages = turns(CHAT_COMPACT_KEEP_TURNS);
  const split = splitChatKeptTurns(messages);
  assert.equal(split.old.length, 0);
  assert.equal(split.recent.length, messages.length);
});

test("compactChatMessages：较早轮次换成摘要并保留最近原文", () => {
  const messages = turns(CHAT_COMPACT_KEEP_TURNS + 2);
  const result = compactChatMessages(messages, CHAT_COMPACT_KEEP_TURNS, 'AI 整理：问0及答0的关键事实');
  assert.equal(result.compacted, true);
  assert.match(result.summary ?? "", /问0/);
  assert.equal(result.messages[0]?.role, "user");
  assert.match(String(result.messages[0]?.parts[0] && "text" in result.messages[0].parts[0] ? result.messages[0].parts[0].text : ""), /对话摘要/);
  const recentText = extractiveChatSummary(result.messages.slice(2));
  assert.match(recentText, /问7|问6/);
  assert.doesNotMatch(recentText, /问0/);
});

test("compactChatMessages：轮次不够时不改写", () => {
  const messages = turns(2);
  const result = compactChatMessages(messages);
  assert.equal(result.compacted, false);
  assert.equal(result.messages, messages);
});
