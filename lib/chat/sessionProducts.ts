import { getToolPartsByName } from "@/lib/chat/messageParts";
import type { ChatMessage } from "@/lib/types/chat";
import type { AgentQuizPayload } from "@/lib/quiz-dock/open";
import type { ImageGenSessionInit } from "@/lib/stores/assets/imageGen";

export type AgentProductKind = "quiz" | "interactive" | "document" | "image";

interface AgentProductBase {
  kind: AgentProductKind;
  id: string;
  title: string;
  detail: string;
}

export interface AgentQuizProduct extends AgentProductBase {
  kind: "quiz";
  payload: AgentQuizPayload;
}

export interface AgentInteractiveProduct extends AgentProductBase {
  kind: "interactive";
}

export interface AgentDocumentProduct extends AgentProductBase {
  kind: "document";
}

/** 生图产物：payload 是开图窗所需的全套 init，右栏点一下就能建会话并打开。 */
export interface AgentImageProduct extends AgentProductBase {
  kind: "image";
  payload: ImageGenSessionInit;
}

/** 对话里产出的、Agent 右栏可以打开的产物（出题 / 演示 / 生图 / 文档）。 */
export type AgentProductItem =
  | AgentQuizProduct
  | AgentInteractiveProduct
  | AgentDocumentProduct
  | AgentImageProduct;

const EMPTY_PRODUCTS: AgentProductItem[] = [];

/**
 * 从整条对话收集可迁到 Agent 右上来源卡的产物。
 * 去重键是工具自己的业务 id（quizId / artifactId / documentId），跨消息保序。
 */
export function collectSessionProducts(messages: readonly ChatMessage[]): AgentProductItem[] {
  const items: AgentProductItem[] = [];
  const seen = new Set<string>();

  const push = (item: AgentProductItem) => {
    const key = `${item.kind}:${item.id}`;
    if (!item.id || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    for (const part of getToolPartsByName(message, "createQuiz")) {
      if (part.state !== "output-available" || part.preliminary || !part.output?.questions?.length) continue;
      const output = part.output;
      push({
        kind: "quiz",
        id: output.quizId,
        title: output.title.trim() || output.quizId,
        detail: String(output.questions.length),
        payload: {
          quizId: output.quizId,
          title: output.title,
          intent: output.intent,
          questions: output.questions,
          droppedCount: output.droppedCount,
        },
      });
    }

    for (const part of getToolPartsByName(message, "renderInteractive")) {
      if (part.state !== "output-available" || part.preliminary || !part.output?.artifactId) continue;
      const output = part.output;
      push({
        kind: "interactive",
        id: output.artifactId,
        title: output.title.trim() || output.artifactId,
        detail: output.prompt?.trim() ?? "",
      });
    }

    for (const part of getToolPartsByName(message, "generateImage")) {
      if (part.state !== "output-available" || part.preliminary || !part.output?.imageGenId) continue;
      const output = part.output;
      push({
        kind: "image",
        id: output.imageGenId,
        title: output.title.trim() || output.prompt.trim().slice(0, 40) || output.imageGenId,
        detail: `${output.size} · ${output.count} 张`,
        payload: {
          id: output.imageGenId,
          prompt: output.prompt,
          title: output.title,
          size: output.size,
          count: output.count,
          modelId: output.modelId,
        },
      });
    }

    for (const part of getToolPartsByName(message, "writeDocument")) {
      if (part.state !== "output-available" || part.preliminary || !part.output?.documentId) continue;
      const output = part.output;
      const title = output.spec?.title?.trim() || output.documentId;
      push({
        kind: "document",
        id: output.documentId,
        title,
        detail: output.spec?.brief?.trim() ?? "",
      });
    }
  }

  return items.length ? items : EMPTY_PRODUCTS;
}
