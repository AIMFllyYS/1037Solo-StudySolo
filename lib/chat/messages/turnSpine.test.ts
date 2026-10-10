import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildChunkSpine,
  dotEntriesFromSpine,
  planSessionChunks,
  spineDerivedTotals,
  tailWindowSlice,
  turnsToMessageRange,
  windowStartTurn,
  TURNS_PER_CHUNK,
  INITIAL_WINDOW_TURNS,
} from "./turnSpine.ts";
import type { ChatMessage } from "@/lib/types/chat";

function msg(id: string, role: "user" | "assistant", text = id): ChatMessage {
  return { id, role, parts: [{ type: "text", text }], timestamp: 0 } as ChatMessage;
}

/** 构造 turns 个「user + assistant」轮次，再缀 tailExtra 条 assistant。 */
function sessionOf(turns: number, tailExtra = 0): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push(msg(`u${i}`, "user", `第${i}轮`));
    out.push(msg(`a${i}`, "assistant"));
  }
  for (let i = 0; i < tailExtra; i += 1) out.push(msg(`x${i}`, "assistant"));
  return out;
}

describe("planSessionChunks", () => {
  test("轮次分组：user 开新轮，assistant 并入上一轮", () => {
    const plan = planSessionChunks(sessionOf(3));
    assert.equal(plan.spine.length, 3);
    assert.equal(plan.spine[0].firstIndex, 0);
    assert.equal(plan.spine[0].messageCount, 2);
    assert.equal(plan.spine[0].userMessageId, "u0");
    assert.equal(plan.spine[1].firstIndex, 2);
    assert.equal(plan.chunks.length, 1);
    assert.equal(plan.chunks[0].length, 6);
  });

  test("prelude：第一条 user 之前的孤儿消息归进第 0 轮", () => {
    const messages = [msg("p0", "assistant"), msg("u0", "user"), msg("a0", "assistant")];
    const plan = planSessionChunks(messages);
    assert.equal(plan.spine.length, 2);
    assert.equal(plan.spine[0].userMessageId, null);
    assert.equal(plan.spine[0].messageCount, 1);
    assert.equal(plan.spine[1].userMessageId, "u0");
  });

  test("跨块：第 TURNS_PER_CHUNK 轮起进下一个 chunk", () => {
    const plan = planSessionChunks(sessionOf(TURNS_PER_CHUNK + 2));
    assert.equal(plan.spine.length, TURNS_PER_CHUNK + 2);
    assert.equal(plan.chunks.length, 2);
    assert.equal(plan.spine[TURNS_PER_CHUNK].chunk, 1);
    assert.equal(plan.chunks[0].length, TURNS_PER_CHUNK * 2);
    assert.equal(plan.chunks[1].length, 4);
    // chunk 拼接 == 原数组
    assert.deepEqual(plan.chunks.flat().map((m) => m.id), sessionOf(TURNS_PER_CHUNK + 2).map((m) => m.id));
  });

  test("空会话：一个空 chunk + 空 spine", () => {
    const plan = planSessionChunks([]);
    assert.equal(plan.spine.length, 0);
    assert.equal(plan.chunks.length, 1);
    assert.equal(plan.chunks[0].length, 0);
  });
});

describe("buildChunkSpine 偏移一致性", () => {
  test("尾块切片重建的 spine 与全量 plan 的尾部一致", () => {
    const all = sessionOf(TURNS_PER_CHUNK + 3);
    const plan = planSessionChunks(all);
    const tailMessages = plan.chunks[1];
    const startIndex = plan.spine[TURNS_PER_CHUNK].firstIndex;
    const rebuilt = buildChunkSpine(tailMessages, {
      startTurn: TURNS_PER_CHUNK,
      startIndex,
      chunkIndex: 1,
    });
    assert.deepEqual(rebuilt, plan.spine.slice(TURNS_PER_CHUNK));
  });
});

describe("窗口几何", () => {
  test("windowStartTurn 只留最近 N 轮", () => {
    assert.equal(windowStartTurn(10, 4), 6);
    assert.equal(windowStartTurn(2, 4), 0);
    assert.equal(windowStartTurn(0, 4), 0);
  });

  test("turnsToMessageRange 换算轮次区间为消息下标区间", () => {
    const plan = planSessionChunks(sessionOf(5));
    const range = turnsToMessageRange(plan.spine, 10, 3, 5);
    assert.deepEqual(range, { start: 6, end: 10 });
    const mid = turnsToMessageRange(plan.spine, 10, 1, 3);
    assert.deepEqual(mid, { start: 2, end: 6 });
  });

  test("tailWindowSlice 切出最近 N 轮 + 全量 spine", () => {
    const all = sessionOf(10);
    const sliced = tailWindowSlice(all);
    assert.equal(sliced.messages.length, INITIAL_WINDOW_TURNS * 2);
    assert.equal(sliced.messages[0].id, "u6");
    assert.equal(sliced.startTurn, 10 - INITIAL_WINDOW_TURNS);
    assert.equal(sliced.startIndex, (10 - INITIAL_WINDOW_TURNS) * 2);
    assert.equal(sliced.spine.length, 10);
  });
});

describe("定位点与派生计数", () => {
  test("dotEntriesFromSpine 只给有 user 的轮出点", () => {
    const messages = [msg("p0", "assistant"), ...sessionOf(2)];
    const plan = planSessionChunks(messages);
    const dots = dotEntriesFromSpine(plan.spine);
    assert.equal(dots.length, 2);
    assert.equal(dots[0].index, 1);
    assert.equal(dots[0].id, "u0");
    assert.equal(dots[1].turn, 2);
  });

  test("spineDerivedTotals 合计各轮 counts", () => {
    const plan = planSessionChunks(sessionOf(3));
    const totals = spineDerivedTotals(plan.spine);
    assert.equal(totals.sources, 0);
    assert.equal(totals.images, 0);
    assert.equal(totals.products, 0);
  });
});
