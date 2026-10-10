import type { ChatMessage } from "@/lib/types/chat";
import type { ChatSession } from "@/lib/chat/sessionTypes";
import { getMessageText, getToolPartsByName } from "@/lib/chat/messages/messageParts";
import { idbStorage, setItemNow, PERSIST_KEYS } from "@/lib/storage/idbStorage";
import type { SessionMeta, ChatFolder, ChatManifestV2, ManifestSource } from "./types";
function isBrowser(): boolean { return typeof window !== "undefined"; }
/** 三个默认项目：笔记记录（笔记窗内 Agent 会话）/ 划词摘录（划词助手会话）/ 定时任务（调度器触发的会话）。 */
export const SYSTEM_PROJECTS: readonly ChatFolder[] = [
  { id: 'project-note', name: '笔记记录', createdAt: 0, system: 'note' },
  { id: 'project-floating', name: '划词摘录', createdAt: 0, system: 'floating' },
  { id: 'project-scheduled', name: '定时任务', createdAt: 0, system: 'scheduled' },
];

export const SYSTEM_PROJECT_IDS = SYSTEM_PROJECTS.map((project) => project.id);

export function isSystemProject(folder: Pick<ChatFolder, 'system' | 'id'>): boolean {
  return Boolean(folder.system) || SYSTEM_PROJECT_IDS.includes(folder.id);
}

/**
 * 补齐两个系统项目（幂等）。返回新数组；没有变化时返回 null，调用方据此跳过落盘。
 * 用户改过的名字保留：只按 id 判断缺不缺，不按名字判断。
 */
export function ensureDefaultProjects(folders: ChatFolder[]): ChatFolder[] | null {
  const existing = new Set(folders.map((folder) => folder.id));
  const missing = SYSTEM_PROJECTS.filter((project) => !existing.has(project.id));
  if (missing.length === 0) return null;
  return [...folders, ...missing.map((project) => ({ ...project }))];
}

/**
 * manifest 的唯一构造入口。**只允许走这里**：2026-09-19 的数据事故与之后的
 * 「云端拉取丢 folders」都源于手写对象字面量漏字段——新增字段时这里改一处就够。
 */
export function buildManifest(input: {
  activeSessionId: string | null;
  sessions: SessionMeta[];
  folders?: ChatFolder[];
  activeProjectId?: string | null;
}): ChatManifestV2 {
  return {
    version: 2,
    activeSessionId: input.activeSessionId,
    sessions: input.sessions,
    folders: input.folders ?? [],
    activeProjectId: input.activeProjectId ?? null,
  };
}

/**
 * 从状态切片构造 manifest，只覆盖显式传入的字段。**所有写盘路径都必须走这里。**
 * 两次真实事故（2026-09-19 会话被清空、2026-09-20 云端拉取丢项目）都是手写 manifest 字面量漏字段造成的。
 */
export function manifestFrom(
  source: ManifestSource,
  overrides: Partial<Pick<ChatManifestV2, "activeSessionId" | "sessions" | "folders" | "activeProjectId">> = {},
): ChatManifestV2 {
  return buildManifest({
    activeSessionId: source.activeSessionId,
    sessions: source.sessionsMeta,
    folders: source.folders,
    activeProjectId: source.activeProjectId,
    ...overrides,
  });
}

export function collectArtifactIdsFromMessages(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    for (const part of getToolPartsByName(m, 'renderInteractive')) {
      if (part.state === 'output-available' && part.output.artifactId) ids.push(part.output.artifactId);
    }
  }
  return ids;
}

export function buildSessionMeta(session: ChatSession): SessionMeta {
  const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    kind: session.kind,
    context: session.context,
    messageCount: session.messages.length,
    preview: lastUser ? getMessageText(lastUser).slice(0, 80) : undefined,
    artifactIds: collectArtifactIdsFromMessages(session.messages),
  };
}

export function mergeArtifactIds(existing: string[], messages: ChatMessage[]): string[] {
  const set = new Set(existing);
  for (const id of collectArtifactIdsFromMessages(messages)) set.add(id);
  return [...set];
}

export async function loadManifest(): Promise<ChatManifestV2 | null> {
  if (!isBrowser()) return null;
  const raw = await idbStorage.getItem(PERSIST_KEYS.chatManifest);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChatManifestV2;
    if (parsed?.version === 2 && Array.isArray(parsed.sessions)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveManifest(manifest: ChatManifestV2): void {
  idbStorage.setItem(PERSIST_KEYS.chatManifest, JSON.stringify(manifest));
}

/** Sync pull checkpoint waits for the durable manifest write. */
export async function saveManifestCommitted(manifest: ChatManifestV2): Promise<void> {
  if (!await setItemNow(PERSIST_KEYS.chatManifest, JSON.stringify(manifest))) throw new Error("manifest_checkpoint_failed");
}

export async function saveManifestNow(manifest: ChatManifestV2): Promise<boolean> {
  return setItemNow(PERSIST_KEYS.chatManifest, JSON.stringify(manifest));
}
