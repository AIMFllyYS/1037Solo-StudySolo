import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { ModelMessage } from "ai";
import { runWithLedgerContext, type UsageLedgerRow } from "@/lib/billing/ledger/usageLedger.ts";
import {
  COMPACT_KEEP_TURNS,
  compactHistory,
  resetCompactionCache,
  splitKeptTurns,
} from "./compactHistory.ts";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

afterEach(() => {
  resetCompactionCache();
});

function turn(i: number): ModelMessage[] {
  return [
    { role: "user", content: i === 0 ? "开头提到了线粒体是能量工厂" : `第${i}问` },
    { role: "assistant", content: i === 0 ? "线粒体确实是能量工厂。" : `答${i}` },
  ];
}

function longHistory(n = 8): ModelMessage[] {
  return Array.from({ length: n }, (_, i) => turn(i)).flat();
}

test("splitKeptTurns 保留最近 6 轮原文", () => {
  const { old, recent } = splitKeptTurns(longHistory(8), COMPACT_KEEP_TURNS);
  assert.equal(old.length, 4);
  assert.equal(recent.length, 12);
  assert.match(JSON.stringify(old), /线粒体/);
  assert.doesNotMatch(JSON.stringify(recent), /线粒体/);
});

test("compactHistory：摘要替换较早轮次并保留最近原文；settleUsage source=compaction", async () => {
  const rows: UsageLedgerRow[] = [];
  let generateCalls = 0;
  const result = await runWithLedgerContext(
    { userId: USER, insert: async (row) => { rows.push(row); } },
    () => compactHistory({
      messages: longHistory(8),
      shouldCompact: true,
      sessionId: "sess-compact",
      generateSummary: async () => {
        generateCalls += 1;
        return {
          text: "早期讨论了线粒体是细胞的能量工厂。",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
        };
      },
    }),
  );
  assert.equal(result.compacted, true);
  assert.equal(result.reused, false);
  assert.equal(generateCalls, 1);
  assert.match(result.messages[0] && typeof result.messages[0].content === "string" ? result.messages[0].content : "", /线粒体/);
  assert.match(JSON.stringify(result.messages.slice(-2)), /第7问/);
  assert.doesNotMatch(JSON.stringify(result.messages.slice(2)), /开头提到了线粒体/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.route, "/api/chat");
  assert.equal(rows[0]!.kind, "llm");
  assert.equal(rows[0]!.meta.source, "compaction");
});

test("compactHistory：相同较早历史复用缓存，不再打模型、不再 settleUsage", async () => {
  const rows: UsageLedgerRow[] = [];
  let generateCalls = 0;
  const generateSummary = async () => {
    generateCalls += 1;
    return { text: "摘要A", usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
  };
  const run = () => compactHistory({
    messages: longHistory(8),
    shouldCompact: true,
    sessionId: "sess-reuse",
    generateSummary,
  });
  await runWithLedgerContext({ userId: USER, insert: async (row) => { rows.push(row); } }, run);
  await runWithLedgerContext({ userId: USER, insert: async (row) => { rows.push(row); } }, run);
  assert.equal(generateCalls, 1);
  assert.equal(rows.length, 1);
});

test("compactHistory：未达软上限不压缩", async () => {
  const result = await compactHistory({
    messages: longHistory(8),
    shouldCompact: false,
    generateSummary: async () => {
      throw new Error("should not summarize");
    },
  });
  assert.equal(result.compacted, false);
  assert.equal(result.messages.length, 16);
});
test('AI failure never falls back to a prefix excerpt or claims successful compaction', async () => {
  const messages = longHistory(8), before = JSON.stringify(messages);
  await assert.rejects(() => compactHistory({ messages, shouldCompact: true, generateSummary: async () => { throw new Error('provider failed'); } }), /原对话与附件未修改/);
  assert.equal(JSON.stringify(messages), before);
});
