import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { hydrateAttachmentsForApi, loadSessionRecovery, loadSessionSummaryHead, loadTurnsBefore } from '@/lib/storage/chatStorage';
import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import type { SessionMeta } from '@/lib/storage/chatStorage';

type ExportWritable = { write(chunk: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<ExportWritable> }>;
const EXPORT_TURNS_PER_READ = 8;

/** One bounded turn window at a time; the JSON format stays compatible with v1 exports. */
async function writeChatExport(metas: SessionMeta[], write: (chunk: string) => Promise<void>, assertOwner: () => void): Promise<void> {
  await write(JSON.stringify({ app: 'gailvlun', type: 'chat-export', version: 1, exportedAt: new Date().toISOString(), sessionCount: metas.length }).slice(0, -1) + ',"sessions":[');
  for (let sessionIndex = 0; sessionIndex < metas.length; sessionIndex++) {
    assertOwner();
    const meta = metas[sessionIndex];
    const head = await loadSessionSummaryHead(meta.id);
    assertOwner();
    if (!head && meta.messageCount > 0) throw new Error('chat_export_session_unavailable');
    const fields = { id: meta.id, title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt, context: meta.context, kind: meta.kind };
    await write(`${sessionIndex ? ',' : ''}${JSON.stringify(fields).slice(0, -1)},"messages":[`);
    let written = 0;
    for (let start = 0; head && start < head.spine.length; start += EXPORT_TURNS_PER_READ) {
      const end = Math.min(start + EXPORT_TURNS_PER_READ, head.spine.length);
      const window = await loadTurnsBefore(meta.id, end, end - start);
      assertOwner();
      if (!window || window.fromTurn !== start) throw new Error('chat_export_window_unavailable');
      const messages = await hydrateAttachmentsForApi(window.messages);
      assertOwner();
      for (let index = 0; index < messages.length; index++) {
        if ((messages[index].attachments?.length ?? 0) !== (window.messages[index].attachments?.length ?? 0)) throw new Error('chat_export_attachment_unavailable');
        await write(`${written++ ? ',' : ''}${JSON.stringify(messages[index])}`);
      }
    }
    if (head && written !== head.messageCount) throw new Error('chat_export_message_count_mismatch');
    const latest = await loadSessionSummaryHead(meta.id);
    assertOwner();
    if (latest?.revision !== head?.revision || latest?.messageCount !== head?.messageCount) throw new Error('chat_export_session_changed');
    await write(']}');
  }
  assertOwner();
  await write(']}');
}

/**
 * 把全部聊天数据（主对话 + 划词会话，含消息 / 工具调用元数据 / 图片附件）导出为本地 JSON 文件。
 * 纯本地 Blob 下载，绝不外发（守安全红线）。返回导出的会话数，供 UI 提示。
 */
export async function exportAllChats(): Promise<{ ok: boolean; count: number; reason?: 'empty' | 'cancelled' | 'failed' }> {
  if (typeof window === 'undefined') return { ok: false, count: 0, reason: 'failed' };
  const sessionsMeta = useChatHistory.getState().sessionsMeta.map((meta) => ({ ...meta }));
  if (sessionsMeta.length === 0) return { ok: false, count: 0, reason: 'empty' };
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const assertOwner = () => { if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error('chat_export_owner_changed'); };
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const filename = `gailvlun-chat-export-${stamp}.json`;
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    let writable: ExportWritable | null = null;
    try {
      const handle = await picker.call(window, { suggestedName: filename, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      assertOwner();
      writable = await handle.createWritable();
      await writeChatExport(sessionsMeta, (chunk) => writable!.write(chunk), assertOwner);
      await writable.close();
      return { ok: true, count: sessionsMeta.length };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      return { ok: false, count: 0, reason: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed' };
    }
  }
  // Browsers without File System Access still read one session window at a time.
  // Blob parts remain until download, so this path cannot claim bounded output bytes.
  const parts: string[] = [];
  try { await writeChatExport(sessionsMeta, async (chunk) => { parts.push(chunk); }, assertOwner); }
  catch { return { ok: false, count: 0, reason: 'failed' }; }
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { ok: true, count: sessionsMeta.length };
}

/** A conflict snapshot is exported from the captured owner's local recovery copy. */
export async function exportSessionRecovery(sessionId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const messages = await loadSessionRecovery(sessionId);
  if (!messages || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return false;
  const blob = new Blob([JSON.stringify({ app: 'gailvlun', type: 'chat-conflict-recovery', version: 1, sessionId, messages }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `studysolo-recovery-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
