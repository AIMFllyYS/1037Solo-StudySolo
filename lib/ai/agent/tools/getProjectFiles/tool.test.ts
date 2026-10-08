import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createGetProjectFilesTool } from "@/lib/ai/agent/tools/getProjectFiles/tool";
import type { StudyToolContext } from "@/lib/ai/agent/tools/_shared";
import type { GetProjectFilesOutput } from "@/lib/ai/agent/tools/getProjectFiles/types";

function ctxWith(carriedIds: string[]): StudyToolContext {
  return {
    subjectId: "instrumental-analysis",
    categoryId: "textbook",
    itemId: "ch01-1",
    skills: [],
    academicYear: "sophomore-1",
    projectFiles: [
      {
        fileId: "f1",
        name: "作业截图.md",
        kind: "imported",
        status: "indexed",
        slices: [
          { sliceId: "s1", title: "第 1 题", chars: 120, summary: "求极限" },
          { sliceId: "s2", title: "第 2 题", chars: 140, summary: "证明" },
        ],
      },
    ],
    projectSlices: carriedIds.map((sliceId) => ({
      fileId: "f1",
      sliceId,
      title: sliceId,
      text: "正文".repeat(20),
    })),
  };
}

function exec(ctx: StudyToolContext, input: { fileId?: string; query?: string } = {}): Promise<GetProjectFilesOutput> {
  const tool = createGetProjectFilesTool(ctx);
  return tool.execute!(input, {
    toolCallId: "t1",
    messages: [],
    abortSignal: new AbortController().signal,
    context: {},
  }) as Promise<GetProjectFilesOutput>;
}

describe("getProjectFiles execute", { concurrency: false }, () => {
  test("索引里标出哪些切片本轮读得到", async () => {
    const result = await exec(ctxWith(["s1"]));
    assert.equal(result.found, true);
    assert.match(result.text, /- s1｜第 1 题｜120 字｜已带入｜求极限/);
    assert.match(result.text, /- s2｜第 2 题｜140 字｜未带入｜证明/);
    assert.match(result.text, /1 片已携带/);
    assert.match(result.text, /2 片在册/);
    assert.match(result.text, /2 片（本轮带入 1 片）/);
  });

  test("全带时不出现「未带入」，模型不必提醒用户补片", async () => {
    const result = await exec(ctxWith(["s1", "s2"]));
    // 每一行都该是「已带入」：没有需要用户补读的切片。
    assert.doesNotMatch(result.text, /｜未带入｜/);
    assert.match(result.text, /2 片已携带/);
  });

  test("一片都没带时明确说读不到，并给出可执行下一步", async () => {
    const result = await exec(ctxWith([]));
    assert.match(result.text, /0 片已携带/);
    assert.match(result.text, /未带入/);
    assert.match(result.text, /仅本机旧文件/);
    assert.match(result.text, /选择带入/);
  });

  test("没有项目文件时维持原提示", async () => {
    const ctx = ctxWith([]);
    delete ctx.projectFiles;
    const result = await exec(ctx);
    assert.equal(result.found, false);
    assert.match(result.text, /没有带项目文件/);
  });
});
