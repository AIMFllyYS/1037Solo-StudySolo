import {
  getDb,
  insertSession,
  insertTranscriptSegments,
  type ClassoloDb,
} from '@/classolo/lib/db'
import { getSelectedHotwordPackId } from '@/classolo/lib/providers/asr'
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import { patchTranscriptPrivate } from './private-store'

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
    const key=`${owner}:${overflowStorageKey(sessionId)}`;
    const existing:FlushSegment[]=JSON.parse(localStorage.getItem(key)||'[]');
    const merged=new Map([...existing,...rows].map(row=>[row.id,row]));
    localStorage.setItem(key, JSON.stringify([...merged.values()]));
    patchTranscriptPrivate({error:'部分文稿暂未保存，已保留恢复副本；请重试保存。'});
  } catch {
    patchTranscriptPrivate({error:'本地空间不足，文稿仍在内存中；请停止采集并导出，暂勿切换课堂或关闭页面。'});
  }
}

async function persistBatch(
  sessionId: string,
  rows: readonly FlushSegment[],
): Promise<number> {
  const db = recordingOwners.get(sessionId)
  if(!db)throw new Error("课堂身份已失效")
  const saved=await insertTranscriptSegments(
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
  if(typeof localStorage!=='undefined'){
    try{
      const key=`${db.userId}:${overflowStorageKey(sessionId)}`,raw=localStorage.getItem(key);
      if(raw){const existing:FlushSegment[]=JSON.parse(raw);const ids=new Set(rows.map(row=>row.id));localStorage.setItem(key,JSON.stringify(existing.filter(row=>!ids.has(row.id))));}
    }catch{/* Originals are already persisted; an extra recovery copy is safe. */}
  }
  return saved
}

export async function recoverTranscriptOverflow(db:ClassoloDb,sessionId:string):Promise<void>{
  const key=`${db.userId}:${overflowStorageKey(sessionId)}`;
  const rows:FlushSegment[]=JSON.parse(localStorage.getItem(key)||'[]');
  if(!rows.length)return;
  for(let offset=0;offset<rows.length;offset+=100)await insertTranscriptSegments(db,rows.slice(offset,offset+100).map(row=>({...row,sessionId})));
  localStorage.setItem(key,'[]');
}

export const transcriptFlusher = createTranscriptFlusher({
  persist: persistBatch,
  overflow: writeOverflow,
})

export async function persistRecordingSession(sessionId: string,profile?:ClassCourseProfile): Promise<void> {
  const config = readAsrRuntimeConfig(profile)
  const db = await getDb()
  recordingOwners.set(sessionId,db)
  await insertSession(db, {
    id: sessionId,
    title: profile?.courseName||new Date().toISOString().slice(0, 16).replace('T', ' ') + ' 课堂',
    status: 'recording',
    profile,
    asrSnapshot: {
      family: config.family,
      dialect: config.dialect ?? '',
      model: config.model,
      baseUrl: config.baseUrl,
      sampleRate: config.sampleRate,
      hotwordPack: profile?`${profile.disciplineId}/${profile.subdisciplineId}`:getSelectedHotwordPackId(),
    },
  })
}
