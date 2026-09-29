import assert from "node:assert/strict";
import { test } from "node:test";

import { buildClassQuizPrompt } from "./classSources.ts";

test("class quiz prompt carries outline and transcript of the chosen class", () => {
  const prompt = buildClassQuizPrompt("定积分", {
    transcript: [{ text: "定积分表示曲线下方的面积。" }, { text: "牛顿-莱布尼茨公式。" }],
    outline: { outline: { nodes: [{ title: "定积分" }, { title: "几何意义", parentId: "x" }] } },
  });
  assert.match(prompt, /课程：定积分/);
  assert.match(prompt, /- 定积分\n {2}- 几何意义/);
  assert.match(prompt, /牛顿-莱布尼茨公式/);
  assert.match(prompt, /不要超纲/);
});

test("long transcripts keep the most recent part within the budget", () => {
  const long = "甲".repeat(50) + "乙".repeat(50);
  const prompt = buildClassQuizPrompt("x", { transcript: [{ text: long }] }, 50);
  assert.ok(prompt.includes("乙".repeat(50)));
  assert.ok(!prompt.includes("甲"));
});

test("missing data degrades to explicit placeholders", () => {
  const prompt = buildClassQuizPrompt("空课", {});
  assert.match(prompt, /课堂大纲：\n（无）/);
  assert.match(prompt, /课堂文稿（节选）：\n（无）/);
});
