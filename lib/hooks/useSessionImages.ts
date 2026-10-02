"use client";

import { useMemo } from "react";
import { getToolPartsByName } from "@/lib/chat/messageParts";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { useImageGen } from "@/lib/stores/imageGen";
import {
  collectMessageImages,
  mergeGeneratedImages,
  type AgentImageItem,
  type GeneratedImage,
} from "@/lib/agent/sessionImages";
import type { ChatMessage } from "@/lib/types/chat";

/** 没有对话时共用的空数组：选择器每次返回新 [] 会让 zustand 每帧都判定变化。 */
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_IMAGES: AgentImageItem[] = [];

/** 当前对话里出现过的全部图片（联网检索 + 笔记配图 + 已生成）。 */
export function useSessionImages(enabled = true): AgentImageItem[] {
  const messages = useChatHistory((state) => {
    const sid = state.activeSessionId;
    return sid ? state.messagesById[sid] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  });
  const sessions = useImageGen((state) => state.sessions);

  return useMemo(() => {
    // 明细视图没开就不扫：流式期 messages 每 tick 换新引用，关着扫等于白付全量税。
    if (!enabled) return EMPTY_IMAGES;
    const base = collectMessageImages(messages.flatMap((message) => message.parts));
    const generated: GeneratedImage[] = [];
    const placeholders: AgentImageItem[] = [];
    for (const message of messages) {
      for (const part of getToolPartsByName({ parts: message.parts }, "generateImage")) {
        if (part.state !== "output-available" || !part.output?.imageGenId) continue;
        const session = sessions[part.output.imageGenId];
        // 批准之前生图会话里没有图；只有真正出图了才算「这个对话有这张图」。
        if (!session || session.status !== "done") continue;
        if (session.bodyRef && session.images.length === 0) {
          for (let index = 0; index < Math.max(1, session.count); index++) placeholders.push({ id: `gen:${session.id}:${index}`, kind: "generated", imageGenId: session.id, src: "", title: session.title, alt: session.prompt });
          continue;
        }
        if (session.images.length === 0) continue;
        generated.push({
          imageGenId: session.id,
          title: session.title,
          prompt: session.prompt,
          images: session.images,
        });
      }
    }
    return [...mergeGeneratedImages(base, generated), ...placeholders];
  }, [messages, sessions, enabled]);
}
