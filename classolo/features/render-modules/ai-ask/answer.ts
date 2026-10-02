import { createModel, streamText } from '@/classolo/lib/ai'
import type { TranscriptCommittedSegment } from '@/classolo/lib/session/types'

/** Keep source IDs in the model context and accept citations only for supplied segments. */
export function questionEvidence(segments: readonly TranscriptCommittedSegment[], anchor?: string) {
  const index = anchor ? segments.findIndex(row => row.id === anchor) : -1
  const window = index >= 0 ? segments.slice(Math.max(0, index - 5), index + 6) : segments.slice(-12)
  const selected: TranscriptCommittedSegment[] = []
  let remaining = 12000
  for (const row of window) {
    if (remaining <= 0) break
    const text = row.text.slice(0, Math.min(2000, remaining))
    selected.push({...row, text})
    remaining -= text.length
  }
  return selected
}

export function citedEvidenceIds(answer: string, sources: readonly TranscriptCommittedSegment[]): string[] {
  return sources.filter(row => answer.includes(`[${row.id}]`)).map(row => row.id)
}

export async function answerClassQuestion(input: {
  question: string
  choices: readonly string[]
  response: string
  sources: readonly TranscriptCommittedSegment[]
  onChunk: (answer: string) => void
}): Promise<string> {
  const sourceText = input.sources.map(row => `[${row.id}] ${row.text}`).join('\n')
  const result = streamText({
    model: createModel({baseUrl:'',model:'classroom'}),
    maxOutputTokens: 1400,
    maxRetries: 0,
    system: '你是课堂助教。给出题目答案、学生作答的分析和简短解释。只把给定文稿当作课堂证据；引用原文时使用准确的 [片段id]。无法从文稿判断时明确说明，区分推论与文稿事实。不要伪造来源。',
    prompt: `问题：${input.question}\n选项：${input.choices.map((choice,index)=>`${String.fromCharCode(65+index)}. ${choice}`).join('\n')||'开放题'}\n学生作答：${input.response}\n本节课相关文稿：\n${sourceText||'（没有可用文稿）'}`,
  })
  let answer = ''
  for await (const chunk of result.textStream) {
    answer = (answer + chunk).slice(0,12000)
    input.onChunk(answer)
  }
  if (!answer.trim()) throw new Error('助教没有返回答案，请稍后重试')
  return answer
}
