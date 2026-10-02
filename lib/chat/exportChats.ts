import { useChatHistory } from '@/lib/hooks/useChatHistory';
import { loadAllSessionsForExport, loadSessionRecovery } from '@/lib/storage/chatStorage';

/**
 * 把全部聊天数据（主对话 + 划词会话，含消息 / 工具调用元数据 / 图片附件）导出为本地 JSON 文件。
 * 纯本地 Blob 下载，绝不外发（守安全红线）。返回导出的会话数，供 UI 提示。
 */
export async function exportAllChats(): Promise<{ ok: boolean; count: number }> {
  if (typeof window === 'undefined') return { ok: false, count: 0 };
  const { sessionsMeta } = useChatHistory.getState();
  if (sessionsMeta.length === 0) return { ok: false, count: 0 };

  const sessions = await loadAllSessionsForExport(sessionsMeta);

  const payload = {
    app: 'gailvlun',
    type: 'chat-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    sessions,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `gailvlun-chat-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { ok: true, count: sessions.length };
}

/** A conflict snapshot is exported from the captured owner's local recovery copy. */
export async function exportSessionRecovery(sessionId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const messages = await loadSessionRecovery(sessionId);
  if (!messages) return false;
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
