export const FLUSH_SEGMENT_COUNT = 20
export const FLUSH_INTERVAL_MS = 10_000
export const FLUSH_CHAR_COUNT = 4000
export const RING_CAPACITY = 512
export const MERGE_GAP_MS = 300
export const MERGE_SHORT_CHARS = 8
export const MERGE_MAX_CHARS = 400
export const RETRY_DELAYS_MS = [200, 800, 3000] as const

export interface FlushSegment {
  id: string
  seq: number
  startMs: number
  endMs: number
  text: string
}

export type PersistBatch = (
  sessionId: string,
  rows: readonly FlushSegment[],
) => Promise<number>

export type OverflowSink = (
  sessionId: string,
  rows: readonly FlushSegment[],
) => void

export function overflowStorageKey(sessionId: string): string {
  return `classolo.transcript.overflow.${sessionId}`
}

export function mergeForFlush(
  rows: readonly FlushSegment[],
): FlushSegment[] {
  // Permanent IDs are used by citations and mindmap provenance. Merge only in display views.
  return rows.map(row => ({ ...row }))
}

function charCount(rows: readonly FlushSegment[]): number {
  let total = 0
  for (const row of rows) total += row.text.length
  return total
}

async function persistWithRetry(
  persist: PersistBatch,
  sessionId: string,
  rows: readonly FlushSegment[],
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  try {
    await persist(sessionId, rows)
    return true
  } catch {
    // retry below
  }
  for (const delay of RETRY_DELAYS_MS) {
    await sleep(delay)
    try {
      await persist(sessionId, rows)
      return true
    } catch {
      // continue
    }
  }
  return false
}

export function createTranscriptFlusher(options: {
  persist: PersistBatch
  overflow?: OverflowSink
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}) {
  const now = options.now ?? (() => Date.now())
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
      }))
  const buffer: FlushSegment[] = []
  let sessionId: string | null = null
  let lastFlushAt = 0
  let active: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() { if (timer) clearTimeout(timer); timer = null }
  function armTimer() {
    if (timer || !buffer.length) return
    timer = setTimeout(() => {
      timer = null
      void flush(true).finally(() => { if (buffer.length) armTimer() })
    }, FLUSH_INTERVAL_MS)
    // Tests/Node imports should not be kept alive by a browser persistence timer.
    ;(timer as unknown as { unref?: () => void }).unref?.()
  }

  function shouldFlush(force: boolean): boolean {
    if (buffer.length === 0) return false
    if (force) return true
    if (buffer.length >= FLUSH_SEGMENT_COUNT) return true
    if (charCount(buffer) >= FLUSH_CHAR_COUNT) return true
    if (lastFlushAt > 0 && now() - lastFlushAt >= FLUSH_INTERVAL_MS) return true
    if (buffer.length >= RING_CAPACITY) return true
    return false
  }

  async function flush(force = false): Promise<boolean> {
    if (active) {
      const ok = await active
      if (!ok) return false
      return force && buffer.length ? flush(true) : ok
    }
    if (!sessionId || !shouldFlush(force)) return false
    clearTimer()
    const targetSession = sessionId
    const batch = mergeForFlush(buffer.slice(0, 100))
    active = (async () => {
      const ok = await persistWithRetry(options.persist, targetSession, batch, sleep)
      if (!ok) {
        try { options.overflow?.(targetSession, batch) } catch { /* retain the in-memory originals */ }
        return false
      }
      const ids = new Set(batch.map(row => row.id))
      for (let i=buffer.length-1;i>=0;i--) if (ids.has(buffer[i].id)) buffer.splice(i,1)
      lastFlushAt = now()
      return true
    })()
    let ok: boolean
    try { ok = await active } finally { active = null }
    if (ok && force && buffer.length) return flush(true)
    armTimer()
    return ok
  }

  return {
    attach(nextSessionId: string): void {
      if (active || buffer.length) throw new Error('上一节课的文稿尚未保存，请重试保存后再开始新课')
      clearTimer()
      sessionId = nextSessionId
      lastFlushAt = now()
    },
    enqueue(segment: FlushSegment): void {
      if (buffer.some(row => row.id === segment.id)) return
      buffer.push(segment)
      armTimer()
    },
    pendingCount(): number {
      return buffer.length
    },
    flush,
  }
}
