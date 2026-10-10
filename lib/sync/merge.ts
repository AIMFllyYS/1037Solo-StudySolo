import type { ChatMessage } from "@/lib/types/chat";
import { compactStudyMessage, toolNameFromPart } from "@/lib/chat/messages/compactStudyParts";
import { getAnswerText } from "@/lib/chat/messages/messageParts";
import type { ChatSessionSyncPayload } from "./types";

function semanticScore(message: ChatMessage): number {
  let score = Math.min(getAnswerText(message).length, 2000);
  for (const part of message.parts ?? []) {
    if (part.type === "step-start") score += 5;
    if (part.type === "reasoning") score += 10;
    const name = toolNameFromPart(part);
    if (!name || !("state" in part) || part.state !== "output-available") continue;
    score += 50;
    const output = "output" in part && part.output && typeof part.output === "object"
      ? part.output as Record<string, unknown>
      : null;
    if (!output) continue;
    if (output.questions) score += 100;
    if (output.spec) score += 100;
    if (output.hits) score += 80;
    if (output.sources) score += 80;
    if (output.imageGenId) score += 80;
    if (output.artifactId) score += 40;
    if (output.contextKey) score += 20;
  }
  return score;
}

function pickRicherMessage(a: ChatMessage, b: ChatMessage): ChatMessage {
  const ca = compactStudyMessage(a, "persist");
  const cb = compactStudyMessage(b, "persist");
  const at = a.timestamp ?? 0;
  const bt = b.timestamp ?? 0;
  if (bt !== at) return bt > at ? cb : ca;
  return semanticScore(cb) >= semanticScore(ca) ? cb : ca;
}

/** 对话按 id 并集，不丢任何一侧的消息；同 id 取更新/更完整的一份，再按时序排。 */
export function mergeChatMessages(local: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of local) {
    if (message?.id) map.set(message.id, message);
  }
  for (const message of remote) {
    if (!message?.id) continue;
    const prev = map.get(message.id);
    map.set(message.id, prev ? pickRicherMessage(prev, message) : message);
  }
  return [...map.values()].sort((a, b) => {
    const dt = (a.timestamp ?? 0) - (b.timestamp ?? 0);
    if (dt !== 0) return dt;
    return a.id.localeCompare(b.id);
  });
}

export function mergeChatSessionPayloads(
  local: ChatSessionSyncPayload,
  remote: ChatSessionSyncPayload,
): { payload: ChatSessionSyncPayload; added: number } {
  const before = new Set(local.messages.map((m) => m.id));
  const messages = mergeChatMessages(local.messages, remote.messages);
  const added = messages.reduce((n, m) => n + (before.has(m.id) ? 0 : 1), 0);
  const localMeta = local.meta;
  const remoteMeta = remote.meta;
  const newer = (remoteMeta.updatedAt ?? 0) >= (localMeta.updatedAt ?? 0) ? remoteMeta : localMeta;
  const artifactIds = [...new Set([...(localMeta.artifactIds ?? []), ...(remoteMeta.artifactIds ?? [])])];
  return {
    added,
    payload: {
      v: 1,
      messages,
      meta: {
        ...newer,
        id: localMeta.id || remoteMeta.id,
        createdAt: Math.min(localMeta.createdAt ?? newer.createdAt, remoteMeta.createdAt ?? newer.createdAt),
        updatedAt: Math.max(localMeta.updatedAt ?? 0, remoteMeta.updatedAt ?? 0),
        messageCount: messages.length,
        artifactIds,
        preview: newer.preview ?? localMeta.preview ?? remoteMeta.preview,
      },
    },
  };
}

export function isRemoteNewer(remoteUpdatedAt: string, baselineUpdatedAt: string | undefined): boolean {
  if (!baselineUpdatedAt) return true;
  const remote = Date.parse(remoteUpdatedAt);
  const baseline = Date.parse(baselineUpdatedAt);
  if (Number.isNaN(remote) || Number.isNaN(baseline)) return true;
  return remote > baseline;
}
