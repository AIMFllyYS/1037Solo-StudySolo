import { idbStorage, listPersistedKeys, flushPendingWrites, CHAT_BLOB_KEY_PREFIX, CHAT_SESSION_KEY_PREFIX } from "@/lib/storage/idbStorage";
import { CHAT_S3_KEY_PREFIX, chatHeadKey } from "./keys";
import type { ChatGcDeps } from "./types";
import { loadManifest } from "./manifest";
import { loadSessionMessages } from "./sessionStore";
import { extractBlobIdsFromMessages } from "./blobs";
function isBrowser(): boolean { return typeof window !== "undefined"; }
export async function listAllChatKeys(): Promise<string[]> {
  if (!isBrowser()) return [];
  const all = await listPersistedKeys();
  return all.filter(
    (k) =>
      k.startsWith(CHAT_BLOB_KEY_PREFIX) ||
      k.startsWith(CHAT_SESSION_KEY_PREFIX) ||
      k.startsWith(CHAT_S3_KEY_PREFIX),
  );
}

/**
 * 单轮 GC 允许删除的会话键上限。超过就认为 manifest 不可信、整轮放弃——
 * 正常情况只有「超出 50 条上限被淘汰」这类零星孤儿，绝不会有大批量同时失效。
 */
const MAX_ORPHAN_DELETIONS = 3;

/**
 * 以 manifest 为唯一真相源：不在入口里的 chat-session:* / 无引用的 chat-blob:* 删除。
 * 不会删掉仍被 manifest 会话引用的键。
 */
export async function gcOrphanedChatKeys(deps: ChatGcDeps = {}): Promise<{ deleted: string[] }> {
  const listKeys = deps.listKeys ?? listAllChatKeys;
  const removeKey = deps.removeKey ?? ((key: string) => idbStorage.removeItem(key));
  const loadMessages = deps.loadMessages ?? loadSessionMessages;
  const readManifest = deps.loadManifest ?? loadManifest;

  flushPendingWrites();
  const manifest = await readManifest();
  // 读不到 manifest 时**绝不能**把「keep 集合为空」当成真相：那等于一次删光所有会话正文。
  if (!manifest) return { deleted: [] };
  const keepSessions = new Set(manifest.sessions.map((s) => s.id));
  const keys = await listKeys();
  const deleted: string[] = [];

  // v2 单 blob 与 v3 分块键都算「会话正文键」：chat-s3:{id}:h|c:{n} 与会话同生共死。
  const orphanSessionIds = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(CHAT_SESSION_KEY_PREFIX)) {
      const sessionId = key.slice(CHAT_SESSION_KEY_PREFIX.length);
      if (sessionId && !keepSessions.has(sessionId)) orphanSessionIds.add(sessionId);
    } else if (key.startsWith(CHAT_S3_KEY_PREFIX)) {
      const rest = key.slice(CHAT_S3_KEY_PREFIX.length);
      const sessionId = rest.slice(0, rest.indexOf(':'));
      if (sessionId && !keepSessions.has(sessionId)) orphanSessionIds.add(sessionId);
    }
  }
  // 孤儿异常多 = manifest 很可能不是真相（被空列表/旧列表覆盖过、或水合失败）。
  // 这时**一个都不删**：误删正文是不可逆的，留几个孤儿键只是占点空间。
  if (orphanSessionIds.size > MAX_ORPHAN_DELETIONS) return { deleted: [] };

  for (const key of keys) {
    let sessionId: string | null = null;
    if (key.startsWith(CHAT_SESSION_KEY_PREFIX)) {
      sessionId = key.slice(CHAT_SESSION_KEY_PREFIX.length);
    } else if (key.startsWith(CHAT_S3_KEY_PREFIX)) {
      const rest = key.slice(CHAT_S3_KEY_PREFIX.length);
      sessionId = rest.slice(0, rest.indexOf(':'));
    }
    if (!sessionId || !orphanSessionIds.has(sessionId)) continue;
    await removeKey(key);
    deleted.push(key);
  }

  // 附件清理依赖「所有存活会话的正文都能读出来」。只要有一个存活会话的键在、正文却读不出来，
  // keep 集合就不完整，这一轮不动任何 blob（否则会把它们的附件误判成孤儿删掉）。
  const keepBlobs = new Set<string>();
  for (const sessionId of keepSessions) {
    const messages = await loadMessages(sessionId);
    if (!messages) {
      const bodyPresent =
        keys.includes(CHAT_SESSION_KEY_PREFIX + sessionId) || keys.includes(chatHeadKey(sessionId));
      if (bodyPresent) return { deleted };
      continue;
    }
    for (const blobId of extractBlobIdsFromMessages(messages)) keepBlobs.add(blobId);
  }

  for (const key of keys) {
    if (!key.startsWith(CHAT_BLOB_KEY_PREFIX)) continue;
    const blobId = key.slice(CHAT_BLOB_KEY_PREFIX.length);
    if (!blobId || keepBlobs.has(blobId)) continue;
    await removeKey(key);
    deleted.push(key);
  }

  return { deleted };
}

let gcTimer: ReturnType<typeof setTimeout> | null = null;
let gcIdleId: number | null = null;

export function cancelOrphanChatGc(): void {
  if (gcTimer) {
    clearTimeout(gcTimer);
    gcTimer = null;
  }
  if (gcIdleId != null && typeof window !== 'undefined') {
    window.cancelIdleCallback?.(gcIdleId);
    gcIdleId = null;
  }
}

export function scheduleOrphanChatGc(): void {
  if (typeof window === 'undefined') return;
  cancelOrphanChatGc();
  const run = () => {
    gcTimer = null;
    gcIdleId = null;
    void gcOrphanedChatKeys();
  };
  const ric = window.requestIdleCallback;
  if (typeof ric === 'function') {
    gcIdleId = ric(run, { timeout: 4000 });
    return;
  }
  gcTimer = setTimeout(run, 0);
}
