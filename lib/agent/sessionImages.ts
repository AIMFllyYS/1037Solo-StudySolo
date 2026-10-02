import { getToolPartsByName } from "@/lib/chat/messageParts";
import { dedupeByKey } from "@/lib/chat/traceSources";
import type { NoteImageHit } from "@/lib/ai/agent/toolTypes";
import type { WebSearchSource } from "@/lib/types/chat";
import type { ChatMessagePart } from "@/lib/types/chat";

/**
 * 图片页签的一条图片（纯数据 + 纯收集函数在这里，订阅 store 的 hook 见 lib/hooks/useSessionImages.ts）。
 *
 *
 * 三个来源共用一种形状：联网图片检索（Unsplash）、笔记配图检索、以及生成图。
 * 生成图在用户批准前不存在，所以它只在 imageGen store 里 status=done 之后才被收进来。
 */
export interface AgentImageItem {
  id: string;
  kind: "web" | "note" | "generated";
  src: string;
  title: string;
  alt?: string;
  /** 站内笔记路径或原文链接，点了能跳回去。 */
  href?: string;
  author?: string;
  /** 这一张属于哪一轮检索（分组用）。 */
  query?: string;
  imageGenId?: string;
}

function normalize(
  current: AgentImageItem[],
  item: AgentImageItem | null,
): AgentImageItem[] {
  if (!item || !item.src) return current;
  return [...current, item];
}

/** 纯函数：只从消息里的工具 part 收图片（不含生成图的 store 部分，那部分在 hook 里并进来）。 */
export function collectMessageImages(parts: ChatMessagePart[]): AgentImageItem[] {
  let out: AgentImageItem[] = [];

  for (const part of getToolPartsByName({ parts }, "imageSearch")) {
    if (part.state !== "output-available" || part.preliminary) continue;
    const query = part.input?.query ?? "";
    for (const [index, source] of (part.output.sources ?? []).entries()) {
      const item = source as WebSearchSource;
      out = normalize(out, {
        id: `web:${item.media || item.url || index}`,
        kind: "web",
        src: item.media || item.url || "",
        title: item.title || item.alt || item.url || "",
        alt: item.alt,
        href: item.url || undefined,
        author: item.author,
        query,
      });
    }
  }

  for (const part of getToolPartsByName({ parts }, "searchNoteImages")) {
    if (part.state !== "output-available" || part.preliminary) continue;
    const query = part.input?.query ?? "";
    for (const hit of part.output.images ?? []) {
      const item = hit as NoteImageHit;
      out = normalize(out, {
        id: `note:${item.src}`,
        kind: "note",
        src: item.src,
        title: item.title || item.caption || item.alt,
        alt: item.alt,
        href: item.path || undefined,
        query,
      });
    }
  }

  return dedupeByKey(out, (item) => item.src);
}

export interface GeneratedImage {
  imageGenId: string;
  title: string;
  prompt: string;
  images: { url?: string; b64_json?: string }[];
}

/** 把生成图的 store 会话并进来：data URL 与远程 URL 都还原成 src。 */
export function mergeGeneratedImages(
  items: AgentImageItem[],
  generated: readonly GeneratedImage[],
): AgentImageItem[] {
  let out = items;
  for (const session of generated) {
    for (const [index, image] of session.images.entries()) {
      const src = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : "");
      out = normalize(out, {
        id: `gen:${session.imageGenId}:${index}`,
        kind: "generated",
        imageGenId: session.imageGenId,
        src,
        title: session.title || session.prompt,
        alt: session.prompt,
      });
    }
  }
  return out;
}
