import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import {
  DEFAULT_SESSION_TITLE_MODEL,
  SESSION_TITLE_SYSTEM_PROMPT,
  buildFallbackSessionTitle,
  sanitizeGeneratedTitle,
  sanitizeSessionTitle,
} from "@/lib/chat/session/sessionTitle";

const root = process.cwd();

test("session title generator defaults to relay GLM-5.3 Flash", () => {
  assert.equal(DEFAULT_SESSION_TITLE_MODEL, "z-ai/glm-5.3-flash");
});

test("sanitizeSessionTitle returns one-line plain text around twenty Chinese characters", () => {
  const title = sanitizeSessionTitle("《那个分子和青蒿素背后的化学逻辑：从结构到反应》\n解释如下：");

  assert.equal(title, "那个分子和青蒿素背后的化学逻辑：从结构");
  assert.ok(!/[《》\n\r]/.test(title));
  assert.ok(title.length <= 22);
});

test("buildFallbackSessionTitle strips quotes and collapses whitespace", () => {
  const title = buildFallbackSessionTitle("  针对当前页面这段原文：\n\n> 样本空间 Ω 与事件 A\n\n请总结一下  ");

  assert.equal(title, "样本空间 Ω 与事件 A 请总结一下");
});

test("sanitizeGeneratedTitle：删掉所有符号，并收口到 20 字以内", () => {
  assert.equal(
    sanitizeGeneratedTitle("《青蒿素的结构与反应：一次完整的推导》"),
    "青蒿素的结构与反应一次完整的推导",
  );
  // 逗号、顿号、冒号、括号、emoji、空格全部去掉；汉字本身（如"的"）当然保留。
  assert.equal(
    sanitizeGeneratedTitle('标题：熵增、焓变（热力学）✨ 的核心'),
    "熵增焓变热力学的核心",
  );
  // 超过 20 字按码点截断（不会切出半个 emoji）。
  const long = sanitizeGeneratedTitle("一二三四五六七八九十一二三四五六七八九十一二三四五");
  assert.equal([...long].length, 20);
  // 太空的标题不可用 → 退回本地兜底。
  assert.equal(sanitizeGeneratedTitle("《》✨", "新对话"), "新对话");
  assert.equal(sanitizeGeneratedTitle("", "新对话"), "新对话");
});

test("标题提示词写明 10–20 字且不允许符号", () => {
  assert.match(SESSION_TITLE_SYSTEM_PROMPT, /10~20 个字/);
  assert.match(SESSION_TITLE_SYSTEM_PROMPT, /不要任何标点或符号/);
});

test("chat-title：优先走廉价快速模型，失败才回落到原来的中转路径", () => {
  const route = readFileSync(join(root, "app/api/chat-title/route.ts"), "utf8");
  assert.match(route, /fastModelConfig/);
  assert.match(route, /callFastModel/);
  assert.match(route, /sanitizeGeneratedTitle/);
  // 回落路径必须还在：快速模型没配时不能连标题都不生成。
  assert.match(route, /resolveLanguageModel\("custom", provider, \{ platformManagedCredentials: true \}\)/);
});

test("useChat generates first-turn titles through the lightweight title endpoint", () => {
  const hook = readFileSync(join(root, "lib/hooks/chat/useChat.ts"), "utf8");
  const helper = readFileSync(join(root, "lib/chat/session/kickoffSessionTitle.ts"), "utf8");

  assert.match(hook, /kickoffSessionTitle/);
  assert.match(helper, /\/api\/chat-title/);
  assert.match(helper, /buildFallbackSessionTitle/);
  assert.doesNotMatch(helper, /content\.slice\(0,\s*15\)/);
});
