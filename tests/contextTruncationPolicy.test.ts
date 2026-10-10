import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { useTokenTracker } from "@/lib/hooks/useTokenTracker.ts";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("token tracker grows the session budget when the model window is larger", () => {
  const tracker = useTokenTracker.getState();
  tracker.resetSession();

  useTokenTracker.getState().setCurrentContext(10_000, 128_000);
  useTokenTracker.getState().setCurrentContext(20_000, 1_000_000);

  assert.equal(useTokenTracker.getState().modelContextLimit, 1_000_000);
  assert.equal(useTokenTracker.getState().sessionContextBudgetTokens, 1_000_000);

  useTokenTracker.getState().setCurrentContext(21_000, 32_000);
  assert.equal(useTokenTracker.getState().sessionContextBudgetTokens, 1_000_000);
});

test("usage accounting does not overwrite context ring totals", () => {
  useTokenTracker.getState().resetSession();
  useTokenTracker.getState().setCurrentContext(90_000, 128_000);
  useTokenTracker.getState().addUsage({
    promptTokens: 1_000,
    completionTokens: 500,
    totalTokens: 1_500,
  });

  assert.equal(useTokenTracker.getState().currentContextTokens, 90_000);
  assert.equal(useTokenTracker.getState().lastTurn.promptTokens, 1_000);
});

test("context breakdown drives ring total and warning state", () => {
  useTokenTracker.getState().resetSession();
  useTokenTracker.getState().setCurrentContext(10_000, 128_000);
  useTokenTracker.getState().setContextBreakdown({
    tools: 100,
    skills: 100,
    pages: 100,
    webSearch: 0,
    conversation: 99_700,
    total: 100_000,
    truncated: true,
    cacheHit: true,
    warning: "soft limit",
  });

  const state = useTokenTracker.getState();
  assert.equal(state.currentContextTokens, 100_000);
  assert.equal(state.contextTruncated, true);
  assert.equal(state.contextWarning, "soft limit");
});

test("token tracker uses unpadded total for the next soft-limit decision", () => {
  useTokenTracker.getState().resetSession();
  useTokenTracker.getState().setContextBreakdown({
    tools: 100,
    skills: 100,
    pages: 100,
    webSearch: 0,
    conversation: 4_700,
    total: 5_000,
    displayTotal: 90_000,
    truncated: true,
  });
  const state = useTokenTracker.getState();
  assert.equal(state.serverContextTokens, 5_000);
  assert.equal(state.currentContextTokens, 90_000);
  assert.equal(state.contextTruncated, true);
});

test("chat route uses last user message, selected model context manager, and soft truncation metadata", () => {
  const source = [
    readWorkspaceFile("lib/ai/chat/server/generation.ts"),
    readWorkspaceFile("lib/ai/chat/server/messages.ts"),
  ].join("\n");

  assert.match(source, /reverse\(\)\.find\(\(m\) => m\.role === "user"\)/);
  assert.match(source, /getContextManager\(options\.contextMode \?\? "full", effectiveModelId, customGroups\)/);
  assert.match(source, /body\.contextTruncated \|\| serverSoftLimitReached \|\| ctxResult\.overflow/);
  assert.match(source, /clientContextTokens: body\.clientContextTokens \?\? null/);
  assert.match(source, /truncated: contextTruncated/);
  assert.match(source, /estimateRequestContextTokens/);
  assert.match(source, /isSoftLimitReached/);
  assert.match(source, /cachedTokens: settled\.summary\?\.cachedTokens \?\? 0/);
  assert.doesNotMatch(source, /cacheHit: ctxResult\.cacheHit/);
});

test("token dashboard binds context cache to cachedTokens and aligns ring with 80% soft limit", () => {
  const dash = readWorkspaceFile("components/chat/billing/TokenDashboard.tsx");
  assert.match(dash, /formatContextCacheValue\(cachedTokens/);
  assert.match(dash, /contextRingLevel/);
  assert.doesNotMatch(dash, /breakdown\?\.cacheHit \? '命中' : '未命中'/);
  assert.doesNotMatch(dash, /ratio > 0\.7 \? 'var\(--md-sys-color-error\)'/);

  const full = readWorkspaceFile("lib/context/fullContext.ts");
  assert.doesNotMatch(full, /_contextCache/);
  assert.doesNotMatch(full, /createHash/);
});

test("dynamic tool context uses contextKey de-duplication", () => {
  const tools = [
    "lib/ai/agent/tools/_shared.ts",
    "lib/ai/agent/tools/getCurrentPage/tool.ts",
    "lib/ai/agent/tools/useSkill/tool.ts",
    "lib/ai/agent/tools/useSkill/types.ts",
  ].map(readWorkspaceFile).join("\n");

  assert.match(tools, /contextKey\?: string/);
  assert.match(tools, /contextKey: `page:/);
  assert.match(tools, /contextKey: `skill:/);
  assert.match(tools, /loadedContextKeys: new Set\(\)/);
  assert.match(tools, /runtime\.loadedContextKeys\.has\(output\.contextKey\)/);
  assert.match(tools, /runtime\.loadedContextKeys\.add\(output\.contextKey\)/);
});

test("chat panel warns at 80 percent but does not disable input", () => {
  const source = readWorkspaceFile("components/chat/ChatPanel.tsx");

  assert.match(source, /const showWarning = ctxRatio >= SOFT_LIMIT_RATIO \|\| contextTruncated/);
  assert.doesNotMatch(source, /disabled=\{contextFull\}/);
  assert.doesNotMatch(source, /disabledReason="上下文已满/);
});
