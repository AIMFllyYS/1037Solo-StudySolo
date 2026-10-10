import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildStudyTools, createToolRuntime } from "./tools/server.ts";
import { resetIndexHealthCache } from "../search/indexes/indexHealth.ts";

test("searchNotes：索引缺失时返回「检索索引未加载」而不是「未检索到相关内容」", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-index-"));
  const prevDir = process.env.SEARCH_INDEX_DIR;
  const prevSkip = process.env.SEARCH_SKIP_CONTENT_HASH;
  process.env.SEARCH_INDEX_DIR = dir;
  process.env.SEARCH_SKIP_CONTENT_HASH = "1";
  resetIndexHealthCache();
  try {
    const tools = buildStudyTools(
      {
        subjectId: "cell-biology",
        categoryId: "textbook",
        itemId: "ch01-1",
        skills: [],
        academicYear: "sophomore-1",
      },
      createToolRuntime(),
      { enableSearch: false },
    );
    const result = await tools.searchNotes.execute!(
      { query: "绪论" },
      { toolCallId: "t1", messages: [], abortSignal: new AbortController().signal, context: {} },
    );
    assert.match(result.text, /检索索引未加载/);
    assert.equal(result.hits.length, 0);
    assert.doesNotMatch(result.text, /未检索到相关内容/);
  } finally {
    if (prevDir === undefined) delete process.env.SEARCH_INDEX_DIR;
    else process.env.SEARCH_INDEX_DIR = prevDir;
    if (prevSkip === undefined) delete process.env.SEARCH_SKIP_CONTENT_HASH;
    else process.env.SEARCH_SKIP_CONTENT_HASH = prevSkip;
    resetIndexHealthCache();
  }
});
