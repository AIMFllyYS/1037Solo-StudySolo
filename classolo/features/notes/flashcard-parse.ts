import { z } from 'zod'

export interface FlashcardDraft {
  front: string
  back: string
}

const cardSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
      }),
    )
    .max(20),
})

/** 从模型输出的 JSON 里稳健解析卡片；失败返回空数组。 */
export function parseFlashcards(text: string): FlashcardDraft[] {
  const trimmed = text.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return []
  try {
    const parsed = cardSchema.safeParse(
      JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)),
    )
    if (!parsed.success) return []
    return parsed.data.cards.map((c) => ({ front: c.front, back: c.back }))
  } catch {
    return []
  }
}
