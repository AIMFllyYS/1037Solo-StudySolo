import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
import { isClassHydrating } from '@/classolo/lib/db'
import { createModel, generateText } from '@/classolo/lib/ai'
import { resolveSecret } from '@/classolo/lib/providers/secrets'
import { getNotesPublic, getTranscriptPublic, subscribeTranscriptPublic } from '@/classolo/lib/session'
import { patchNotesPublic } from '@/classolo/lib/session/writes/notes'
import type { OutlineDigestNode } from '@/classolo/lib/session'

import { outlineTreeFromLines, stableOutlineId } from './hierarchy'

export const OUTLINE_DEBOUNCE_MS = 4000

export type OutlineGenerator = (
  texts: string[],
) => Promise<readonly OutlineDigestNode[]>

export interface OutlineOrganizerOptions {
  generate?: OutlineGenerator
  debounceMs?: number
  subscribeCommitted?: (onCommitted: () => void) => () => void
  readTexts?: () => string[]
}

let timer: ReturnType<typeof setTimeout> | null = null
let generateCalls = 0
let runId = 0
let stopCurrent: (() => void) | null = null

function defaultReadTexts(): string[] {
  return getTranscriptPublic().committed.map((segment) => segment.text)
}

/**
 * 把层级树的顶层节点尽量锚定到文稿片段 id（点击回跳）。
 * 顶层节点按顺序对应最近的文稿片段；子节点保留派生 id。
 */
async function outlineFromTranscript(
  texts: string[],
): Promise<readonly OutlineDigestNode[]> {
  return modelOutline(texts)
}

function defaultSubscribeCommitted(onCommitted: () => void): () => void {
  return subscribeTranscriptPublic(
    (state) => state.committedVersion,
    () => {
      if(!isClassHydrating())onCommitted()
    },
  )
}

function readAiRuntime(): { baseUrl: string; model: string } {
  const env =
    typeof process === 'undefined' || !process.env ? undefined : process.env
  const baseUrl =
    env?.NEXT_PUBLIC_AI_BASE_URL?.trim() ||
    env?.AI_BASE_URL?.trim() ||
    'https://api.openai.com/v1'
  const model =
    env?.NEXT_PUBLIC_AI_MODEL?.trim() ||
    env?.AI_MODEL?.trim() ||
    'z-ai/glm-5.3-flash'
  return { baseUrl, model }
}

export async function heuristicOutline(
  texts: string[],
): Promise<readonly OutlineDigestNode[]> {
  // 无模型时：每段落取首句为主题（顶层），锚定到该文稿片段。
  const committed = getTranscriptPublic().committed
  const nodes: OutlineDigestNode[] = []
  const seen = new Set<string>()
  texts.forEach((text, index) => {
    const title = text.trim().split(/[。！？.!?\n]/u)[0]?.trim().slice(0, 32)
    if (!title) return
    const anchor = committed[index]?.id
    const id = anchor ?? stableOutlineId(null, title)
    if (seen.has(id)) return
    seen.add(id)
    nodes.push({ id, title, parentId: null })
  })
  return nodes
}

export async function modelOutline(
  texts: string[],
): Promise<readonly OutlineDigestNode[]> {
  if (texts.every((text) => text.trim().length === 0)) {
    return []
  }
  const secret = resolveSecret('ai')
  if (secret.value === null) {
    return heuristicOutline(texts)
  }
  try {
    const runtime = readAiRuntime()
    const model = createModel({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
    })
    const result = await generateText({
      model,
      maxOutputTokens: CLASS_OUTPUT_TOKENS,
      maxRetries: 0,
      prompt:
        '把本节课整理成层级大纲。用缩进（每层 2 个空格）表达主题与子要点，' +
        '每行一个要点，不要编号、不要解释。\n' +
        texts.slice(-16).join('\n'),
    })
    const lines = result.text.split('\n')
    const tree = outlineTreeFromLines(lines)
    if (tree.length === 0) return heuristicOutline(texts)
    return tree.map((node) => ({
      id: node.id,
      title: node.title,
      parentId: node.parentId ?? null,
    }))
  } catch (error) {
    // 模型瞬时失败（429 / 断连）时不要用启发式结果覆盖已有的 AI 层级大纲；
    // 交给调度器稍后重试。没有已有大纲时才回落启发式，保证面板不空。
    if (getNotesPublic().outlineDigest.length > 0) throw new OutlineModelUnavailable(error)
    return heuristicOutline(texts)
  }
}

export class OutlineModelUnavailable extends Error {
  constructor(cause: unknown) {
    super('outline model unavailable', { cause })
  }
}

/** 失败后重试的延迟；导出便于测试。 */
export const OUTLINE_RETRY_MS = 15000

export function getOutlineGenerateCalls(): number {
  return generateCalls
}

export function startOutlineOrganizer(
  options: OutlineOrganizerOptions = {},
): () => void {
  stopCurrent?.()

  const generate = options.generate ?? outlineFromTranscript
  const debounceMs = options.debounceMs ?? OUTLINE_DEBOUNCE_MS
  const readTexts = options.readTexts ?? defaultReadTexts
  const subscribeCommitted =
    options.subscribeCommitted ?? defaultSubscribeCommitted

  let retried = false
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const currentRun = runId + 1
      runId = currentRun
      generateCalls += 1
      void (async () => {
        const texts = readTexts()
        if (texts.every((text) => text.trim().length === 0)) {
          return
        }
        const sessionId=getTranscriptPublic().sessionId
        let digest: readonly OutlineDigestNode[]
        try {
          digest = await generate(texts)
        } catch (error) {
          if (!(error instanceof OutlineModelUnavailable) || retried) return
          retried = true
          if (currentRun === runId) timer = setTimeout(() => { timer = null; schedule() }, OUTLINE_RETRY_MS)
          return
        }
        retried = false
        if (getTranscriptPublic().sessionId!==sessionId || currentRun !== runId) return
        patchNotesPublic({ outlineDigest: digest })
      })()
    }, debounceMs)
  }

  const unsubscribe = subscribeCommitted(schedule)

  const stop = () => {
    unsubscribe()
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    runId += 1
    if (stopCurrent === stop) {
      stopCurrent = null
    }
  }
  stopCurrent = stop
  return stop
}
