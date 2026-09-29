const CUSTOM_HOTWORDS_KEY = 'classolo-asr-hotwords-custom'

let hydrated = false
let memory: string[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function subscribeCustomHotwords(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function normalizeHotwords(words: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const word of words) {
    const trimmed = word.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    next.push(trimmed)
  }
  return next
}

function persist(words: string[]): void {
  memory = words
  if (typeof localStorage === 'undefined') return
  try {
    if (words.length === 0) {
      localStorage.removeItem(CUSTOM_HOTWORDS_KEY)
      return
    }
    localStorage.setItem(CUSTOM_HOTWORDS_KEY, JSON.stringify(words))
  } catch {
    // private-mode / quota: keep memory only
  }
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(CUSTOM_HOTWORDS_KEY)
    if (!raw) return
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    memory = normalizeHotwords(
      parsed.filter((item): item is string => typeof item === 'string'),
    )
  } catch {
    memory = []
  }
}

export function parseCustomHotwordText(text: string): string[] {
  return normalizeHotwords(text.split(/[\n,，;；]+/))
}

export function mergeHotwords(
  pack: readonly string[],
  custom: readonly string[],
): string[] {
  return normalizeHotwords([...pack, ...custom])
}

export function getCustomHotwords(): readonly string[] {
  hydrate()
  return memory
}

export function getCustomHotwordText(): string {
  return getCustomHotwords().join('\n')
}

export function setCustomHotwords(words: readonly string[]): void {
  hydrated = true
  persist(normalizeHotwords(words))
  emit()
}

export function resetCustomHotwords(): void {
  hydrated = true
  persist([])
  emit()
}
