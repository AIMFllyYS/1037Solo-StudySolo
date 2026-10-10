import { convertToModelMessages, type ModelMessage, type UIMessageStreamWriter } from "ai";
import { compactStudyParts } from "@/lib/chat/compactStudyParts";
import { rehydrateStudyParts } from "@/lib/chat/rehydrateStudyParts";

import type { ChatMessage } from "@/lib/types/chat";

import { type ChatRequest } from "@/lib/ai/agent/requestSchema";

import { createReadLocalFileTool } from '@/lib/ai/agent/tools/readLocalFile/tool';
type Writer = UIMessageStreamWriter<ChatMessage>;

/** 把一段纯文本作为 assistant 正文写入流（用于「未配置」等友好提示，而非 error）。 */
export function writeTextPart(writer: Writer, text: string) {
  const id = `txt_${Date.now()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export function lastUserText(messages: ChatRequest["messages"]): string {
  const last = [...messages].reverse().find((m) => m.role === "user") ?? messages[messages.length - 1];
  if (!last) return "";
  return last.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ");
}

export function hasFileParts(messages: ChatRequest["messages"]): boolean {
  return messages.some((m) => m.parts.some((p) => p.type === "file"));
}

/** UIMessage → ModelMessage。先压 stub 再按 contextKey 回灌页/节/技能。 */
export async function toModelMessages(
  messages: ChatRequest["messages"],
  ctx: { skills: ChatRequest["skills"]; artifacts: ChatRequest["artifacts"]; academicYear: ChatRequest["academicYear"] },
): Promise<ModelMessage[]> {
  const uiMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m, i) => ({
      id: m.id ?? `m_${i}`,
      role: m.role,
      parts: rehydrateStudyParts(
        compactStudyParts(
          m.parts.filter((p) => {
            const type = p.type;
            return type === "text" || type === "file" || type === "reasoning"
              || (typeof type === "string" && type.startsWith("tool-"));
          }) as ChatMessage["parts"],
          "ui-request",
        ),
        ctx,
      ),
    })) as ChatMessage[];
  return convertToModelMessages(uiMessages, { ignoreIncompleteToolCalls: true,tools:{readLocalFile:createReadLocalFileTool()} });
}