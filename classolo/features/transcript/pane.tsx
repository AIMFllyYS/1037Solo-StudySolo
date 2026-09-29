'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { Mic, Pause, Play, Square } from 'lucide-react'

import { useTranscriptPublic } from '@/classolo/lib/session'

import {
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
} from './pipeline'
import { transcriptPrivateStore } from './private-store'

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

export function TranscriptPane({ enabled = true }: { enabled?: boolean }) {
  const status = useTranscriptPublic((state) => state.recordingStatus)
  const committed = useTranscriptPublic((state) => state.committed)
  const error = useStore(transcriptPrivateStore, (state) => state.error)
  const level = useStore(transcriptPrivateStore, (state) => state.level)
  const partial = useStore(transcriptPrivateStore, (state) => state.partial)
  const highlightId = useStore(transcriptPrivateStore, (state) => state.highlightId)
  const connection = useStore(transcriptPrivateStore, (state) => state.connection)
  const endRef = useRef<HTMLDivElement>(null)
  const recording = status === 'recording'
  const elapsed = useElapsed(recording)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [committed.length, partial])

  const idle = status === 'idle' || status === 'stopped'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        {idle ? (
          <button
            type="button"
            onClick={() => void startSession()}
            disabled={!enabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--accent-ink)] disabled:opacity-40"
          >
            <Mic className="size-4" />
            开始录音
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                void (status === 'paused' ? resumeSession() : pauseSession())
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[13px] text-[color:var(--ink)] hover:bg-[color:var(--bg-muted)]"
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
              onClick={() => void stopSession()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[13px] text-[color:var(--ink)] hover:bg-[color:var(--bg-muted)]"
            >
              <Square className="size-4" />
              结束
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
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
            ) : null}
            {statusLabel(status)}
          </span>
          {!idle ? (
            <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          ) : null}
          {!idle ? <span>· {connectionLabel(connection)}</span> : null}
        </div>
      </div>

      {!idle ? (
        <div className="flex items-center gap-2" aria-label="麦克风电平">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--bg-muted)]">
            <div
              className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-150"
              style={{ width: `${Math.min(100, Math.round(level * 100))}%` }}
            />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums text-[color:var(--ink-faint)]">
            {Math.round(level * 100)}%
          </span>
        </div>
      ) : null}

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

      <div
        className="min-h-0 flex-1 space-y-1.5 overflow-auto"
        data-slot="transcript-stream"
      >
        {committed.length === 0 && !partial ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[color:var(--ink-faint)]">
            <Mic className="size-6 opacity-50" />
            <p>点击「开始录音」，或从上方导入已有文稿</p>
          </div>
        ) : (
          committed.map((segment) => (
            <p
              key={segment.id}
              data-segment-id={segment.id}
              className={[
                'rounded-md px-2 py-1 text-[color:var(--ink)] transition-colors',
                highlightId === segment.id
                  ? 'bg-[color:var(--accent-weak)]'
                  : '',
              ].join(' ')}
            >
              {segment.text}
            </p>
          ))
        )}
        {partial ? (
          <p
            className="px-2 py-1 italic text-[color:var(--ink-faint)]"
            data-slot="transcript-partial"
          >
            {partial}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  )
}
