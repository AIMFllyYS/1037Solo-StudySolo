import assert from "node:assert/strict";
import { test } from "node:test";
import { expandShortQuery, rrfMerge } from "./hybridSearch.ts";
import type { ScoredChunk } from "./indexes/vectorStore.ts";

function makeChunk(id: string, path: string): ScoredChunk {
  return {
    id,
    path,
    subjectId: "test",
    subjectName: "测试",
    categoryId: "detail",
    itemId: "1.1",
    title: "title",
    chunkIndex: 0,
    text: "text",
    score: 0,
  };
}

test("expandShortQuery：两字中文查询拼上当前页标题", () => {
  assert.equal(expandShortQuery("绪论", "医学细胞生物学 第一章 绪论"), "医学细胞生物学 第一章 绪论 绪论");
  assert.equal(expandShortQuery("被覆上皮", "组织学"), "被覆上皮");
  assert.equal(expandShortQuery("绪论", undefined), "绪论");
});

test("rrfMerge：单路排序直接返回（分数为 RRF 值）", () => {
  const a = makeChunk("a", "path-a");
  const b = makeChunk("b", "path-b");
  const merged = rrfMerge([[a, b]]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "a");
  assert.equal(merged[1].id, "b");
  // rank 0: 1/(60+0+1) = 1/61
  assert.ok(Math.abs(merged[0].score - 1 / 61) < 1e-10);
  // rank 1: 1/(60+1+1) = 1/62
  assert.ok(Math.abs(merged[1].score - 1 / 62) < 1e-10);
});

test("rrfMerge：两路排序中相同 id 分数累加", () => {
  const a = makeChunk("a", "path-a");
  const b = makeChunk("b", "path-b");
  // 两路都把 a 排第一
  const merged = rrfMerge([[a, b], [a, b]]);
  assert.equal(merged[0].id, "a");
  // a 的分数 = 2 * (1/61)
  assert.ok(Math.abs(merged[0].score - 2 / 61) < 1e-10);
});

test("rrfMerge：不同路有不同 id 时合并", () => {
  const a = makeChunk("a", "path-a");
  const b = makeChunk("b", "path-b");
  const c = makeChunk("c", "path-c");
  const merged = rrfMerge([[a, b], [b, c]]);
  assert.equal(merged.length, 3);
  // b 在两路都出现，分数最高
  assert.equal(merged[0].id, "b");
});

test("rrfMerge：空输入返回空数组", () => {
  assert.deepEqual(rrfMerge([]), []);
  assert.deepEqual(rrfMerge([[]]), []);
});

test("rrfMerge：自定义 k 值影响分数", () => {
  const a = makeChunk("a", "path-a");
  const merged = rrfMerge([[a]], 10);
  // 1/(10+0+1) = 1/11
  assert.ok(Math.abs(merged[0].score - 1 / 11) < 1e-10);
});

test("rrfMerge：结果按分数降序排列", () => {
  const a = makeChunk("a", "path-a");
  const b = makeChunk("b", "path-b");
  const c = makeChunk("c", "path-c");
  // 第一路：a > b > c，第二路：c > a
  // a: 1/61 + 1/62, b: 1/62, c: 1/63 + 1/61
  const merged = rrfMerge([[a, b, c], [c, a]]);
  assert.equal(merged.length, 3);
  // 确保降序
  for (let i = 1; i < merged.length; i++) {
    assert.ok(merged[i - 1].score >= merged[i].score);
  }
});
