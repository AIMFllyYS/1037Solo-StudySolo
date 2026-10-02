import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getIndexHealth, resetIndexHealthCache } from "./indexHealth.ts";

function withIndexDir(dir: string, fn: () => void) {
  const prev = process.env.SEARCH_INDEX_DIR;
  const skip = process.env.SEARCH_SKIP_CONTENT_HASH;
  process.env.SEARCH_INDEX_DIR = dir;
  process.env.SEARCH_SKIP_CONTENT_HASH = "1";
  resetIndexHealthCache();
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.SEARCH_INDEX_DIR;
    else process.env.SEARCH_INDEX_DIR = prev;
    if (skip === undefined) delete process.env.SEARCH_SKIP_CONTENT_HASH;
    else process.env.SEARCH_SKIP_CONTENT_HASH = skip;
    resetIndexHealthCache();
  }
}

test("indexHealth：缺文件判定为未加载", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-"));
  withIndexDir(dir, () => {
    const health = getIndexHealth(true);
    assert.equal(health.ok, false);
    assert.match(health.reason, /缺少/);
  });
});

test("indexHealth：manifest version 不符", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-"));
  for (const name of ["manifest.json", "bm25.json", "chunks-meta.json", "vectors.bin", "vectors.ids.json"]) {
    fs.writeFileSync(path.join(dir, name), name === "manifest.json" ? '{"version":1}' : "x");
  }
  withIndexDir(dir, () => {
    const health = getIndexHealth(true);
    assert.equal(health.ok, false);
    assert.match(health.reason, /version/);
  });
});

test("indexHealth：vectors.bin 字节数不齐", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-"));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    version: 2,
    builtAt: "2026-09-08T00:00:00Z",
    embeddingModel: "BAAI/bge-m3",
    dimension: 1024,
    chunkCount: 2,
    vectorCount: 2,
    contentHash: "abc",
    files: [],
  }));
  fs.writeFileSync(path.join(dir, "bm25.json"), "{}");
  fs.writeFileSync(path.join(dir, "chunks-meta.json"), "{}");
  fs.writeFileSync(path.join(dir, "vectors.bin"), Buffer.alloc(16));
  fs.writeFileSync(path.join(dir, "vectors.ids.json"), "[]");
  withIndexDir(dir, () => {
    const health = getIndexHealth(true);
    assert.equal(health.ok, false);
    assert.match(health.reason, /字节数/);
  });
});

test("indexHealth：模型不符", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-"));
  const prevModel = process.env.AI_EMBEDDING_MODEL;
  process.env.AI_EMBEDDING_MODEL = "other-model";
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    version: 2,
    builtAt: "2026-09-08T00:00:00Z",
    embeddingModel: "BAAI/bge-m3",
    dimension: 4,
    chunkCount: 1,
    vectorCount: 1,
    contentHash: "abc",
    files: [],
  }));
  fs.writeFileSync(path.join(dir, "bm25.json"), "{}");
  fs.writeFileSync(path.join(dir, "chunks-meta.json"), "{}");
  fs.writeFileSync(path.join(dir, "vectors.bin"), Buffer.alloc(16));
  fs.writeFileSync(path.join(dir, "vectors.ids.json"), "[]");
  withIndexDir(dir, () => {
    const health = getIndexHealth(true);
    assert.equal(health.ok, false);
    assert.match(health.reason, /嵌入模型不一致/);
  });
  if (prevModel === undefined) delete process.env.AI_EMBEDDING_MODEL;
  else process.env.AI_EMBEDDING_MODEL = prevModel;
});

test("indexHealth：有效索引的请求检查只看元数据，不做全文分块", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-light-"));
  const manifest = {
    version: 2, builtAt: "2026-10-02T00:00:00Z",
    embeddingModel: process.env.AI_EMBEDDING_MODEL || "BAAI/bge-m3",
    dimension: 4, chunkCount: 1, vectorCount: 1,
    contentHash: "a".repeat(64), files: [],
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  for (const file of ["bm25.json", "chunks-meta.json", "vectors.ids.json"]) fs.writeFileSync(path.join(dir, file), "{}");
  fs.writeFileSync(path.join(dir, "vectors.bin"), Buffer.alloc(16));
  withIndexDir(dir, () => {
    delete process.env.SEARCH_SKIP_CONTENT_HASH;
    const health = getIndexHealth(true);
    assert.equal(health.ok, true);
    assert.equal(health.contentHashMatch, null);
  });
});
