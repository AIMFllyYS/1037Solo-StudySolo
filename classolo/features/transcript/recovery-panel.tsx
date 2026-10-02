'use client'
import {useEffect,useState} from 'react'
import {getClassUserId,getDb} from '@/classolo/lib/db'
import {useTranscriptPublic} from '@/classolo/lib/session'
import {listAudioJobs,type ClassAudioJob} from './audio-jobs'
import {recoverAudioJob} from './recover-audio'

export function AudioRecoveryPanel(){
  const sessionId=useTranscriptPublic(s=>s.sessionId),status=useTranscriptPublic(s=>s.recordingStatus)
  const committed=useTranscriptPublic(s=>s.committed)
  const [jobs,setJobs]=useState<ClassAudioJob[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{
    let active=true;const owner=getClassUserId()
    if(!owner||!sessionId)return
    void listAudioJobs(owner,sessionId).then(rows=>{if(active)setJobs(rows)}).catch(()=>{if(active)setError('本机录音恢复列表暂不可读')})
    return()=>{active=false}
  },[sessionId,status,committed])
  const pending=jobs.filter(job=>job.id&&!committed.some(row=>row.id===job.id))
  if(!pending.length&&!error)return null
  async function restore(job:ClassAudioJob){
    setBusy(true);setError('')
    try{await recoverAudioJob(await getDb(),job);setJobs(await listAudioJobs(getClassUserId()!,sessionId!))}
    catch(e){setError(e instanceof Error?e.message:'恢复失败')}
    finally{setBusy(false)}
  }
  return <details className="rounded-lg border border-[color:var(--line-soft)] p-2 text-[12px]"><summary>本机转写恢复 · {pending.length} 段</summary><p className="my-2 text-[color:var(--ink-faint)]">已成功的结果可直接恢复；失败重转按语音用量计费。结果未知的段落请先导出核对。</p>{pending.slice(0,20).map(job=><div className="my-1 flex items-center gap-2" key={job.key}><span className="mr-auto">{Math.floor(job.startMs/1000)}–{Math.floor(job.endMs/1000)}秒 · {job.status==='complete'?'已转写待恢复':job.status==='retryable'?'可重试':job.status==='queued'?'未转写':'结果待核对'}</span>{['complete','queued','retryable'].includes(job.status)&&<button type="button" disabled={busy||status==='recording'||status==='paused'} className="ss-tool" onClick={()=>void restore(job)}>{job.status==='complete'?'恢复文稿':'重试转写'}</button>}</div>)}{error&&<p role="alert">{error}</p>}</details>
}
