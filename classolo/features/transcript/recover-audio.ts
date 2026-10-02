import {getClassUserId,insertTranscriptSegments,type ClassoloDb} from '@/classolo/lib/db'
import {getTranscriptPublic} from '@/classolo/lib/session'
import {appendCommitted} from '@/classolo/lib/session/writes/transcript'
import {defaultTranscriptionsFetch} from '@/classolo/lib/providers/asr/transcriptions-rest/openai-compatible'
import {readAudioJobBytes,type ClassAudioJob} from './audio-jobs'

/** Cached successes never invoke a provider. Uncertain requests require billing verification first. */
export async function recoverAudioJob(db:ClassoloDb,job:ClassAudioJob):Promise<void>{
  const assertOwner=()=>{if(getClassUserId()!==db.userId||getTranscriptPublic().sessionId!==job.sessionId)throw new Error('课堂或账号已切换')}
  assertOwner()
  if(!job.id||!job.seq)throw new Error('旧格式录音只能导出，缺少稳定片段身份')
  if(getTranscriptPublic().committed.some(row=>row.id===job.id))return
  let text=job.text
  if(job.status!=='complete'||typeof text!=='string'){
    if(job.status!=='queued'&&job.status!=='retryable')throw new Error('这段转写结果或计费尚未确认，请先导出核对，不能自动重复请求')
    const wav=await readAudioJobBytes(job.key);assertOwner()
    if(!wav)throw new Error('本机音频不存在，请从备份恢复')
    text=await defaultTranscriptionsFetch({url:'/api/class/asr/audio/transcriptions',apiKey:'',model:'classroom-asr',wav,ownerId:db.userId,sessionId:job.sessionId,audioKey:job.key,requestId:crypto.randomUUID(),startMs:job.startMs,endMs:job.endMs,seq:job.seq,prompt:job.prompt})
  }
  assertOwner()
  const row={id:job.id,sessionId:job.sessionId,seq:job.seq,text,startMs:job.startMs,endMs:job.endMs}
  await insertTranscriptSegments(db,[row]);assertOwner();appendCommitted(row)
}
