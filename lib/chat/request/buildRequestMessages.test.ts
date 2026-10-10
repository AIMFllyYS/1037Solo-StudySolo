import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRequestMessages, type RequestMessage } from "./buildRequestMessages.ts";
import type { ChatMessage } from "@/lib/types/chat";

function msg(id: string, role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { id, role, parts: content ? [{ type: "text", text: content }] : [], timestamp: Number(id), ...extra };
}

function textOf(m: RequestMessage): string {
  return m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
}

function hasFile(m: RequestMessage): boolean {
  return m.parts.some((p) => p.type === "file");
}

test("buildRequestMessages：短历史不截断", () => {
  const messages = [
    msg("1", "user", "a"),
    msg("2", "assistant", "b"),
  ];
  const { messages: out, truncated } = buildRequestMessages(messages, 40);
  assert.equal(truncated, false);
  assert.equal(out.length, 2);
});

test("buildRequestMessages：过滤流式中的空 assistant 占位", () => {
  const messages = [
    msg("1", "user", "latest question"),
    msg("2", "assistant", ""),
  ];

  const { messages: out, truncated } = buildRequestMessages(messages);

  assert.equal(truncated, false);
  assert.equal(out.length, 1);
  assert.equal(out[0].role, "user");
  assert.equal(textOf(out[0]), "latest question");
});

test("buildRequestMessages：剥离 reasoning / step-start，保留工具结果供服务端衰减", () => {
  const assistant: ChatMessage = {
    id: "2",
    role: "assistant",
    timestamp: 2,
    parts: [
      { type: "reasoning", text: "thinking…", state: "done" },
      { type: "tool-getCurrentPage", toolCallId: "c1", state: "output-available", input: {}, output: { text: "page", contextKey: "page:x" } },
      { type: "step-start" },
      { type: "text", text: "answer", state: "done" },
    ],
  };
  const { messages: out } = buildRequestMessages([msg("1", "user", "q"), assistant]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1].parts.map((p) => p.type), ["tool-getCurrentPage", "text"]);
  assert.equal(textOf(out[1]), "answer");
});

test("buildRequestMessages：只有工具调用没有正文的 assistant 仍带工具 parts", () => {
  const assistant: ChatMessage = {
    id: "2",
    role: "assistant",
    timestamp: 2,
    parts: [
      { type: "tool-getCurrentPage", toolCallId: "c1", state: "output-available", input: {}, output: { text: "page", contextKey: "page:x" } },
    ],
  };
  const { messages: out } = buildRequestMessages([msg("1", "user", "q"), assistant]);
  assert.equal(out.length, 2);
  assert.equal(out[1].parts.length, 1);
  assert.equal(out[1].parts[0]?.type, "tool-getCurrentPage");
});

test("buildRequestMessages：超长历史截断尾部", () => {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 100; i++) {
    messages.push(msg(String(i * 2), "user", `u${i}`));
    messages.push(msg(String(i * 2 + 1), "assistant", `a${i}`));
  }
  const { messages: out, truncated } = buildRequestMessages(messages, 10);
  assert.equal(truncated, true);
  assert.equal(out.length, 10);
  assert.equal(textOf(out[0]), "u95");
});

test("buildRequestMessages：历史图不进 file part，只留本机占位", () => {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 50; i++) {
    messages.push(msg(String(i), "user", `u${i}`));
  }
  messages[0] = msg("0", "user", "with image", {
    attachments: [{ type: "image", mimeType: "image/png", name: "old.png", base64: "data:image/png;base64,abc" }],
  });
  const { messages: out, truncated } = buildRequestMessages(messages, 5);
  assert.equal(truncated, true);
  assert.equal(out.some(hasFile), false);
  assert.equal(out.some((m) => m.id === "0"), false);
});

test("buildRequestMessages：本轮图片进 file part，历史图只写占位", () => {
  const messages = [
    msg("0", "user", "old image", {
      attachments: [{ type: "image", mimeType: "image/png", name: "old.png", base64: "data:image/png;base64,abc" }],
    }),
    msg("1", "assistant", "ok"),
    msg("2", "user", "new image", {
      attachments: [{ type: "image", mimeType: "image/png", name: "new.png", base64: "data:image/png;base64,xyz" }],
    }),
  ];
  const { messages: out } = buildRequestMessages(messages);
  assert.equal(out.some((m) => m.id === "0" && hasFile(m)), false);
  assert.match(textOf(out[0]), /用户曾在更早的消息里附过图片「old.png」/);
  const latest = out.find((m) => m.id === "2");
  assert.ok(latest && hasFile(latest));
});

test("buildRequestMessages：历史附件占位带上 blob id 与可执行的恢复动作", () => {
  const messages: ChatMessage[] = [
    msg("0", "user", "看这张作业图", {
      attachments: [{ id: "blob-m0-0", type: "image", mimeType: "image/png", name: "作业.png", size: 100 }],
    }),
    msg("1", "assistant", "好的"),
    msg("2", "user", "再讲讲"),
  ];
  const { messages: out } = buildRequestMessages(messages);
  const placeholder = textOf(out[0]);
  // 模型得知道：字节没丢、这轮没带、让用户点哪里。
  assert.match(placeholder, /附件 blob-m0-0/);
  assert.match(placeholder, /仍保存在本机/);
  assert.match(placeholder, /本轮没有随请求带上/);
  assert.match(placeholder, /「重新带入本轮」/);
});

test("buildRequestMessages：点过「重新带入本轮」的历史图片重新进 file part", () => {
  const messages: ChatMessage[] = [
    msg("0", "user", "看这张作业图", {
      attachments: [{ id: "blob-m0-0", type: "image", mimeType: "image/png", name: "作业.png", size: 100 }],
    }),
    msg("1", "assistant", "好的"),
    msg("2", "user", "再讲讲"),
  ];
  const plain = buildRequestMessages(messages);
  assert.equal(plain.messages.some(hasFile), false, "默认不回放历史图");

  // 模拟 hydrateForRequest 的结果：历史附件被换回带字节的形态。
  const hydrated: ChatMessage[] = messages.map((m): ChatMessage => (m.id === "0"
    ? { ...m, attachments: [{ type: "image", mimeType: "image/png", name: "作业.png", base64: "data:image/png;base64,abc" }] }
    : m));
  const { messages: out } = buildRequestMessages(hydrated, {
    reincludedMessageIds: new Set(["0"]),
  });
  const reincluded = out.find((m) => m.id === "0");
  assert.ok(reincluded && hasFile(reincluded), "被点过的历史消息要重新带上图片");
  assert.doesNotMatch(textOf(reincluded), /本轮没有随请求带上/);
  // 本轮那条提问的正文不受影响。
  assert.equal(textOf(out.find((m) => m.id === "2")!), "再讲讲");
});

test("buildRequestMessages：历史图片重新带入时可与本轮图片一起发送", () => {
  const messages: ChatMessage[] = [
    msg("0", "user", "旧图", {
      attachments: [{ type: "image", mimeType: "image/png", name: "old.png", base64: "data:image/png;base64,OLD" }],
    }),
    msg("1", "assistant", "ok"),
    msg("2", "user", "新图", {
      attachments: [{ type: "image", mimeType: "image/png", name: "new.png", base64: "data:image/png;base64,NEW" }],
    }),
  ];
  const { messages: out } = buildRequestMessages(messages, { reincludedMessageIds: new Set(["0"]) });
  const fileCount = out.reduce((sum, m) => sum + m.parts.filter((p) => p.type === "file").length, 0);
  assert.equal(fileCount, 2, "历史图与本轮图均保留");
  const latest = out.find((m) => m.id === "2");
  assert.ok(latest && hasFile(latest), "本轮提问的图优先");
  assert.equal(out.some((m) => m.id === "0" && hasFile(m)), true);
});

test("buildRequestMessages：截断时点过带入的历史消息不会被窗口丢掉", () => {
  const messages: ChatMessage[] = [];
  messages.push(msg("0", "user", "旧图", {
    attachments: [{ type: "image", mimeType: "image/png", name: "old.png", base64: "data:image/png;base64,OLD" }],
  }));
  for (let i = 1; i < 40; i++) {
    messages.push(msg(String(i), i % 2 === 0 ? "user" : "assistant", `m${i}`));
  }
  const { messages: out } = buildRequestMessages(messages, {
    maxTurns: 8,
    preserveAttachmentHistory: false,
    reincludedMessageIds: new Set(["0"]),
  });
  const reincluded = out.find((m) => m.id === "0");
  assert.ok(reincluded, "用户显式点过带入的消息必须留在请求里");
  assert.ok(hasFile(reincluded));
});

test("buildRequestMessages：图片超限时告诉模型「带不上」，而不是静默丢掉", () => {
  const huge = `data:image/png;base64,${"z".repeat(13 * 1024 * 1024)}`;
  const input = msg("1", "user", "看这张图", {
    attachments: [
      { type: "image", mimeType: "image/png", name: "太大.png", base64: huge },
    ],
  });

  const { messages } = buildRequestMessages([input]);
  const requestText = textOf(messages[0]);
  assert.equal(messages[0].parts.some((part) => part.type === "file"), false, "超限的图本来就不该带上");
  assert.match(requestText, /没能随请求发送/);
  assert.match(requestText, /太大\.png/);
  assert.match(requestText, /不要凭文件名猜测图片内容/);
});

test("buildRequestMessages：正常大小的图带上了，就不加「带不上」的说明", () => {
  const input = msg("1", "user", "看这张图", {
    attachments: [
      { type: "image", mimeType: "image/png", name: "正常.png", base64: "data:image/png;base64,abc" },
    ],
  });
  const { messages } = buildRequestMessages([input]);
  assert.ok(messages[0].parts.some((part) => part.type === "file"));
  assert.doesNotMatch(textOf(messages[0]), /没能随请求发送/);
});

test("buildRequestMessages：TXT / MD / DOCX 正文作为明确标记的文本附件发送", () => {
  const input = msg("1", "user", "请总结附件", {
    attachments: [
      { type: "document", mimeType: "text/plain", name: "课堂笔记.txt", text: "第一段正文", size: 12, characterCount: 5 },
      { type: "document", mimeType: "text/markdown", name: "review.md", text: "# 复习提纲", size: 16, characterCount: 6 },
    ],
  });

  const { messages } = buildRequestMessages([input]);
  assert.equal(messages[0].parts.some((part) => part.type === "file"), false);
  const requestText = textOf(messages[0]);
  assert.match(requestText, /attached-document name="课堂笔记.txt"/);
  assert.match(requestText, /第一段正文/);
  assert.match(requestText, /attached-document name="review.md" type="text\/markdown"/);
  assert.match(requestText, /# 复习提纲/);
});

test("buildRequestMessages：HTML 附件只作为源码文本发送", () => {
  const htmlSource = '<article><script>alert("never render")</script>正文</article>';
  const input = msg("1", "user", "检查网页源码", {
    attachments: [
      { type: "document", mimeType: "text/html", name: "lesson.html", text: htmlSource, size: 64, characterCount: 58 },
    ],
  });

  const { messages } = buildRequestMessages([input]);
  assert.equal(messages[0].parts.some((part) => part.type === "file"), false);
  const requestText = textOf(messages[0]);
  assert.match(requestText, /attached-document name="lesson\.html" type="text\/html"/);
  assert.match(requestText, /<script>alert\("never render"\)<\/script>/);
});

test("buildRequestMessages：本地 PDF 预览数据不会进入 AI 请求", () => {
  const input = msg("1", "user", "这是一份本地参考文件", {
    attachments: [{
      type: "local-file", mimeType: "application/pdf", name: "private.pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=", size: 14,
    }],
  });

  const { messages } = buildRequestMessages([input]);
  const requestText = textOf(messages[0]);
  assert.equal(messages[0].parts.some((part) => part.type === "file"), false);
  assert.equal(requestText.includes("JVBERi0xLjc"), false);
  assert.equal(requestText, "这是一份本地参考文件");
});

test("buildRequestMessages：默认保留完整会话历史", () => {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 60; i++) {
    messages.push(msg(String(i), i % 2 === 0 ? "user" : "assistant", `m${i}`));
  }

  const { messages: out, truncated } = buildRequestMessages(messages);

  assert.equal(truncated, false);
  assert.equal(out.length, 60);
});

test("buildRequestMessages：maxTurns 截断可不保留早期附件", () => {
  const messages: ChatMessage[] = [];
  messages.push(msg("0", "user", "old image", {
    attachments: [{ type: "image", mimeType: "image/png", base64: "data:image/png;base64,abc" }],
  }));
  for (let i = 1; i < 40; i++) {
    messages.push(msg(String(i), i % 2 === 0 ? "user" : "assistant", `m${i}`));
  }

  const { messages: out, truncated, truncationReason } = buildRequestMessages(messages, {
    maxTurns: 8,
    reason: "soft-limit",
    preserveAttachmentHistory: false,
  });

  assert.equal(truncated, true);
  assert.equal(truncationReason, "soft-limit");
  assert.equal(out.length, 8);
  assert.equal(textOf(out[0]), "m32");
  assert.equal(out.some(hasFile), false);
});
