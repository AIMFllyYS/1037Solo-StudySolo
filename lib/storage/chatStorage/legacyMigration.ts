import type { ChatSession } from "@/lib/chat/sessionTypes";
import type { SessionMeta } from "./types";
import { idbStorage, PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { normalizeStoredMessages } from "@/lib/chat/messageParts";
import { loadManifest, buildManifest, buildSessionMeta, saveManifestNow } from "./manifest";
import { migrateAttachmentsInMessages, hydrateAttachmentsForApi } from "./blobs";
import { writeSessionV3Now, loadSessionMessages } from "./sessionStore";
function isBrowser(): boolean { return typeof window !== "undefined"; }
interface V1Persisted {
  state?: { sessions?: ChatSession[]; activeSessionId?: string | null };
  sessions?: ChatSession[];
  activeSessionId?: string | null;
}

/** 幂等：存在 legacy chat-history 且无 manifest 时拆分写入 v2。 */
export async function migrateFromV1IfNeeded(): Promise<boolean> {
  if (!isBrowser()) return false;
  const existing = await loadManifest();
  if (existing) return false;

  const legacyRaw = await idbStorage.getItem(PERSIST_KEYS.chatHistory);
  if (!legacyRaw) return false;

  let parsed: V1Persisted;
  try {
    parsed = JSON.parse(legacyRaw) as V1Persisted;
  } catch {
    return false;
  }

  const sessions: ChatSession[] = parsed.state?.sessions ?? parsed.sessions ?? [];
  const activeSessionId = parsed.state?.activeSessionId ?? parsed.activeSessionId ?? null;

  const metas: SessionMeta[] = [];
  try {
    for (const session of sessions) {
      const messages = await migrateAttachmentsInMessages(
        normalizeStoredMessages(session.messages as unknown[]),
      );
      const saved = await writeSessionV3Now(session.id, messages);
      if (!saved) return false;
      metas.push(buildSessionMeta({ ...session, messages }));
    }

    // v1 没有项目概念：folders / activeProjectId 交给 buildManifest 补默认值。
    const manifestSaved = await saveManifestNow(buildManifest({ activeSessionId, sessions: metas }));
    if (!manifestSaved) return false;
  } catch {
    return false;
  }

  await idbStorage.removeItem(PERSIST_KEYS.chatHistory);
  return true;
}

/** 导出：并行加载全部会话并 hydrate 附件为 inline base64（兼容 v1 导出格式）。 */
export async function loadAllSessionsForExport(metas: SessionMeta[]): Promise<ChatSession[]> {
  const sessions: ChatSession[] = [];
  for (const meta of metas) {
    const messages = (await loadSessionMessages(meta.id)) ?? [];
    const hydrated = await hydrateAttachmentsForApi(messages);
    sessions.push({
      id: meta.id,
      title: meta.title,
      messages: hydrated,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      context: meta.context,
      kind: meta.kind,
    });
  }
  return sessions;
}
