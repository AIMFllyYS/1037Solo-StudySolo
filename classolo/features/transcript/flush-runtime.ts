import {
  getDb,
  insertSession,
  insertTranscriptSegments,
  type ClassoloDb,
} from '@/classolo/lib/db'
import { getSelectedHotwordPackId } from '@/classolo/lib/providers/asr'

import { readAsrRuntimeConfig } from './asr-config'
import {
  createTranscriptFlusher,
  overflowStorageKey,
  type FlushSegment,
} from './flush'

const recordingOwners=new Map<string,ClassoloDb>();

function writeOverflow(sessionId: string, rows: readonly FlushSegment[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const owner=recordingOwners.get(sessionId)?.userId
    if(!owner)throw new Error("课堂身份未知，无法保存溢出缓存")
    localStorage.setItem(`${owner}:${overflowStorageKey(sessionId)}`, JSON.stringify(rows))
  } catch {
    // quota: keep going; recording must not stop
  }
}

async function persistBatch(
  sessionId: string,
  rows: readonly FlushSegment[],
): Promise<number> {
  const db = recordingOwners.get(sessionId)
  if(!db)throw new Error("课堂身份已失效")
  return insertTranscriptSegments(
    db,
    rows.map((row) => ({
      id: row.id,
      sessionId,
      seq: row.seq,
      startMs: row.startMs,
      endMs: row.endMs,
      text: row.text,
    })),
  )
}

export const transcriptFlusher = createTranscriptFlusher({
  persist: persistBatch,
  overflow: writeOverflow,
})

export async function persistRecordingSession(sessionId: string): Promise<void> {
  const config = readAsrRuntimeConfig()
  const db = await getDb()
  recordingOwners.set(sessionId,db)
  await insertSession(db, {
    id: sessionId,
    title: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' 课堂',
    status: 'recording',
    asrSnapshot: {
      family: config.family,
      dialect: config.dialect ?? '',
      model: config.model,
      baseUrl: config.baseUrl,
      sampleRate: config.sampleRate,
      hotwordPack: getSelectedHotwordPackId(),
    },
  })
}
