import { getDb, insertChatMessage } from '@/classolo/lib/db'
import type { ChatRow } from '@/classolo/lib/db'
import { getTranscriptPublic } from '@/classolo/lib/session'

import { setChatMessages, type ChatMessage } from './chat-store'

const seqBySession = new Map<string, number>()

export interface ChatTerminalRecord {
  role: 'user' | 'assistant'
  content: string
}

export type PersistChatTerminal = (record: ChatTerminalRecord) => Promise<void>

function nextSeq(sessionId: string): number {
  const current = seqBySession.get(sessionId) ?? 0
  seqBySession.set(sessionId, current + 1)
  return current
}

export function resetChatPersistSeq(): void {
  seqBySession.clear()
}

/** 从已加载的会话快照 chat 行恢复多轮历史（去掉 system/tool 角色）。 */
export function hydrateChatHistory(rows: readonly ChatRow[]): void {
  const messages: ChatMessage[] = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .sort((a, b) => a.seq - b.seq)
    .map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }))
  setChatMessages(messages)
  const sessionId = rows[0]?.sessionId
  if (sessionId) {
    const maxSeq = rows.reduce((max, row) => Math.max(max, row.seq), -1)
    seqBySession.set(sessionId, maxSeq + 1)
  }
}

export async function persistChatTerminal(
  record: ChatTerminalRecord,
): Promise<void> {
  const sessionId = getTranscriptPublic().sessionId
  if (!sessionId) return
  try {
    const db = await getDb()
    await insertChatMessage(db, {
      sessionId,
      seq: nextSeq(sessionId),
      role: record.role,
      content: record.content,
    })
  } catch {
    // persistence must never blank the chat UI
  }
}
