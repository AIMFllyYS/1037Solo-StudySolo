import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelMessage } from "ai";
import { pruneStudyMessages } from "./pruneStudyMessages.ts";

test("pruneStudyMessages：reasoning 全部去掉，kimi-k3 / mimo-v2.5 不例外", () => {
  for (const model of ["kimi-k3", "mimo-v2.5", "z-ai/glm-5.3-flash"]) {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: `${model} 内部思考` },
          { type: "text", text: "回答" },
        ],
      },
      { role: "user", content: "追问" },
    ];
    const out = pruneStudyMessages(messages);
    const assistant = out.find((m) => m.role === "assistant");
    assert.ok(assistant);
    assert.notEqual(typeof assistant.content, "string");
    if (typeof assistant.content !== "string") {
      assert.equal(assistant.content.some((p) => p.type === "reasoning"), false);
      assert.ok(assistant.content.some((p) => p.type === "text"));
    }
  }
});

test("pruneStudyMessages：较早工具结果保留至 AI 整理，不能在压缩前丢失", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "第一问" },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "getCurrentPage", input: {} }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "c1",
        toolName: "getCurrentPage",
        output: { type: "text", value: "旧页面全文".repeat(20) },
      }],
    },
    { role: "user", content: "第二问" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "最近回答" },
        { type: "tool-call", toolCallId: "c2", toolName: "getSection", input: { path: "x" } },
      ],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "c2",
        toolName: "getSection",
        output: { type: "text", value: "最近工具结果" },
      }],
    },
  ];
  const out = pruneStudyMessages(messages);
  const dumped = JSON.stringify(out);
  assert.match(dumped, /旧页面全文/);
  assert.match(dumped, /最近工具结果/);
  assert.match(dumped, /最近回答/);
});
