import assert from "node:assert/strict";
import { test } from "node:test";
import {
  plannedWebSearchProviders,
  webSearchProviderChips,
  webSourceFavicon,
  webSourceHost,
} from "./webSearchDisplay.ts";

// ── plannedWebSearchProviders：与 policy.planSearchProviders 同序的计划态 ──

test("plannedWebSearchProviders：显式点名优先（忽略 mode/query）", () => {
  assert.deepEqual(plannedWebSearchProviders({ providers: ["perplexity"], mode: "daily", query: "天气" }), ["perplexity"]);
  assert.deepEqual(plannedWebSearchProviders({ providers: ["zhipu", "bogus", undefined, "kimi"] }), ["zhipu", "kimi"]);
});

test("plannedWebSearchProviders：comprehensive 三家 / academic PPLX+Kimi / daily Kimi+智谱", () => {
  assert.deepEqual(plannedWebSearchProviders({ mode: "comprehensive", query: "x" }), ["kimi", "zhipu", "perplexity"]);
  assert.deepEqual(plannedWebSearchProviders({ mode: "academic", query: "x" }), ["perplexity", "kimi"]);
  assert.deepEqual(plannedWebSearchProviders({ mode: "daily", query: "x" }), ["kimi", "zhipu"]);
});

test("plannedWebSearchProviders：auto / 缺省按问题性质猜，学术信号走学术通道", () => {
  assert.deepEqual(plannedWebSearchProviders({ mode: "auto", query: "最近的临床试验 研究" }), ["perplexity", "kimi"]);
  assert.deepEqual(plannedWebSearchProviders({ mode: "auto", query: "今天天气如何" }), ["kimi", "zhipu"]);
  assert.deepEqual(plannedWebSearchProviders({ query: "这个知识点什么意思" }), ["kimi", "zhipu"]);
  assert.deepEqual(plannedWebSearchProviders(null), ["kimi", "zhipu"]);
});

// ── webSourceHost / webSourceFavicon ────────────────────────────

test("webSourceHost：剥 www、保留子域，坏 URL 返回空串", () => {
  assert.equal(webSourceHost("https://www.nejm.org/doi/10.1"), "nejm.org");
  assert.equal(webSourceHost("https://arxiv.org/abs/123"), "arxiv.org");
  assert.equal(webSourceHost("not a url"), "");
  assert.equal(webSourceHost(""), "");
});

test("webSourceFavicon：供应商 icon 优先，http(s) 以外的一律拒绝", () => {
  assert.equal(
    webSourceFavicon({ icon: "https://cdn.example.com/f.ico" }, "example.com"),
    "https://cdn.example.com/f.ico",
  );
  assert.match(webSourceFavicon({}, "nejm.org"), /google\.com\/s2\/favicons\?domain=nejm\.org/);
  assert.equal(webSourceFavicon({ icon: "javascript:alert(1)" }, "nejm.org").includes("javascript"), false);
  assert.equal(webSourceFavicon({}, ""), "");
});

// ── webSearchProviderChips：运行中脉冲 / 完成回执 / 失败灰态 ────

test("webSearchProviderChips：运行中 = 计划源全脉冲", () => {
  const chips = webSearchProviderChips({ input: { mode: "daily" }, running: true });
  assert.deepEqual(chips.map((c) => c.provider), ["kimi", "zhipu"]);
  assert.ok(chips.every((c) => c.state === "running"));
});

test("webSearchProviderChips：数据层回执 providers/skipped 时升级为 done/skipped", () => {
  const chips = webSearchProviderChips({
    input: { mode: "comprehensive" },
    running: true,
    output: {
      providers: ["kimi"],
      skipped: [{ provider: "perplexity", reason: "未配置" }],
    },
  });
  assert.equal(chips.find((c) => c.provider === "kimi")?.state, "done");
  assert.equal(chips.find((c) => c.provider === "zhipu")?.state, "running");
  const skipped = chips.find((c) => c.provider === "perplexity");
  assert.equal(skipped?.state, "skipped");
  assert.equal(skipped?.reason, "未配置");
});

test("webSearchProviderChips：完成后有回执 → 勾+灰；无回执 → 不显示（不拿计划冒充已搜）", () => {
  const done = webSearchProviderChips({
    input: { mode: "daily" },
    running: false,
    output: { providers: ["kimi", "zhipu"], skipped: [{ provider: "kimi", reason: "x" }] },
  });
  assert.deepEqual(
    done.map((c) => `${c.provider}:${c.state}`),
    ["kimi:done", "zhipu:done"], // 同时出现在 used+skipped 时按成功算
  );
  assert.deepEqual(webSearchProviderChips({ input: { mode: "daily" }, running: false, output: {} }), []);
});

test("webSearchProviderChips：整次失败 → 计划源全灰 + 原因", () => {
  const chips = webSearchProviderChips({ input: { providers: ["perplexity"] }, running: false, errorText: "timeout" });
  assert.deepEqual(chips, [{ provider: "perplexity", state: "skipped", reason: "timeout" }]);
});
