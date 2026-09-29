export interface HotwordPack {
  id: string
  label: string
  terms: readonly string[]
}

export const HOTWORD_PACKS: readonly HotwordPack[] = [
  {
    id: 'physics',
    label: '物理',
    terms: [
      '牛顿第一定律',
      '牛顿第二定律',
      '牛顿第三定律',
      '加速度',
      '动能定理',
      '动量守恒',
      '万有引力',
    ],
  },
  {
    id: 'medicine',
    label: '医学',
    terms: [
      '心肌梗死',
      '肾功能不全',
      '解剖学',
      '动脉粥样硬化',
      '降钙素',
      '淋巴细胞',
    ],
  },
]

export const DEFAULT_HOTWORD_PACK_ID = 'physics'
const PACK_STORAGE_KEY = 'classolo-asr-hotword-pack'

let selectedPackId: string = DEFAULT_HOTWORD_PACK_ID
let packHydrated = false
const packListeners = new Set<() => void>()

function emitPack(): void {
  for (const listener of [...packListeners]) listener()
}

export function subscribeHotwordPack(listener: () => void): () => void {
  packListeners.add(listener)
  return () => {
    packListeners.delete(listener)
  }
}

function isKnownPackId(id: string): boolean {
  return HOTWORD_PACKS.some((item) => item.id === id)
}

function persistPack(id: string): void {
  selectedPackId = id
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PACK_STORAGE_KEY, id)
  } catch {
    // private-mode / quota: keep memory only
  }
}

function hydratePack(): void {
  if (packHydrated) return
  packHydrated = true
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(PACK_STORAGE_KEY)
    if (raw && isKnownPackId(raw)) selectedPackId = raw
  } catch {
    selectedPackId = DEFAULT_HOTWORD_PACK_ID
  }
}

export function listHotwordPacks(): readonly HotwordPack[] {
  return HOTWORD_PACKS
}

export function selectHotwordPack(id: string): void {
  const pack = HOTWORD_PACKS.find((item) => item.id === id)
  if (!pack) {
    throw new Error(`未知热词包：${id}`)
  }
  packHydrated = true
  persistPack(pack.id)
  emitPack()
}

export function getSelectedHotwordPackId(): string {
  hydratePack()
  return selectedPackId
}

export function resolveHotwordPack(
  id: string = getSelectedHotwordPackId(),
): readonly string[] {
  const pack = HOTWORD_PACKS.find((item) => item.id === id)
  if (!pack) return HOTWORD_PACKS[0]?.terms ?? []
  return pack.terms
}

export function resetHotwordPackSelection(): void {
  packHydrated = true
  selectedPackId = DEFAULT_HOTWORD_PACK_ID
  emitPack()
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(PACK_STORAGE_KEY)
  } catch {
    // ignore
  }
}
