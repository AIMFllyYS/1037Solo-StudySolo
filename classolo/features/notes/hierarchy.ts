/**
 * 大纲层级构建（issue #65 / mindmap 需求）。
 *
 * 模型可用缩进（前导空格/制表/“- ”）或 Markdown 标题层级表达父子关系。
 * 这里把带层级标记的文本行解析为稳定 id 的树（root -> 主题 -> 子点），
 * 供 dagre 布局与增量 diff 使用。id 由标题内容 + 路径派生，保证稳定。
 */
import type { OutlineTreeNode } from '@/classolo/components/mindmap'

export interface OutlineLine {
  title: string
  depth: number
}

/** 稳定 id：同标题在同一父级下始终得到同一 id，避免导图整图重建。 */
export function stableOutlineId(parentId: string | null, title: string): string {
  const seed = `${parentId ?? 'root'}\u0000${title}`
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return `on-${Math.abs(hash)}`
}

/** 解析一行的缩进深度与纯标题（去掉编号/项目符号/标题井号）。 */
export function parseOutlineLine(raw: string): OutlineLine | null {
  const withoutTrailing = raw.replace(/\s+$/u, '')
  if (!withoutTrailing.trim()) return null
  const leading = withoutTrailing.match(/^[\s\t]*/u)?.[0] ?? ''
  // 每 2 个空格或一个 Tab 记一层缩进。
  const indentDepth = Math.floor(
    (leading.replace(/\t/gu, '  ').length) / 2,
  )
  let body = withoutTrailing.trim()
  // Markdown 标题 -> 深度（# 一级，## 二级…）。
  const heading = body.match(/^(#{1,6})\s+(.*)$/u)
  let headingDepth = 0
  if (heading) {
    headingDepth = heading[1].length - 1
    body = heading[2].trim()
  }
  // 去项目符号 / 编号前缀。
  body = body
    .replace(/^[-*•]\s+/u, '')
    .replace(/^\d+[.、)]\s*/u, '')
    .trim()
  if (!body) return null
  return { title: body.slice(0, 48), depth: Math.max(indentDepth, headingDepth) }
}

/**
 * 把带层级的行构造成稳定 id 树。第一行/深度 0 为主题，缩进为其子点。
 * 提供 anchorIds 时按顺序把节点 id 覆写为文稿片段 id，实现“点击回跳文稿”。
 */
export function buildOutlineTree(
  lines: readonly OutlineLine[],
): OutlineTreeNode[] {
  const nodes: OutlineTreeNode[] = []
  const seen = new Set<string>()
  // 每一层最近一次出现的节点 id，用于挂父级。
  const parentAtDepth: (string | null)[] = []
  let minDepth = Infinity
  for (const line of lines) minDepth = Math.min(minDepth, line.depth)
  if (!Number.isFinite(minDepth)) minDepth = 0

  for (const line of lines) {
    const depth = Math.max(0, line.depth - minDepth)
    const parentId = depth > 0 ? parentAtDepth[depth - 1] ?? null : null
    let id = stableOutlineId(parentId, line.title)
    // 极少数碰撞时追加序号，保证 id 唯一。
    let bump = 1
    while (seen.has(id)) {
      id = `${stableOutlineId(parentId, line.title)}-${bump}`
      bump += 1
    }
    seen.add(id)
    nodes.push({ id, title: line.title, parentId })
    parentAtDepth[depth] = id
    parentAtDepth.length = depth + 1
  }
  return nodes
}

/** 从原始文本行（模型输出）构造层级树。 */
export function outlineTreeFromLines(rawLines: readonly string[]): OutlineTreeNode[] {
  const parsed: OutlineLine[] = []
  for (const raw of rawLines) {
    const line = parseOutlineLine(raw)
    if (line) parsed.push(line)
  }
  return buildOutlineTree(parsed)
}
