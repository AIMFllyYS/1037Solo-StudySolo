import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_SEARCH_UNCONFIGURED_TEXT, searchImages, trackPhotoDownload } from "./imageSearch.ts";

test("searchImages：无 API key 时标记未配置，而不是伪装成没搜到", async () => {
  assert.match(IMAGE_SEARCH_UNCONFIGURED_TEXT, /未配置/);
  assert.doesNotMatch(IMAGE_SEARCH_UNCONFIGURED_TEXT, /未找到/);
  if (process.env.UNSPLASH_ACCESS_KEY) return;
  const result = await searchImages("test query");
  assert.equal(result.configured, false);
  assert.deepEqual(result.results, []);
});

test("searchImages：空 query 返回空结果且不抛错", async () => {
  const result = await searchImages("");
  assert.deepEqual(result.results, []);
});

test("trackPhotoDownload：空 URL 时不抛错", async () => {
  await trackPhotoDownload("");
});
