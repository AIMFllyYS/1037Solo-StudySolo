import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSET_KINDS,
  assetCounts,
  assetOriginLabel,
  buildAssetItems,
  filterAssets,
  formatAssetSize,
  matchesAssetQuery,
  sortAssetItems,
  type AssetSources,
} from "./assetCatalog.ts";

const sources: AssetSources = {
  notes: [
    {
      id: "n1",
      title: "组胚笔记",
      markdown: "# 组胚",
      subjectId: "histology",
      createdAt: 10,
      updatedAt: 50,
      kind: "personal",
    },
  ],
  cards: [
    {
      id: "c1",
      subjectId: "histology",
      sourceLabel: "组织学 / 详解 / 上皮",
      originalText: "被覆上皮的分类",
      cardType: "qa",
      front: "被覆上皮怎么分？",
      back: "按细胞层数",
      status: "ready",
      createdAt: 30,
    },
  ],
  documents: [
    {
      id: "d1",
      spec: { title: "上皮综述", format: "markdown", genre: "article", brief: "" },
      sections: [{ title: "一", status: "done", markdown: "正文" }],
      status: "done",
      createdAt: 20,
      updatedAt: 40,
    },
  ],
  artifacts: [{ id: "a1", title: "可拖动演示", html: "<html></html>", status: "done" }],
  imports: [
    {
      id: "i1",
      kind: "file",
      name: "lecture.pdf",
      absPath: "D:\\课件\\lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      source: "composer",
      createdAt: 60,
      updatedAt: 60,
    },
    {
      id: "i2",
      kind: "url",
      name: "example.com",
      title: "网址 · example.com",
      url: "https://example.com/x",
      source: "window-taskbar",
      createdAt: 70,
      updatedAt: 70,
    },
  ],
  cloudRow: (kind, id) => (kind === "user-note" && id === "n1" ? true : kind === "review-card" ? false : null),
};

test("六类来源都能摊平成资产，标题与副标题有内容", () => {
  const items = buildAssetItems(sources);
  assert.equal(items.length, 6);
  const kinds = new Set(items.map((item) => item.kind));
  for (const kind of ASSET_KINDS.filter(kind=>kind!=="classroom")) assert.ok(kinds.has(kind), `缺少 ${kind}`);
  const note = items.find((item) => item.kind === "note");
  assert.equal(note?.title, "组胚笔记");
  assert.match(note?.subtitle ?? "", /组胚|个人笔记/);
  const file = items.find((item) => item.kind === "file");
  assert.equal(file?.sizeBytes, 2048);
  assert.equal(file?.meta?.absPath, "D:\\课件\\lecture.pdf");
  const url = items.find((item) => item.kind === "url");
  assert.equal(url?.meta?.url, "https://example.com/x");
  assert.equal(url?.title, "网址 · example.com");
});

test("同步角标：已同步 / 仅本机 / 没对过账不显示；导入记录只在本机", () => {
  const items = buildAssetItems(sources);
  const byKind = (kind: string) => items.find((item) => item.kind === kind);
  assert.equal(byKind("note")?.origin, "both");
  assert.equal(assetOriginLabel("both"), "已同步");
  assert.equal(byKind("flashcard")?.origin, "local");
  assert.equal(assetOriginLabel("local"), "仅本机");
  assert.equal(byKind("document")?.origin, "unknown");
  assert.equal(assetOriginLabel("unknown"), null);
  assert.equal(byKind("file")?.origin, "local");
  assert.equal(byKind("url")?.origin, "local");
});

test("产物没有时间戳：用写入顺序当排序键", () => {
  const items = buildAssetItems({ ...sources, artifacts: [
    { id: "a1", title: "旧", html: "", status: "done" },
    { id: "a2", title: "新", html: "", status: "done" },
  ] });
  const arts = sortAssetItems(items.filter((item) => item.kind === "artifact"));
  assert.deepEqual(arts.map((item) => item.title), ["新", "旧"]);
});

test("筛选：按类型、按关键词、按名称排序", () => {
  const items = buildAssetItems(sources);
  assert.equal(filterAssets(items, { kind: "note" }).length, 1);
  assert.equal(filterAssets(items, { kind: "all" }).length, 6);
  assert.deepEqual(
    filterAssets(items, { query: "lecture" }).map((item) => item.kind),
    ["file"],
  );
  assert.deepEqual(
    filterAssets(items, { query: "example.com" }).map((item) => item.kind),
    ["url"],
  );
  const byTitle = filterAssets(items, { sort: "title" });
  assert.ok(byTitle.length === items.length);
  // 最近更新排序：导入记录时间戳最大，排最前
  assert.equal(filterAssets(items, { sort: "recent" })[0].kind, "url");
  assert.equal(matchesAssetQuery(items[0], "  "), true);
});

test("计数：全部 + 每类，未知类型不会算进来", () => {
  const counts = assetCounts(buildAssetItems(sources));
  assert.equal(counts.all, 6);
  assert.equal(counts.byKind.note, 1);
  assert.equal(counts.byKind.flashcard, 1);
  assert.equal(counts.byKind.file, 1);
  assert.equal(assetCounts([]).all, 0);
});

test("体积格式化：空值不显示", () => {
  assert.equal(formatAssetSize(undefined), null);
  assert.equal(formatAssetSize(0), null);
  assert.equal(formatAssetSize(512), "512 B");
  assert.equal(formatAssetSize(2048), "2 KB");
  assert.equal(formatAssetSize(3 * 1024 * 1024), "3.0 MB");
});

test("classroom sessions join the existing asset catalog with owner-local/cloud provenance",()=>{
 const items=buildAssetItems({...sources,classrooms:[{id:"class-1",title:"课堂记录",updatedAt:"2026-09-27T00:00:00Z",origin:"both"}]});
 const classroom=items.find(item=>item.kind==="classroom");
 assert.equal(classroom?.title,"课堂记录");assert.equal(classroom?.origin,"both");assert.equal(assetCounts(items).byKind.classroom,1);
});
