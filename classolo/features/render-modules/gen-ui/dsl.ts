export const GEN_UI_VERSION = '1.0'

export const GEN_UI_WHITELIST = ['text', 'kpi', 'stack'] as const

export type GenUiNode =
  | { type: 'text'; text: string }
  | { type: 'kpi'; label: string; value: string }
  | { type: 'stack'; children: readonly GenUiNode[] }

export type ParsedDsl =
  | { ok: true; node: GenUiNode }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseGenUiDsl(raw: unknown): ParsedDsl {
  if (typeof raw === 'string') {
    try {
      return parseGenUiDsl(JSON.parse(raw) as unknown)
    } catch {
      return { ok: false, error: 'DSL 不是合法 JSON' }
    }
  }
  return parseNode(raw)
}

function parseNode(raw: unknown): ParsedDsl {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return { ok: false, error: 'DSL 节点缺少 type' }
  }
  if (!(GEN_UI_WHITELIST as readonly string[]).includes(raw.type)) {
    return { ok: false, error: `白名单外组件：${raw.type}` }
  }
  if (raw.type === 'text') {
    if (typeof raw.text !== 'string') {
      return { ok: false, error: 'text 节点需要 string text' }
    }
    return { ok: true, node: { type: 'text', text: raw.text } }
  }
  if (raw.type === 'kpi') {
    if (typeof raw.label !== 'string' || typeof raw.value !== 'string') {
      return { ok: false, error: 'kpi 节点需要 label 与 value 字符串' }
    }
    return {
      ok: true,
      node: { type: 'kpi', label: raw.label, value: raw.value },
    }
  }
  if (!Array.isArray(raw.children)) {
    return { ok: false, error: 'stack 节点需要 children 数组' }
  }
  const children: GenUiNode[] = []
  for (const child of raw.children) {
    const parsed = parseNode(child)
    if (!parsed.ok) return parsed
    children.push(parsed.node)
  }
  return { ok: true, node: { type: 'stack', children } }
}
