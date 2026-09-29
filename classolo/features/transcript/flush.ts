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
  const out: FlushSegment[] = []
  for (const row of rows) {
    const prev = out[out.length - 1]
    if (
      prev &&
      row.startMs - prev.endMs < MERGE_GAP_MS &&
      prev.text.length < MERGE_SHORT_CHARS &&
      prev.text.length + row.text.length <= MERGE_MAX_CHARS
    ) {
      out[out.length - 1] = {
        ...prev,
        endMs: row.endMs,
        text: `${prev.text}${row.text}`,
      }
      continue
    }
    out.push({ ...row })
  }
  return out
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
  let flushing = false

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
    if (!sessionId || flushing || !shouldFlush(force)) return false
    flushing = true
    const batch = buffer.splice(0, buffer.length)
    const merged = mergeForFlush(batch)
    try {
      const ok = await persistWithRetry(
        options.persist,
        sessionId,
        merged,
        sleep,
      )
      if (!ok) {
        options.overflow?.(sessionId, merged)
        return false
      }
      lastFlushAt = now()
      return true
    } finally {
      flushing = false
    }
  }

  return {
    attach(nextSessionId: string): void {
      sessionId = nextSessionId
      buffer.length = 0
      lastFlushAt = now()
    },
    enqueue(segment: FlushSegment): void {
      buffer.push(segment)
    },
    pendingCount(): number {
      return buffer.length
    },
    flush,
  }
}
