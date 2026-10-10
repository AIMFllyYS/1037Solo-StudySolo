import assert from "node:assert/strict";
import { test } from "node:test";
import { displayContextTokens, estimateContextBudget } from "./estimateContextBudget.ts";
import { estimateFullContextTokens, FIRST_TURN_OVERHEAD_TOKENS } from "@/lib/context/estimateFullContext.ts";
import type { ChatMessage } from "@/lib/types/chat";

const msg = (text: string): ChatMessage => ({
  id: "m",
  role: "user",
  timestamp: 1,
  parts: [{ type: "text", text }],
});

test("estimateContextBudget：有服务端 token 时叠加本轮提问；分母取锁定值与当前窗口较大者", () => {
  const budget = estimateContextBudget(
    { sessionContextBudgetTokens: 10_000, serverContextTokens: 7_900 },
    { contextK: 128 },
    [msg("hello")],
    "追问",
  );
  assert.equal(budget.limit, 128_000);
  assert.ok(budget.estimated > 7_900);
  assert.equal(budget.softLimitReached, budget.estimated / 128_000 >= 0.8);
});

test("estimateContextBudget：无服务端累计时用消息估算 + 3000，软上限 80%", () => {
  const under = estimateContextBudget(
    { sessionContextBudgetTokens: 0, serverContextTokens: 0 },
    { contextK: 8 },
    [msg("短")],
    "短",
  );
  assert.equal(under.limit, 8000);
  assert.equal(under.softLimitReached, false);

  const over = estimateContextBudget(
    { sessionContextBudgetTokens: 0, serverContextTokens: 0 },
    { contextK: 1 },
    [msg("x".repeat(4000))],
    "x".repeat(4000),
  );
  assert.equal(over.limit, 1000);
  assert.equal(over.softLimitReached, true);
});

test("displayContextTokens：截断态垫高环，退出截断后用实际值", () => {
  const over = {
    limit: 10_000,
    estimated: 5_000,
    softLimitReached: true,
  };
  const under = { ...over, softLimitReached: false };
  const tracker = {
    currentContextTokens: 8_000,
    contextBreakdown: {
      tools: 0, skills: 0, pages: 0, webSearch: 0, conversation: 5_000, total: 5_000, displayTotal: 9_000,
    },
  };
  assert.equal(displayContextTokens(tracker, over), 9_000);
  assert.equal(displayContextTokens(tracker, under), 5_000);
});

test("estimateContextBudget：软上限用未垫高的 serverContextTokens，对话变短后可退出", () => {
  const recovered = estimateContextBudget(
    { sessionContextBudgetTokens: 10_000, serverContextTokens: 5_000 },
    { contextK: 10 },
    [msg("短")],
    "短",
  );
  assert.equal(recovered.softLimitReached, false);
  assert.ok(recovered.estimated < 8_000);
});

test("estimateContextBudget：换到更大窗口模型后预算分母更新", () => {
  const grown = estimateContextBudget(
    { sessionContextBudgetTokens: 128_000, serverContextTokens: 10_000 },
    { contextK: 1000 },
    [msg("hi")],
    "追问",
  );
  assert.equal(grown.limit, 1_000_000);
  const kept = estimateContextBudget(
    { sessionContextBudgetTokens: 1_000_000, serverContextTokens: 10_000 },
    { contextK: 32 },
    [msg("hi")],
    "追问",
  );
  assert.equal(kept.limit, 1_000_000);
});

test("estimateContextBudget：两端 80% 走 estimateFullContextTokens", () => {
  const budget = estimateContextBudget(
    { sessionContextBudgetTokens: 0, serverContextTokens: 0 },
    { contextK: 8 },
    [msg("hello")],
    "hello",
  );
  assert.equal(
    budget.estimated,
    estimateFullContextTokens({ historyText: "hello", extraTokens: FIRST_TURN_OVERHEAD_TOKENS }),
  );
});

test("estimateContextBudget：缺模型时默认 128k", () => {
  const budget = estimateContextBudget(
    { sessionContextBudgetTokens: 0, serverContextTokens: 0 },
    undefined,
    [],
    "hi",
  );
  assert.equal(budget.limit, 128_000);
});
