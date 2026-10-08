import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageModelV4StreamPart, LanguageModelV4StreamResult } from "@ai-sdk/provider";
import { MockLanguageModelV4, convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test";
import { createStudyAgent, type StudyAgentInput } from "./studyAgent.ts";
import { IMAGE_SEARCH_MAX_TOTAL, MAX_TOOL_STEPS } from "./tools/_shared.ts";

const usage = {
  inputTokens: { total: 10, noCache: 7, cacheRead: 3, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function toolCallStep(
  toolName: string,
  input: Record<string, unknown>,
  callId = `call_${toolName}`,
): LanguageModelV4StreamResult {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: "stream-start", warnings: [] },
      { type: "reasoning-start", id: "r1" },
      { type: "reasoning-delta", id: "r1", delta: "先看看当前页面" },
      { type: "reasoning-end", id: "r1" },
      { type: "tool-call", toolCallId: callId, toolName, input: JSON.stringify(input) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
    ]),
  };
}

function textStep(text: string): LanguageModelV4StreamResult {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: text },
      { type: "text-end", id: "t1" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
    ]),
  };
}

function baseInput(model: MockLanguageModelV4, over: Partial<StudyAgentInput> = {}): StudyAgentInput {
  return {
    model,
    chatCtx: { subjectId: "probability", categoryId: "detail", itemId: "1.4", currentTopic: "", academicYear: "freshman-2" },
    options: { enableSearch: false, enableThinking: false, contextMode: "full" },
    disabledTools: [],
    skills: [],
    globalContext: "",
    referenceContext: "",
    contextTruncated: false,
    isImageMode: false,
    selectedModelId: "mimo-v2.5",
    modelSupportsTools: true,
    thinking: {},
    ...over,
  };
}

test("createStudyAgent：工具循环 → UI 流包含 reasoning / tool-input / tool-output / text，且 usage 跨步累加", async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolCallStep("getCurrentPage", {}), textStep("最终回答")],
  });
  const { agent } = createStudyAgent(baseInput(model));
  const result = await agent.stream({ messages: [{ role: "user", content: "这一节讲了什么" }] });
  const chunks = await convertReadableStreamToArray(result.toUIMessageStream({ sendReasoning: true }));
  const types = chunks.map((c) => c.type);

  assert.ok(types.includes("reasoning-delta"));
  const inputChunk = chunks.find((c) => c.type === "tool-input-available") as { toolName: string } | undefined;
  assert.equal(inputChunk?.toolName, "getCurrentPage");
  const outputChunk = chunks.find((c) => c.type === "tool-output-available") as { output: { text: string; contextKey: string } } | undefined;
  assert.ok(outputChunk, "应有工具输出");
  assert.match(outputChunk!.output.text, /^【/);
  assert.equal(outputChunk!.output.contextKey, "page:probability/detail/1.4");
  assert.ok(chunks.some((c) => c.type === "text-delta" && (c as { delta: string }).delta === "最终回答"));

  const steps = await result.steps;
  assert.equal(steps.length, 2);
  const total = await result.totalUsage;
  assert.equal(total.inputTokens, 20);
  assert.equal(total.outputTokens, 10);
  assert.equal(total.inputTokenDetails.cacheReadTokens, 6);

  // 第二步发给模型的 tool result 只含 text（toModelOutput），不含 contextKey 等展示字段
  const secondPrompt = model.doStreamCalls[1].prompt;
  const toolMsg = secondPrompt.find((m) => m.role === "tool");
  assert.ok(toolMsg);
  const toolPart = (toolMsg!.content as Array<{ type: string; output?: { type: string; value: unknown } }>)[0];
  assert.equal(toolPart.output?.type, "text");
  assert.match(String(toolPart.output?.value), /^【/);
});

test("createStudyAgent：同一 contextKey 二次加载只回「已加载」提示", async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolCallStep("getCurrentPage", {}), toolCallStep("getCurrentPage", {}), textStep("ok")],
  });
  const { agent } = createStudyAgent(baseInput(model));
  const result = await agent.stream({ messages: [{ role: "user", content: "q" }] });
  const chunks = await convertReadableStreamToArray(result.toUIMessageStream());
  const outputs = chunks.filter((c) => c.type === "tool-output-available") as Array<{ output: { text: string; deduped?: boolean } }>;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0].output.deduped, undefined);
  assert.equal(outputs[1].output.deduped, true);
  assert.match(outputs[1].output.text, /上下文已加载/);
});

test("createStudyAgent：生图模式首步强制 generateImage，之后关闭工具", async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolCallStep("generateImage", { prompt: "a cat", title: "猫" }), textStep("说明")],
  });
  const { agent, promptParts } = createStudyAgent(baseInput(model, { isImageMode: true, selectedModelId: "Tongyi-MAI/Z-Image-Turbo" }));
  assert.match(promptParts.instructions, /生图模式硬性规则/);

  const result = await agent.stream({ messages: [{ role: "user", content: "画一只猫" }] });
  const chunks = await convertReadableStreamToArray(result.toUIMessageStream());

  const first = model.doStreamCalls[0];
  assert.deepEqual(first.toolChoice, { type: "tool", toolName: "generateImage" });
  assert.deepEqual(first.tools?.map((t) => t.name), ["generateImage"]);
  const second = model.doStreamCalls[1];
  assert.equal(second.tools?.length ?? 0, 0);

  const out = chunks.find((c) => c.type === "tool-output-available") as { toolCallId: string; output: { imageGenId: string; modelId?: string; count: number } };
  assert.equal(out.output.imageGenId, `img_${out.toolCallId}`);
  assert.equal(out.output.modelId, "Tongyi-MAI/Z-Image-Turbo");
  assert.equal(out.output.count, 1);
});

test("createStudyAgent：未确认时不暴露 commit 工具，确认笔记后才给 commitNotes", () => {
  const model = new MockLanguageModelV4();
  const idle = createStudyAgent(baseInput(model));
  assert.ok("proposeMemory" in idle.tools);
  assert.ok(!("commitNotes" in idle.tools));
  assert.ok(!("commitFlashcards" in idle.tools));

  const notes = createStudyAgent(baseInput(model, { memoryCommit: "note" }));
  assert.ok("commitNotes" in notes.tools);
  assert.ok(!("commitFlashcards" in notes.tools));
  assert.equal(notes.promptParts.instructions, idle.promptParts.instructions);

  const cards = createStudyAgent(baseInput(model, { memoryCommit: "flashcards" }));
  assert.ok("commitFlashcards" in cards.tools);
  assert.ok(!("commitNotes" in cards.tools));
  assert.equal(cards.promptParts.instructions, idle.promptParts.instructions);
  assert.doesNotMatch(cards.promptParts.instructions, /记忆闭环（已确认闪卡）/);
});

test("createStudyAgent：主对话目录只报数量，不 dump 笔记正文", () => {
  const model = new MockLanguageModelV4();
  const withCatalog = createStudyAgent(baseInput(model, {
    userNotes: [{ id: "n1", title: "秘密标题", markdown: "秘密正文不该进 system", subjectId: "histology", updatedAt: 1 }],
  }));
  assert.match(withCatalog.promptParts.volatile, /个人笔记 1 篇/);
  assert.doesNotMatch(withCatalog.promptParts.volatile, /秘密正文/);
  const windowed = createStudyAgent(baseInput(model, {
    userNotes: [{ id: "n1", title: "秘密标题", markdown: "秘密正文", subjectId: null, updatedAt: 1 }],
    noteWindowAgent: true,
  }));
  assert.doesNotMatch(windowed.promptParts.volatile, /本机记忆/);
});

test("createStudyAgent：主对话始终暴露 updateUserNote / 查找工具；窗内收窄并走独立笔记前缀", () => {
  const model = new MockLanguageModelV4();
  const idle = createStudyAgent(baseInput(model));
  assert.ok("updateUserNote" in idle.tools);
  assert.ok("searchNotes" in idle.tools);
  assert.ok("searchFlashcards" in idle.tools);

  const editing = createStudyAgent(baseInput(model, {
    editingUserNote: { id: "note_1", title: "被覆上皮", markdown: "# 被覆上皮\n\n1. 分类" },
  }));
  assert.ok("updateUserNote" in editing.tools);
  assert.match(editing.promptParts.volatile, /正在编辑的个人笔记/);
  assert.match(editing.promptParts.volatile, /被覆上皮/);
  assert.match(editing.promptParts.volatile, /updateUserNote/);
  const locIdle = idle.promptParts.instructions.indexOf("【当前位置】");
  const locEdit = editing.promptParts.instructions.indexOf("【当前位置】");
  assert.equal(idle.promptParts.instructions.slice(0, locIdle), editing.promptParts.instructions.slice(0, locEdit));

  const windowed = createStudyAgent(baseInput(model, {
    editingUserNote: { id: "note_1", title: "被覆上皮", markdown: "# 被覆上皮" },
    noteWindowAgent: true,
  }));
  assert.ok("updateUserNote" in windowed.tools);
  assert.ok(!("searchNotes" in windowed.tools));
  assert.ok(!("searchFlashcards" in windowed.tools));
  assert.ok(!("renderInteractive" in windowed.tools));
  assert.ok(!("generateImage" in windowed.tools));
  assert.ok(!("writeDocument" in windowed.tools));
  assert.ok(!("proposeMemory" in windowed.tools));

  // 笔记角色自成一条稳定前缀：与教学前缀不相等，且同角色两次构造逐字节一致。
  const windowedHead = windowed.promptParts.instructions.slice(
    0,
    windowed.promptParts.instructions.indexOf("【当前位置】"),
  );
  assert.notEqual(idle.promptParts.instructions.slice(0, locIdle), windowedHead);
  assert.match(windowedHead, /个人学习笔记的编辑助手/);
  assert.doesNotMatch(windowedHead, /引导优于代劳|示范再渐隐|每讲完一个完整知识点/);
  // 教学前缀要求「每次回答末尾必须追加追问」，笔记前缀恰恰相反。
  assert.doesNotMatch(windowedHead, /每次回答末尾\*\*必须\*\*追加追问标签/);
  assert.match(windowedHead, /不要输出 <FollowUp> 标签/);
  const windowedAgain = createStudyAgent(baseInput(model, {
    editingUserNote: { id: "note_1", title: "被覆上皮", markdown: "# 被覆上皮" },
    noteWindowAgent: true,
  }));
  assert.equal(
    windowedHead,
    windowedAgain.promptParts.instructions.slice(
      0,
      windowedAgain.promptParts.instructions.indexOf("【当前位置】"),
    ),
  );
});

test("createStudyAgent：笔记场景不带教学式前缀，但共享公式与防幻觉规范", () => {
  const model = new MockLanguageModelV4();
  const note = createStudyAgent(baseInput(model, {
    editingUserNote: { id: "note_1", title: "被覆上皮", markdown: "# 被覆上皮" },
    noteWindowAgent: true,
  }));
  const head = note.promptParts.instructions;
  assert.match(head, /KaTeX/);
  assert.match(head, /绝不编造/);
  assert.match(head, /同意修改/);
  assert.match(head, /当前科目：/);
});

test("createStudyAgent：技能菜单进入 instructions 且 useSkill 以 enum 暴露；enableSearch 控制联网工具", () => {
  const model = new MockLanguageModelV4();
  const skills = [
    { id: "s1", name: "错题分析", description: "分析错因", content: "...", pinned: false, createdAt: 1 },
    { id: "s2", name: "固定技能", description: "", content: "始终遵循", pinned: true, createdAt: 2 },
  ];
  const off = createStudyAgent(baseInput(model, { skills }));
  assert.match(off.promptParts.instructions, /可调用的技能库[\s\S]*错题分析/);
  assert.match(off.promptParts.instructions, /已固定启用的技能[\s\S]*始终遵循/);
  assert.ok("useSkill" in off.tools);
  assert.ok(!("webSearch" in off.tools));

  const on = createStudyAgent(baseInput(model, { options: { enableSearch: true }, disabledTools: ["drawDiagram"] }));
  assert.ok("webSearch" in on.tools && "imageSearch" in on.tools);
  assert.ok(!("drawDiagram" in on.tools));
  assert.ok(!("useSkill" in on.tools));
});

test("createStudyAgent：模型不支持工具时 tools 为空；软上限时仍保留分级参考材料", () => {
  const model = new MockLanguageModelV4();
  const noTools = createStudyAgent(baseInput(model, { modelSupportsTools: false, referenceContext: "参考材料正文" }));
  assert.equal(Object.keys(noTools.tools).length, 0);
  assert.match(noTools.promptParts.instructions, /【参考材料】\n参考材料正文/);
  assert.doesNotMatch(noTools.promptParts.instructions, /用户提问：/);

  const truncated = createStudyAgent(baseInput(model, { referenceContext: "参考材料正文", contextTruncated: true }));
  assert.match(truncated.promptParts.instructions, /参考材料正文/);
  assert.match(truncated.promptParts.instructions, /【上下文策略】/);
  assert.match(truncated.promptParts.instructions, /文件引用可继续按需读取/);
  assert.match(truncated.promptParts.instructions, /分级携带/);
  assert.ok("getArtifact" in createStudyAgent(baseInput(model)).tools);
  assert.ok("proposeMemory" in createStudyAgent(baseInput(model)).tools);
  assert.ok(!("commitNotes" in createStudyAgent(baseInput(model)).tools));
  assert.ok("commitNotes" in createStudyAgent(baseInput(model, { memoryCommit: "note" })).tools);
  assert.ok(!("commitFlashcards" in createStudyAgent(baseInput(model, { memoryCommit: "note" })).tools));
});

test("createStudyAgent：定位行在 instructions 末尾，换页不改稳定前缀", () => {
  const model = new MockLanguageModelV4();
  const a = createStudyAgent(baseInput(model, {
    chatCtx: { subjectId: "probability", categoryId: "detail", itemId: "1.4", currentTopic: "古典概型", academicYear: "freshman-2" },
  }));
  const b = createStudyAgent(baseInput(model, {
    chatCtx: { subjectId: "probability", categoryId: "detail", itemId: "1.5", currentTopic: "几何概型", academicYear: "freshman-2" },
  }));
  const ia = a.promptParts.instructions;
  const ib = b.promptParts.instructions;
  const locA = ia.indexOf("【当前位置】");
  const locB = ib.indexOf("【当前位置】");
  assert.ok(locA > 80 && locB > 80);
  assert.equal(ia.slice(0, locA), ib.slice(0, locB));
  assert.match(ia, /学年：大一下学期/);
  assert.match(ia, /1\.4/);
  assert.match(ib, /1\.5/);
});

test("createStudyAgent：同一输入两次构造逐字节一致，发往模型的 prompt/tools 稳定（C 项缓存证据）", async () => {
  const over: Partial<StudyAgentInput> = {
    skills: [
      { id: "s2", name: "固定技能", description: "", content: "始终遵循", pinned: true, createdAt: 2 },
      { id: "s1", name: "错题分析", description: "分析错因", content: "...", pinned: false, createdAt: 1 },
      { id: "s3", name: "通用对话", description: "日常答疑", content: "...", pinned: false, createdAt: 3 },
    ],
    globalContext: "用户补充上下文",
    userNotes: [{ id: "n1", title: "笔记", markdown: "x", subjectId: "histology", updatedAt: 1 }],
    flashcards: [{ id: "f1", subjectId: "histology", sourceLabel: "s", front: "q", back: "a", originalText: "o", status: "active" }],
    referenceContext: "参考材料正文",
  };
  const modelA = new MockLanguageModelV4({ doStream: [textStep("a"), textStep("b")] });
  const modelB = new MockLanguageModelV4({ doStream: [textStep("a"), textStep("b")] });
  const a = createStudyAgent(baseInput(modelA, over));
  const b = createStudyAgent(baseInput(modelB, over));

  // instructions 与工具键顺序逐字节一致：前缀不漂移才能命中 provider 侧 prompt cache。
  assert.equal(a.promptParts.instructions, b.promptParts.instructions);
  assert.deepEqual(Object.keys(a.tools), Object.keys(b.tools));

  // 两个「同一会话」首轮请求：发给模型的 prompt / tools 序列化完全一致。
  for (const { agent } of [a, b]) {
    await convertReadableStreamToArray(
      (await agent.stream({ messages: [{ role: "user", content: "q" }] })).toUIMessageStream(),
    );
  }
  const callA = modelA.doStreamCalls[0];
  const callB = modelB.doStreamCalls[0];
  assert.deepEqual(callA.prompt, callB.prompt);
  assert.deepEqual(callA.tools?.map((t) => t.name), callB.tools?.map((t) => t.name));
});

test("createStudyAgent：imageSearch 配额耗尽后 prepareStep 摘除该工具", async () => {
  const model = new MockLanguageModelV4({
    doStream: [textStep("基于已有图片继续")],
  });
  const { agent, runtime } = createStudyAgent(baseInput(model, {
    options: { enableSearch: true, enableThinking: false, contextMode: "full" },
  }));
  runtime.imageSearchFetchedCount = IMAGE_SEARCH_MAX_TOTAL;
  await convertReadableStreamToArray((await agent.stream({ messages: [{ role: "user", content: "q" }] })).toUIMessageStream());
  const names = model.doStreamCalls[0].tools?.map((tool) => tool.name) ?? [];
  assert.ok(names.includes("webSearch"));
  assert.ok(!names.includes("imageSearch"));
});

test("createStudyAgent：planMode 不暴露写工具，只读工具仍在，规则进 volatile", () => {
  const model = new MockLanguageModelV4();
  const idle = createStudyAgent(baseInput(model));
  const planned = createStudyAgent(baseInput(model, { planMode: true, memoryCommit: "note" }));
  assert.ok("getCurrentPage" in planned.tools);
  assert.ok("searchNotes" in planned.tools);
  assert.ok("getArtifact" in planned.tools);
  assert.ok(!("writeDocument" in planned.tools));
  assert.ok(!("renderInteractive" in planned.tools));
  assert.ok(!("generateImage" in planned.tools));
  assert.ok(!("createQuiz" in planned.tools));
  assert.ok(!("updateUserNote" in planned.tools));
  assert.ok(!("commitNotes" in planned.tools));
  assert.ok("writeDocument" in idle.tools);
  const locIdle = idle.promptParts.instructions.indexOf("【当前位置】");
  const locPlan = planned.promptParts.instructions.indexOf("【当前位置】");
  assert.equal(idle.promptParts.instructions.slice(0, locIdle), planned.promptParts.instructions.slice(0, locPlan));
  assert.match(planned.promptParts.volatile, /计划模式（只读）/);
  assert.doesNotMatch(idle.promptParts.volatile, /计划模式（只读）/);
});

test("createStudyAgent：forcedTool 首步强制调用且其它工具仍在；附加文件进 volatile", async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolCallStep("generateImage", { prompt: "细胞", title: "细胞" }), textStep("说明")],
  });
  const { agent, promptParts, tools } = createStudyAgent(baseInput(model, {
    forcedTool: "generateImage",
    attachedFiles: [{
      path: "probability/detail/1.4",
      title: "古典概型与几何概型",
      kind: "file",
      address: "概率论 › 详解 › 古典概型",
      subjectId: "probability",
      categoryId: "detail",
      itemId: "1.4",
    }],
  }));
  assert.ok("generateImage" in tools);
  assert.ok("getCurrentPage" in tools);
  assert.match(promptParts.volatile, /指定工具/);
  assert.match(promptParts.volatile, /用户附加的笔记/);
  assert.match(promptParts.volatile, /probability\/detail\/1\.4/);
  await convertReadableStreamToArray((await agent.stream({ messages: [{ role: "user", content: "画细胞" }] })).toUIMessageStream());
  assert.deepEqual(model.doStreamCalls[0].toolChoice, { type: "tool", toolName: "generateImage" });
  const firstTools = model.doStreamCalls[0].tools?.map((tool) => tool.name) ?? [];
  assert.ok(firstTools.includes("generateImage"));
  assert.ok(firstTools.includes("getCurrentPage"));
});

test("createStudyAgent：maxToolRounds=2 时第 2 步后不再发起第 3 次 LLM", async () => {
  const model = new MockLanguageModelV4({
    doStream: Array.from({ length: 4 }, (_, i) =>
      toolCallStep("getCurrentPage", {}, `call_limit_${i}`),
    ),
  });
  const { agent } = createStudyAgent(baseInput(model, { maxToolRounds: 2 }));
  const result = await agent.stream({ messages: [{ role: "user", content: "q" }] });
  await convertReadableStreamToArray(result.toUIMessageStream());
  assert.equal(model.doStreamCalls.length, 2);
  assert.equal((await result.steps).length, 2);
});

test("createStudyAgent：第 6 步仍 tool-calls 时不再发起第 7 次 LLM", async () => {
  const model = new MockLanguageModelV4({
    doStream: Array.from({ length: MAX_TOOL_STEPS }, (_, i) =>
      toolCallStep("getCurrentPage", {}, `call_page_${i}`),
    ),
  });
  const { agent } = createStudyAgent(baseInput(model));
  const result = await agent.stream({ messages: [{ role: "user", content: "q" }] });
  await convertReadableStreamToArray(result.toUIMessageStream());
  assert.equal(model.doStreamCalls.length, MAX_TOOL_STEPS);
  assert.equal(await result.finishReason, "tool-calls");
  assert.equal((await result.steps).length, MAX_TOOL_STEPS);
});
