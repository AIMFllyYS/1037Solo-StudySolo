// 会话三档压缩：同一套规则服务落盘 / 云同步 / 发给模型的请求。
// 卡片结构化字段留下；页/节/技能/大纲/演示全文改成 stub + contextKey，由服务端回灌。

import { compactUiParts, stubLargeHtml } from "@/lib/context/compactArtifacts";
import { truncateText } from "@/lib/utils/unicode";
import type { ChatMessage, ChatMessagePart } from "@/lib/types/chat";

export type CompactStudyMode = "persist" | "sync" | "ui-request";

export const REASONING_PREVIEW_CHARS = 110;
export const COMPACTED_TEXT_PREFIX = "【已加载】";

const STUB_TEXT_TOOLS = new Set([
  "getCurrentPage",
  "getSection",
  "getOutline",
  "useSkill",
  "getArtifact",
  // 这三个工具的 output.text 是大正文（项目切片全文/图表规格/文件索引），
  // 此前不在任何压缩集合 = 原样落盘并随请求重发，是长会话体积的头号驱动。
  // 均可用原参数重新调用取回全文，与其余 STUB 工具同一回灌语义。
  "readProjectSlices",
  "drawDiagram",
  "getProjectFiles",
]);

const SEARCH_TOOLS = new Set([
  "searchNotes",
  "searchFlashcards",
  "searchNoteImages",
  "webSearch",
  "imageSearch",
]);

const STRUCTURED_TEXT_TOOLS = new Set([
  "createQuiz",
  "writeDocument",
  "generateImage",
  "commitNotes",
  "commitFlashcards",
  "updateUserNote",
]);

export function isCompactedToolText(text: string): boolean {
  return (
    text.startsWith(COMPACTED_TEXT_PREFIX) ||
    text.startsWith("【HTML 产物已省略") ||
    text.startsWith("【上下文已加载】")
  );
}

export function toolNameFromPart(part: { type: string; toolName?: unknown }): string | null {
  if (part.type === "dynamic-tool") {
    return typeof part.toolName === "string" && part.toolName ? part.toolName : null;
  }
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function stubToolText(
  name: string,
  output: Record<string, unknown>,
  input?: Record<string, unknown> | null,
): string {
  const title = String(output.title ?? output.skill ?? input?.path ?? input?.sectionId ?? input?.name ?? "");
  const key = String(output.contextKey ?? output.artifactId ?? "");
  const label = title || key || name;
  const rawText = typeof output.text === "string" && !isCompactedToolText(output.text) ? output.text : "";
  const extra = rawText.length > 0 ? `，约 ${rawText.length} 字` : "";
  return `${COMPACTED_TEXT_PREFIX}${name}：${label}${extra}。需要时再调用该工具取回全文。`;
}

function compactSearchImages(images: unknown): unknown {
  if (!Array.isArray(images)) return images;
  return images.map((item) => {
    const rec = recordOf(item);
    if (!rec || !("context" in rec)) return item;
    const rest = { ...rec };
    delete rest.context;
    return rest;
  });
}

function compactToolOutput(
  name: string,
  output: Record<string, unknown>,
  input: Record<string, unknown> | null,
  mode: CompactStudyMode,
): Record<string, unknown> {
  const rec = { ...output };
  if (name === "cloudSandbox") {
    const excerpt = (value: unknown, limit: number) => typeof value === "string" && value.length > limit ? `${value.slice(0, limit / 2)}\n[中间日志已省略，可通过结果卡刷新查询完整日志]\n${value.slice(-limit / 2)}` : value;
    rec.stdout = excerpt(rec.stdout, 16000);
    rec.stderr = excerpt(rec.stderr, 8000);
    if (rec.stdout !== output.stdout || rec.stderr !== output.stderr) rec.logsTruncated = true;
    // Never keep a second serialized copy of the same logs in the history.
    if (output.stdout || output.stderr) rec.text = `云端命令状态：${String(rec.state ?? "unknown")}；退出码：${String(rec.exitCode ?? "尚未退出")}`;
    else if (typeof rec.text === "string" && rec.text.length > 16000) { rec.text = truncateText(rec.text, 16000); rec.logsTruncated = true; }
  }
  if (name === "learningConnectors" && mode === "ui-request") {
    // The current UI retains its structured response. History sent to the model
    // only needs the bounded result and action identity, not duplicate full data.
    delete rec.data;
    delete rec.download;
    if (typeof rec.text === "string" && rec.text.length > 16000) rec.text = truncateText(rec.text, 16000);
    const action = recordOf(rec.action);
    if (action) { const summary = { ...action }; delete summary.arguments; delete summary.result; rec.action = summary; }
  }

  if (name === "renderInteractive") {
    const compacted = compactUiParts([{
      type: "tool-renderInteractive",
      state: "output-available",
      output: rec,
    }])[0] as { output?: Record<string, unknown> };
    return compacted.output ?? rec;
  }

  if (STUB_TEXT_TOOLS.has(name) && typeof rec.text === "string" && !isCompactedToolText(rec.text)) {
    rec.text = stubToolText(name, rec, input);
  }
  if (name === "getArtifact") delete rec.html;

  if (SEARCH_TOOLS.has(name)) {
    const hasHits = Array.isArray(rec.hits) && rec.hits.length > 0;
    const hasSources = Array.isArray(rec.sources) && rec.sources.length > 0;
    const hasImages = Array.isArray(rec.images) && rec.images.length > 0;
    if ((hasHits || hasSources || hasImages) && typeof rec.text === "string" && !isCompactedToolText(rec.text)) {
      const n = hasHits
      ? (rec.hits as unknown[]).length
      : hasSources
        ? (rec.sources as unknown[]).length
        : (rec.images as unknown[]).length;
      rec.text = `${COMPACTED_TEXT_PREFIX}${name}：${n} 条结果。`;
    }
    delete rec.diagnostics;
    if (name === "searchNoteImages") rec.images = compactSearchImages(rec.images);
  }

  if (STRUCTURED_TEXT_TOOLS.has(name) && typeof rec.text === "string" && rec.text.length > 400 && !isCompactedToolText(rec.text)) {
    const hasStructured = rec.questions != null || rec.spec != null || rec.imageGenId != null || rec.markdown != null || rec.items != null;
    if (hasStructured) rec.text = stubToolText(name, rec, input);
  }

  return rec;
}

function compactToolInput(name: string, input: unknown): unknown {
  if (name !== "renderInteractive") return input;
  const rec = recordOf(input);
  if (!rec || !("prompt" in rec)) return input;
  const rest = { ...rec };
  delete rest.prompt;
  return rest;
}

function compactPart(part: ChatMessagePart, mode: CompactStudyMode): ChatMessagePart | null {
  if (part.type === "reasoning") {
    if (mode === "ui-request") return null;
    if (part.state === "streaming") return part;
    const text = typeof part.text === "string" ? part.text : "";
    if (text.length <= REASONING_PREVIEW_CHARS) return part;
    return { ...part, text: truncateText(text, REASONING_PREVIEW_CHARS) };
  }

  if (part.type === "text" && typeof part.text === "string") {
    const text = stubLargeHtml(part.text);
    return text === part.text ? part : { ...part, text };
  }

  if (part.type === "step-start") {
    return mode === "ui-request" ? null : part;
  }

  const name = toolNameFromPart(part);
  if (!name) return part;
  const toolPart = part as ChatMessagePart & {
    state?: string;
    output?: unknown;
    input?: unknown;
  };
  if (toolPart.state !== "output-available") return part;
  const output = recordOf(toolPart.output);
  if (!output) return part;
  const input = recordOf(toolPart.input);
  return {
    ...toolPart,
    input: compactToolInput(name, toolPart.input),
    output: compactToolOutput(name, output, input, mode),
  } as ChatMessagePart;
}

export function compactStudyParts(
  parts: ChatMessagePart[] | undefined,
  mode: CompactStudyMode,
): ChatMessagePart[] {
  if (!parts?.length) return parts ?? [];
  const out: ChatMessagePart[] = [];
  for (const part of parts) {
    const next = compactPart(part, mode);
    if (next) out.push(next);
  }
  return out;
}

export function compactStudyMessage(message: ChatMessage, mode: CompactStudyMode): ChatMessage {
  return { ...message, parts: compactStudyParts(message.parts, mode) };
}

export function compactStudyMessages(messages: ChatMessage[], mode: CompactStudyMode): ChatMessage[] {
  return messages.map((message) => compactStudyMessage(message, mode));
}
