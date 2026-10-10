import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenize } from "./bm25Store.ts";

test("tokenize：纯中文按单字 + bigram 分词", () => {
  const tokens = tokenize("牛顿运动");
  // 单字：牛、顿、运、动 + bigram：牛顿、顿运、运动
  assert.ok(tokens.includes("牛"));
  assert.ok(tokens.includes("顿"));
  assert.ok(tokens.includes("运"));
  assert.ok(tokens.includes("动"));
  assert.ok(tokens.includes("牛顿"));
  assert.ok(tokens.includes("运动"));
});

test("tokenize：纯英文按空格分词并转小写", () => {
  const tokens = tokenize("Newton Laws");
  assert.ok(tokens.includes("newton"));
  assert.ok(tokens.includes("laws"));
});

test("tokenize：中英混合分别处理", () => {
  const tokens = tokenize("牛顿 Newton");
  assert.ok(tokens.includes("牛"));
  assert.ok(tokens.includes("newton"));
  // bigram 只在相邻中文字符间生成
  assert.ok(tokens.includes("牛顿"));
});

test("tokenize：空字符串返回空数组", () => {
  assert.deepEqual(tokenize(""), []);
});

test("tokenize：纯标点返回空数组", () => {
  assert.deepEqual(tokenize("，。！"), []);
});

test("tokenize：数字作为英文 token", () => {
  const tokens = tokenize("F = ma 9.8");
  assert.ok(tokens.includes("f"));
  assert.ok(tokens.includes("ma"));
  // 9 和 8 被 . 分隔
  assert.ok(tokens.includes("9"));
  assert.ok(tokens.includes("8"));
});

test("tokenize：单个中文字符不生成 bigram", () => {
  const tokens = tokenize("力");
  assert.deepEqual(tokens, ["力"]);
});
