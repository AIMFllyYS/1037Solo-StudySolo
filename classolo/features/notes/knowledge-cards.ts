import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
/**
 * 生成知识卡片（issue #65）：让课堂 AI 从文稿/大纲抽取闪卡，
 * 复用 StudySolo 复习卡片仓库（useReviewCards）落库。
 */
import { useReviewCards } from '@/lib/stores/reviewCards'
import type { RecordCardAI } from '@/lib/review/types'
import { createModel, generateText } from '@/classolo/lib/ai'
import { getNotesPublic, getTranscriptPublic } from '@/classolo/lib/session'
import {getClassUserId} from '@/classolo/lib/db'

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
  sourceLabel?:string
  sessionId?:string
}): Promise<GenerateFlashcardsResult> {
  const transcript = getTranscriptPublic()
  const owner=getClassUserId(),sessionId=input.sessionId??transcript.sessionId
  if(!owner||!sessionId||transcript.sessionId!==sessionId)return {saved:0,error:'课堂或账号已切换'}
  const rows=transcript.committed
  if(transcript.recordingStatus==='recording'||transcript.recordingStatus==='paused')return {saved:0,error:'请先结束录音，待文稿保存后再生成全课卡片'}
  if (rows.length === 0) return { saved: 0, error: '暂无课堂文稿，无法生成卡片' }
  const outline = getNotesPublic().outlineDigest
  const batches:{id:string;text:string}[][]=[]
  let batch:{id:string;text:string}[]=[],length=0
  for(const row of rows)for(let start=0;start<row.text.length;start+=4000){const text=row.text.slice(start,start+4000);if(batch.length&&(batch.length>=10||length+text.length>8000)){batches.push(batch);batch=[];length=0}batch.push({id:row.id,text});length+=text.length}
  if(batch.length)batches.push(batch)
  const drafts: FlashcardDraft[] = []
  try {
    for(const group of batches){
      if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return {saved:0,error:'课堂或账号已切换，未保存卡片'}
      const groupIds=new Set(group.map(row=>row.id))
      const relevantOutline=outline.filter(node=>node.sourceSegmentIds?.some(id=>groupIds.has(id))).map(node=>node.title).slice(0,50).join('、')
      const result = await generateText({
      model: createModel({ baseUrl: '', model: 'classroom' }),
      maxOutputTokens: CLASS_OUTPUT_TOKENS,
      maxRetries: 0,
      prompt:
        '根据以下课堂文稿与大纲，抽取 1-8 张问答式知识卡片，覆盖关键概念与易错点。每张卡片要引用本批真实片段id。' +
        '只输出 JSON，形如 {"cards":[{"front":"问题","back":"答案","sourceSegmentIds":["片段id"]}]}。\n' +
        `课堂学科：${input.sourceLabel||'未分类'}。以文稿为依据，不添加未经讲授的事实。\n相关大纲：${relevantOutline || '（无）'}\n本批文稿：\n${group.map(row=>`[${row.id}] ${row.text}`).join('\n')}`,
    })
      const allowed=new Set(group.map(row=>row.id))
      const valid=parseFlashcards(result.text).filter(card=>card.sourceSegmentIds?.length&&card.sourceSegmentIds.every(id=>allowed.has(id)))
      if(!valid.length)return {saved:0,error:'有一批文稿未能生成带来源的卡片，请重试'}
      drafts.push(...valid)
    }
  } catch {
    return { saved: 0, error: '生成失败，请稍后重试' }
  }
  if (drafts.length === 0) return { saved: 0, error: '未能从文稿中提取卡片' }
  if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return {saved:0,error:'课堂或账号已切换，未保存卡片'}
  const current=getTranscriptPublic().committed
  if(current.length!==rows.length||rows.some((row,index)=>current[index]?.id!==row.id||current[index]?.text!==row.text||current[index]?.correctionRevision!==row.correctionRevision))return {saved:0,error:'生成期间文稿发生变化，请重新出卡'}

  const store = useReviewCards.getState()
  const subjectId = input.subjectId || 'classroom'
  const sourceLabel = `课堂 · ${input.sourceLabel?`${input.sourceLabel} · `:''}${input.title || '课堂笔记'}`
  let saved = 0
  const existing=new Set(Object.values(store.byId).filter(card=>card.classSessionId===sessionId).map(card=>`${card.front.trim()}\0${(card.sourceSegmentIds??[]).join(',')}`))
  for (const draft of drafts) {
    const dedupe=`${draft.front.trim()}\0${(draft.sourceSegmentIds??[]).join(',')}`
    if(existing.has(dedupe))continue
    existing.add(dedupe)
    const id = store.addSaved(draft.front, { subjectId, sourceLabel,classSessionId:sessionId,sourceSegmentIds:draft.sourceSegmentIds })
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
