import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { __resetBodySearchCacheForTests, bodySearchCacheBytes, bodySearchCacheRevision, bodySearchCacheSize, searchSubjectBody } from "@/lib/search/bodySearch";
import { buildGlobalSearchIndex } from "@/lib/search/globalSearch";
import { contentTree } from "@/lib/content-data/manifest";

test("searchSubjectBody 能按正文片段跨章节命中", () => {
  const hits = searchSubjectBody("histology", "被覆上皮");
  assert.ok(hits.length > 0, "组织学正文应能搜到被覆上皮");
  assert.ok(hits.every((hit) => hit.kind === "body"));
  assert.ok(hits.every((hit) => hit.subjectId === "histology"));
  assert.ok(hits.some((hit) => hit.snippet.includes("被覆上皮")));
});

test("searchSubjectBody 跨科目：概率论正文能搜到由果溯因", () => {
  const hits = searchSubjectBody("probability", "由果溯因");
  assert.ok(hits.length > 0, "概率论详解正文应能搜到由果溯因");
  assert.ok(hits.some((hit) => hit.snippet.includes("由果溯因")));
  assert.ok(hits.every((hit) => hit.href?.startsWith("/probability/")));
});

test("searchSubjectBody 不命中 HTML / artifact 形态", () => {
  const htmlPhrase = "微积分可视化教学系统";
  const otherHits = searchSubjectBody("other", htmlPhrase);
  const probabilityHits = searchSubjectBody("probability", htmlPhrase);
  assert.equal(otherHits.length, 0, "other 下的公式/真题 HTML 不应进正文检索");
  assert.equal(probabilityHits.length, 0);

  const index = buildGlobalSearchIndex(contentTree);
  assert.ok(!index.some((entry) => entry.title.includes("概率论公式")));
});

test("searchSubjectBody 不把课堂 notes.html 里的样式词当正文", () => {
  const hits = searchSubjectBody("histology", "Noto Serif CJK SC");
  assert.equal(hits.length, 0);
});

test("searchSubjectBody 暖查询复用剥好的正文，不再扩缓存", () => {
  __resetBodySearchCacheForTests();
  searchSubjectBody("histology", "被覆上皮");
  const warmed = bodySearchCacheSize();
  assert.ok(warmed > 0);
  searchSubjectBody("histology", "上皮");
  assert.equal(bodySearchCacheSize(), warmed);
});

test("正文缓存随索引内容修订失效且受字节预算约束", () => {
  const previous = process.env.SEARCH_INDEX_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "body-search-revision-"));
  const writeRevision = (hash: string) => fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ version: 2, contentHash: hash }));
  try {
    process.env.SEARCH_INDEX_DIR = dir;
    __resetBodySearchCacheForTests();
    writeRevision("a".repeat(64));
    searchSubjectBody("histology", "被覆上皮");
    assert.equal(bodySearchCacheRevision(), "a".repeat(64));
    assert.ok(bodySearchCacheSize() > 0);
    writeRevision("b".repeat(64));
    searchSubjectBody("probability", "由果溯因");
    assert.equal(bodySearchCacheRevision(), "b".repeat(64));
    assert.ok(bodySearchCacheBytes() <= 32 * 1024 * 1024);
  } finally {
    if (previous === undefined) delete process.env.SEARCH_INDEX_DIR;
    else process.env.SEARCH_INDEX_DIR = previous;
    __resetBodySearchCacheForTests();
  }
});
