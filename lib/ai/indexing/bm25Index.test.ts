import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bm25DocumentText,
  buildCompactBm25Index,
  parseBm25Index,
  shortTitleForIndex,
  tokenize,
} from "./bm25Index.ts";

test("shortTitleForIndex：去掉科目与板块前缀", () => {
  assert.equal(
    shortTitleForIndex("医学细胞生物学 > 教材 > 第一章　绪论 > ch01-1 第一节　细胞生物学概述"),
    "第一章　绪论 ch01-1 第一节　细胞生物学概述",
  );
});

test("bm25DocumentText：章节名重复两次以提权", () => {
  const text = bm25DocumentText("医学细胞生物学 > 教材 > 第一章　绪论", "细胞膜是...");
  assert.match(text, /第一章　绪论 第一章　绪论/);
  assert.match(text, /细胞膜是/);
});

test("tokenize：纯中文按单字 + bigram 分词", () => {
  const tokens = tokenize("牛顿运动");
  assert.ok(tokens.includes("牛顿"));
  assert.ok(tokens.includes("运动"));
});

test("buildCompactBm25Index + parseBm25Index：标题词可被检索", () => {
  const compact = buildCompactBm25Index([
    { id: "cell-biology/textbook/ch01-1#0", title: "医学细胞生物学 > 教材 > 第一章　绪论", text: "细胞膜由脂质双层构成。" },
    { id: "anatomy/textbook/ch00-1#0", title: "系统解剖学 > 教材 > 绪论", text: "人体由多个系统组成。" },
  ]);
  assert.equal(compact.version, 3);
  assert.equal(compact.ids.length, 2);
  const runtime = parseBm25Index(compact);
  assert.ok(runtime);
  assert.equal(runtime!.format,'compact');
  if(runtime?.format!=='compact')return;
  assert.ok(runtime!.invertedIndex["绪论"]);
  assert.ok(runtime.invertedIndex["绪论"].postings instanceof Uint32Array);
  assert.ok([...runtime.invertedIndex["绪论"].postings].some((index,position)=>position%2===0&&runtime.ids[index].includes("cell-biology")));
});

test("parseBm25Index：兼容旧版字符串 posting", () => {
  const runtime = parseBm25Index({
    builtAt: "2026-06-23T00:00:00Z",
    avgDocLen: 10,
    docCount: 1,
    invertedIndex: { 力: { df: 1, postings: [{ id: "probability/detail/1.1#0", tf: 2 }] } },
    docLengths: { "probability/detail/1.1#0": 10 },
  });
  assert.equal(runtime?.format,'legacy');
  if(runtime?.format==='legacy')assert.equal(runtime.invertedIndex["力"].postings[0].id, "probability/detail/1.1#0");
});
