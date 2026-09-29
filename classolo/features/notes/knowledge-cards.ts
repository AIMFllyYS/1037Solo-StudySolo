import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
/**
 * 生成知识卡片（issue #65）：让课堂 AI 从文稿/大纲抽取闪卡，
 * 复用 StudySolo 复习卡片仓库（useReviewCards）落库。
 */
import { useReviewCards } from '@/lib/stores/reviewCards'
import type { RecordCardAI } from '@/lib/review/types'
import { createModel, generateText } from '@/classolo/lib/ai'
import { getNotesPublic, getTranscriptPublic } from '@/classolo/lib/session'

import { parseFlashcards, type FlashcardDraft } from './flashcard-parse'

export type { FlashcardDraft } from './flashcard-parse'
export { parseFlashcards } from './flashcard-parse'

export interface GenerateFlashcardsResult {
  saved: number
  error?: string
}

/**
 * 生成并保存知识卡片。subjectId/sourceLabel 用于出处溯源。
 * 返回落库数量；模型不可用或无内容时返回 error。
 */
export async function generateClassroomFlashcards(input: {
  subjectId?: string
  title?: string
}): Promise<GenerateFlashcardsResult> {
  const transcript = getTranscriptPublic()
  const texts = transcript.committed.map((s) => s.text)
  if (texts.length === 0) return { saved: 0, error: '暂无课堂文稿，无法生成卡片' }
  const outline = getNotesPublic()
    .outlineDigest.map((n) => n.title)
    .join('、')
  let drafts: FlashcardDraft[] = []
  try {
    const result = await generateText({
      model: createModel({ baseUrl: '', model: 'classroom' }),
      maxOutputTokens: CLASS_OUTPUT_TOKENS,
      maxRetries: 0,
      prompt:
        '根据以下课堂文稿与大纲，抽取 3-8 张问答式知识卡片，覆盖关键概念与易错点。' +
        '只输出 JSON，形如 {"cards":[{"front":"问题","back":"答案"}]}。\n' +
        `大纲：${outline || '（无）'}\n文稿：\n${texts.slice(-20).join('\n')}`,
    })
    drafts = parseFlashcards(result.text)
  } catch {
    return { saved: 0, error: '生成失败，请稍后重试' }
  }
  if (drafts.length === 0) return { saved: 0, error: '未能从文稿中提取卡片' }

  const store = useReviewCards.getState()
  const subjectId = input.subjectId || 'classroom'
  const sourceLabel = `课堂 · ${input.title || '课堂笔记'}`
  let saved = 0
  for (const draft of drafts) {
    const id = store.addSaved(draft.front, { subjectId, sourceLabel })
    const ai: RecordCardAI = {
      mode: 'quiz',
      cardType: 'quiz',
      front: draft.front,
      back: draft.back,
    }
    store.finalize(id, ai, 'classroom')
    saved += 1
  }
  return { saved }
}
