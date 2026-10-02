import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolRuntime, type StudyToolContext } from "@/lib/ai/agent/tools/_shared";
import { createSearchNotesTool, searchNotesIo } from "./tool.ts";
import type { SearchNotesOutput } from "./types.ts";

const ctx: StudyToolContext = {
  subjectId: "probability",
  categoryId: "detail",
  itemId: "1.4",
  skills: [],
  academicYear: "freshman-2",
};

const execOpts = {
  toolCallId: "t1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

const hit = {
  subjectId: "anatomy",
  subjectName: "系统解剖学",
  categoryId: "textbook",
  itemId: "ch01-1",
  title: "骨学",
  snippet: "长骨",
  path: "anatomy/textbook/ch01-1",
};

test("searchNotes：默认学年无命中时放宽到跨学年", async (t) => {
  t.mock.method(searchNotesIo, "getIndexHealth", () => ({
    ok: true,
    reason: "",
    manifest: null,
    contentHashMatch: true,
    embeddingReachable: true,
  }));
  const years: unknown[] = [];
  t.mock.method(searchNotesIo, "searchAllContent", async (_q: string, opts: { academicYear?: string }) => {
    years.push(opts.academicYear);
    return opts.academicYear === "all" ? [hit] : [];
  });
  t.mock.method(searchNotesIo, "findContentItem", () => undefined);
  const result = (await createSearchNotesTool(ctx, createToolRuntime()).execute!(
    { query: "长骨" },
    execOpts,
  )) as SearchNotesOutput;
  assert.deepEqual(years, ["freshman-2", "all"]);
  assert.match(result.text, /当前学年无命中/);
  assert.equal(result.hits[0]?.path, "anatomy/textbook/ch01-1");
  assert.equal(result.hits[0]?.citeIndex, 1);
  assert.match(result.text, /\[1\] 骨学/);
});

test("searchNotes：crossYear 不二次放宽；相同 query 去重", async (t) => {
  t.mock.method(searchNotesIo, "getIndexHealth", () => ({
    ok: true,
    reason: "",
    manifest: null,
    contentHashMatch: true,
    embeddingReachable: true,
  }));
  const years: unknown[] = [];
  t.mock.method(searchNotesIo, "searchAllContent", async (_q: string, opts: { academicYear?: string }) => {
    years.push(opts.academicYear);
    return [hit];
  });
  t.mock.method(searchNotesIo, "findContentItem", () => undefined);
  const runtime = createToolRuntime();
  const tool = createSearchNotesTool(ctx, runtime);
  const first = (await tool.execute!({ query: "长骨", crossYear: true }, execOpts)) as SearchNotesOutput;
  const second = (await tool.execute!({ query: "长骨", crossYear: true }, execOpts)) as SearchNotesOutput;
  assert.deepEqual(years, ["all", "all"]);
  assert.doesNotMatch(first.text, /当前学年无命中/);
  assert.equal(second.deduped, true);
});

test("searchNotes：学年内无命中且跨学年也空 → 未检索到", async (t) => {
  t.mock.method(searchNotesIo, "getIndexHealth", () => ({
    ok: true,
    reason: "",
    manifest: null,
    contentHashMatch: true,
    embeddingReachable: true,
  }));
  t.mock.method(searchNotesIo, "searchAllContent", async () => []);
  t.mock.method(searchNotesIo, "findContentItem", () => undefined);
  const result = (await createSearchNotesTool(ctx, createToolRuntime()).execute!(
    { query: "不存在的知识点xyz" },
    execOpts,
  )) as SearchNotesOutput;
  assert.match(result.text, /未检索到相关内容/);
  assert.equal(result.hits.length, 0);
});

test("searchNotes：并发请求只使用各自检索返回的诊断", async (t) => {
  t.mock.method(searchNotesIo, "getIndexHealth", () => ({
    ok: true, reason: "", manifest: null, contentHashMatch: null, embeddingReachable: null,
  }));
  t.mock.method(searchNotesIo, "findContentItem", () => undefined);
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  t.mock.method(searchNotesIo, "searchAllContent", async (query: string, opts: { onDiagnostics?: (value: unknown) => void }) => {
    if (query === "first") await gate;
    opts.onDiagnostics?.({ mode: "keyword", bm25Hits: query === "first" ? 11 : 22, vecHits: 0, merged: 1, reranked: 0, final: 1, filter: {}, ms: 3 });
    return [hit];
  });
  const first = createSearchNotesTool(ctx, createToolRuntime()).execute!({ query: "first", crossYear: true }, execOpts);
  const second = createSearchNotesTool(ctx, createToolRuntime()).execute!({ query: "second", crossYear: true }, execOpts);
  const secondResult = await second as SearchNotesOutput;
  releaseFirst();
  const firstResult = await first as SearchNotesOutput;
  assert.equal(firstResult.diagnostics?.bm25Hits, 11);
  assert.equal(secondResult.diagnostics?.bm25Hits, 22);
});
