import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { classTranscriptIo, createSearchClassTranscriptTool } from "./tool";
import { createToolRuntime, type StudyToolContext } from "@/lib/ai/agent/tools/_shared";
import { buildStudyTools } from "@/lib/ai/agent/tools/server";
import type { SearchClassTranscriptOutput } from "./types";

const CURRENT = "11111111-1111-4111-8111-111111111111";
const realIo = { ...classTranscriptIo };

function ctx(overrides: Partial<StudyToolContext> = {}): StudyToolContext {
  return {
    subjectId: "calculus",
    categoryId: "",
    itemId: "",
    skills: [],
    academicYear: "sophomore-1" as never,
    userId: "user-1",
    classContext: {
      sessionId: CURRENT,
      title: "导数",
      live: true,
      outline: ["导数定义"],
      recent: [{ id: "live-1", seq: 9, text: "刚才说：可导一定连续，但连续不一定可导。" }],
    },
    ...overrides,
  };
}

async function run(tool: ReturnType<typeof createSearchClassTranscriptTool>, input: { query: string; scope?: "current" | "past" }) {
  return (await tool.execute!(input, { toolCallId: "t", messages: [], context: undefined as never })) as SearchClassTranscriptOutput;
}

afterEach(() => Object.assign(classTranscriptIo, realIo));

describe("searchClassTranscript", () => {
  test("merges stored rows with the live tail so just-spoken segments are searchable", async () => {
    classTranscriptIo.loadSegments = async () => new Map([[CURRENT, [{ id: "db-1", seq: 1, text: "导数描述瞬时变化率。" }]]]);
    const out = await run(createSearchClassTranscriptTool(ctx(), createToolRuntime()), { query: "可导 连续" });
    assert.equal(out.hits[0]?.segmentId, "live-1");
    assert.equal(out.hits[0]?.sessionId, CURRENT);
    assert.equal(out.hits[0]?.citeIndex, 1);
    assert.match(out.text, /\[1\]/);
  });

  test("searches past classes excluding the current one, best hit of each class first", async () => {
    let requested: readonly string[] = [];
    classTranscriptIo.listSessions = async () => [
      { id: CURRENT, title: "导数" },
      { id: "s1", title: "定积分" },
      { id: "s3", title: "反常积分" },
    ];
    classTranscriptIo.loadSegments = async (_user, ids) => {
      requested = ids;
      return new Map([
        ["s1", [{ id: "a", seq: 1, text: "定积分表示曲线下方的面积。" }, { id: "b", seq: 2, text: "定积分的性质与面积" }]],
        ["s3", [{ id: "d", seq: 1, text: "无穷区间上的定积分也可以表示面积" }]],
      ]);
    };
    const out = await run(createSearchClassTranscriptTool(ctx(), createToolRuntime()), { query: "定积分 面积", scope: "past" });
    assert.deepEqual([...requested], ["s1", "s3"]);
    assert.deepEqual(out.hits.slice(0, 2).map((h) => h.sessionId).sort(), ["s1", "s3"]);
    assert.match(out.text, /《定积分》/);
  });

  test("without a class context it explains instead of reading the database", async () => {
    classTranscriptIo.loadSegments = async () => {
      throw new Error("must not read");
    };
    const out = await run(createSearchClassTranscriptTool(ctx({ classContext: undefined }), createToolRuntime()), { query: "导数" });
    assert.equal(out.hits.length, 0);
  });

  test("is only exposed when the request carries a class context", () => {
    const opts = { enableSearch: false };
    assert.ok(Object.keys(buildStudyTools(ctx(), createToolRuntime(), opts)).includes("searchClassTranscript"));
    assert.ok(!Object.keys(buildStudyTools(ctx({ classContext: undefined }), createToolRuntime(), opts)).includes("searchClassTranscript"));
  });
});
