'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {useVirtualizer} from '@tanstack/react-virtual'
import { useStore } from 'zustand'
import { Mic, Pause, Play, Square } from 'lucide-react'

import { getTranscriptPublic,subscribeCommands,useTranscriptPublic } from '@/classolo/lib/session'

import {
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
} from './pipeline'
import { transcriptPrivateStore } from './private-store'
import {AudioRecoveryPanel} from './recovery-panel'
import {TranscriptSegmentLine} from './segment-line'
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'

function connectionLabel(
  connection: 'idle' | 'live' | 'reconnecting',
): string {
  switch (connection) {
    case 'live':
      return '已连接'
    case 'reconnecting':
      return '重连中'
    default:
      return '未连接'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'recording':
      return '录音中'
    case 'paused':
      return '已暂停'
    case 'stopped':
      return '已结束'
    default:
      return '待开始'
  }
}

function useElapsed(recording: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    if (!recording) {
      startRef.current = null
      return
    }
    startRef.current = Date.now() - elapsed * 1000
    const timer = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])
  return elapsed
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TranscriptPane({ enabled = true,profile,onAddTerm }: { enabled?: boolean;profile?:ClassCourseProfile;onAddTerm?:(term:string)=>void }) {
  const status = useTranscriptPublic((state) => state.recordingStatus)
  const committed = useTranscriptPublic((state) => state.committed)
  const sessionId=useTranscriptPublic(state=>state.sessionId)
  const terms=useMemo(()=>profile?planClassHotwords(profile).accepted:[],[profile])
  const error = useStore(transcriptPrivateStore, (state) => state.error)
  const partial = useStore(transcriptPrivateStore, (state) => state.partial)
  const highlightId = useStore(transcriptPrivateStore, (state) => state.highlightId)
  const connection = useStore(transcriptPrivateStore, (state) => state.connection)
  const lifecycle=useStore(transcriptPrivateStore,state=>state.lifecycle)
  const transitioning=lifecycle!=='idle'
  const scrollRef=useRef<HTMLDivElement>(null)
  const [following,setFollowing]=useState(true)
  const [newCount,setNewCount]=useState(0)
  const previousLength=useRef(committed.length)
  // TanStack Virtual owns a mutable measurement engine; React Compiler deliberately leaves this view uncompiled.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer=useVirtualizer({count:committed.length+(partial?1:0),getScrollElement:()=>scrollRef.current,estimateSize:()=>92,overscan:6,getItemKey:index=>committed[index]?.id??'partial'})
  const recording = status === 'recording'
  const elapsed = useElapsed(recording)

  useEffect(()=>subscribeCommands(command=>{if(command.type!=='transcript.scrollTo')return;const index=getTranscriptPublic().committed.findIndex(segment=>segment.id===command.segmentId);if(index<0)return;setFollowing(false);virtualizer.scrollToIndex(index,{align:'center'})}),[virtualizer])
  useEffect(()=>{if(!highlightId)return;const index=getTranscriptPublic().committed.findIndex(segment=>segment.id===highlightId);if(index>=0){setFollowing(false);virtualizer.scrollToIndex(index,{align:'center'})}},[highlightId,virtualizer])
  useEffect(()=>{const added=Math.max(0,committed.length-previousLength.current);previousLength.current=committed.length;if(status!=='recording')return;if(following){virtualizer.scrollToIndex(Math.max(0,committed.length+(partial?1:0)-1),{align:'end'});setNewCount(0)}else if(added)setNewCount(count=>count+added)},[committed.length,partial,following,status,virtualizer])
  function onScroll(){const el=scrollRef.current;if(!el)return;const nearEnd=el.scrollHeight-el.scrollTop-el.clientHeight<80;setFollowing(nearEnd);if(nearEnd)setNewCount(0)}

  const idle = status === 'idle' || status === 'stopped'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        {idle ? (
          <button
            type="button"
            onClick={() => void startSession()}
            disabled={!enabled||transitioning}
            className="press inline-flex items-center gap-1.5 rounded-lg transition-colors duration-[var(--duration-fast)] bg-[color:var(--accent)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--md-sys-color-on-primary)] disabled:opacity-40"
          >
            <Mic className="size-4" />
            {lifecycle==='starting'?'正在启动…':'开始录音'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={transitioning}
              onClick={() =>
                void (status === 'paused' ? resumeSession() : pauseSession())
              }
              className="press inline-flex items-center gap-1.5 rounded-lg transition-colors duration-[var(--duration-fast)] border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[13px] text-[color:var(--ink)] hover:bg-[color:var(--bg-muted)]"
            >
              {status === 'paused' ? (
                <>
                  <Play className="size-4" />
                  继续
                </>
              ) : (
                <>
                  <Pause className="size-4" />
                  暂停
                </>
              )}
            </button>
            <button
              type="button"
              disabled={transitioning}
              onClick={() => void stopSession().catch(()=>{})}
              className="press inline-flex items-center gap-1.5 rounded-lg transition-colors duration-[var(--duration-fast)] border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[13px] text-[color:var(--ink)] hover:bg-[color:var(--bg-muted)]"
            >
              <Square className="size-4" />
              {lifecycle==='stopping'?'正在保存尾段…':'结束'}
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-[12px] text-[color:var(--ink-soft)]">
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
              recording
                ? 'bg-[color:var(--accent-weak)] text-[color:var(--accent-ink)]'
                : 'bg-[color:var(--bg-muted)] text-[color:var(--ink-soft)]',
            ].join(' ')}
          >
            {recording ? (
              <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--md-sys-color-error)]" />
            ) : null}
            {statusLabel(status)}
          </span>
          {!idle ? (
            <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          ) : null}
          {!idle ? <span>· {connectionLabel(connection)}</span> : null}
        </div>
      </div>

      {!idle ? <MicLevel/> : null}

      {error ? (
        <p
          className="rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-muted)] px-3 py-2 text-[12px] text-[color:var(--md-sys-color-error,#b42318)]"
          data-slot="capture-error"
          role="alert"
        >
          {/NotAllowed|Permission|permission|denied|拒绝/.test(error)
            ? '无法访问麦克风：请在浏览器地址栏或系统设置中允许本站使用麦克风后重试。也可以改用「导入文稿」。'
            : error}
        </p>
      ) : null}

      <AudioRecoveryPanel/>
      {!following&&newCount>0&&<button type="button" className="self-end rounded-md bg-[color:var(--accent-weak)] px-2 py-1 text-[11px]" onClick={()=>{setFollowing(true);setNewCount(0);virtualizer.scrollToIndex(committed.length+(partial?1:0)-1,{align:'end'})}}>新增 {newCount} 段，回到实时文稿</button>}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto"
        data-slot="transcript-stream"
      >
        {committed.length === 0 && !partial ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[color:var(--ink-faint)]">
            <Mic className="size-6 opacity-50" />
            <p>点击「开始录音」，或从上方导入已有文稿</p>
          </div>
        ) : <div style={{height:virtualizer.getTotalSize(),position:'relative'}}>{virtualizer.getVirtualItems().map(item=>{
          const segment=committed[item.index]
          return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${item.start}px)`,paddingBottom:6}}>{segment?<TranscriptSegmentLine segment={segment} sessionId={sessionId} terms={terms} highlighted={highlightId===segment.id} onAddTerm={onAddTerm}/>:<p className="px-2 py-1 italic text-[color:var(--ink-faint)]" data-slot="transcript-partial">{partial}</p>}</div>
        })}</div>}
      </div>
    </div>
  )
}

function MicLevel(){
  const level=useStore(transcriptPrivateStore,state=>state.level)
  return <div className="flex items-center gap-2" aria-label="麦克风电平"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--bg-muted)]"><div className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-150" style={{width:`${Math.min(100,Math.round(level*100))}%`}}/></div><span className="w-9 text-right text-[11px] tabular-nums text-[color:var(--ink-faint)]">{Math.round(level*100)}%</span></div>
}
