import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
import { isClassHydrating,getClassUserId } from '@/classolo/lib/db'
import {createBoundedScheduler} from '@/classolo/lib/session/bounded-scheduler'
import { createModel, generateText } from '@/classolo/lib/ai'
import { getNotesPublic, getTranscriptPublic, getRenderMessages,subscribeTranscriptPublic } from '@/classolo/lib/session'
import { patchNotesPublic } from '@/classolo/lib/session/writes/notes'
import type { OutlineDigestNode } from '@/classolo/lib/session'

import {stableOutlineId} from './hierarchy'
import {getLocalClassSnapshot} from '@/classolo/lib/db'
import {classCourseProfileSchema,classSubjectLabel} from '@/classolo/lib/course/profile'
import {applyOutlinePatch,parseOutlineAnalysis,nextOutlineBatch,advanceOutlineProgress,outlinePrompt,sourceFingerprint,type OutlineEvidence} from './incremental'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import type {FormulaProps} from '@/classolo/features/formulas/schema'
import {transcriptFlusher} from '@/classolo/features/transcript/flush-runtime'

export const OUTLINE_DEBOUNCE_MS = 4000
export const OUTLINE_MAX_WAIT_MS = 10000

export interface OutlineGenerationContext {signal?:AbortSignal;evidence?:readonly OutlineEvidence[];previous?:readonly OutlineDigestNode[];onFallback?:()=>void;onFormulas?:(items:readonly FormulaProps[])=>void}
export type OutlineGenerator = (
  texts: string[],
  context?:OutlineGenerationContext,
) => Promise<readonly OutlineDigestNode[]>

export interface OutlineOrganizerOptions {
  generate?: OutlineGenerator
  debounceMs?: number
  maxWaitMs?:number
  subscribeCommitted?: (onCommitted: () => void) => () => void
  readTexts?: () => string[]
}

let generateCalls = 0
let runId = 0
let stopCurrent: (() => void) | null = null
let refreshCurrent:((rebuild:boolean,immediate?:boolean)=>Promise<void>|void)|null=null
export function requestOutlineRefresh(rebuild=false){refreshCurrent?.(rebuild)}
export async function runOutlineRefreshNow(rebuild=false):Promise<void>{
  if(!refreshCurrent)throw new Error('课堂导图整理器尚未就绪')
  await refreshCurrent(rebuild,true)
}

function defaultReadTexts(): string[] {
  return getTranscriptPublic().committed.map((segment) => segment.text)
}

async function outlineFromTranscript(
  texts: string[],
  context?:OutlineGenerationContext,
): Promise<readonly OutlineDigestNode[]> {
  return modelOutline(texts,context)
}

function defaultSubscribeCommitted(onCommitted: () => void): () => void {
  return subscribeTranscriptPublic(
    (state) => `${state.sessionId}:${state.committedVersion}`,
    onCommitted,
  )
}

export async function heuristicOutline(
  texts: string[],
  context?:OutlineGenerationContext,
): Promise<readonly OutlineDigestNode[]> {
  const committed=getTranscriptPublic().committed
  const evidence=context?.evidence??nextOutlineBatch(committed.filter(segment=>texts.includes(segment.text)))
  const nodes=new Map<string,{id:string;title:string;parentId:null;sourceSegmentIds:string[]}>()
  for(const row of evidence){
    const source=committed.find(segment=>segment.id===row.id),title=(source?.text??row.text).trim().split(/[。！？.!?\n]/u)[0].slice(0,32)
    if(title)nodes.set(row.id,{id:stableOutlineId(null,`source:${row.id}`),title,parentId:null,sourceSegmentIds:[row.id]})
  }
  return applyOutlinePatch(context?.previous??getNotesPublic().outlineDigest,[...nodes.values()],new Set(committed.map(segment=>segment.id)))
}

export async function modelOutline(
  texts: string[],
  context?:OutlineGenerationContext,
): Promise<readonly OutlineDigestNode[]> {
  if (texts.every((text) => text.trim().length === 0)) {
    return []
  }
  const committed=getTranscriptPublic().committed,previous=context?.previous??getNotesPublic().outlineDigest
  const evidence=context?.evidence??nextOutlineBatch(committed.filter(segment=>texts.includes(segment.text)))
  if(!evidence.length)return previous
  const storedProfile=getTranscriptPublic().sessionId?getLocalClassSnapshot(getTranscriptPublic().sessionId!)?.session.profile:undefined
  const course=classCourseProfileSchema.safeParse(storedProfile)
  try {
    const model = createModel({baseUrl:'',model:'classroom'})
    const result = await generateText({
      abortSignal:context?.signal,
      model,
      maxOutputTokens: CLASS_OUTPUT_TOKENS,
      maxRetries: 0,
      prompt:outlinePrompt(previous,evidence,course.success?classSubjectLabel(course.data):undefined),
    })
    const analysis=parseOutlineAnalysis(result.text)
    const digest=applyOutlinePatch(previous,analysis.nodes,new Set(committed.map(segment=>segment.id)))
    if(analysis.formulas?.length){
      const {validateFormulaProposal}=await import('@/classolo/features/formulas/validate')
      const byId=new Map(committed.map(segment=>[segment.id,segment]))
      const formulas=analysis.formulas.map(proposal=>{
        const source=byId.get(proposal.sourceSegmentId)
        if(!source)throw new Error('公式引用了不属于当前课堂的文稿')
        return validateFormulaProposal(proposal,source.text,source.correctionRevision??0)
      })
      context?.onFormulas?.(formulas)
    }
    return digest
  } catch (error) {
    if(context?.signal?.aborted)throw error
    // 模型瞬时失败（429 / 断连）时不要用启发式结果覆盖已有的 AI 层级大纲；
    // 交给调度器稍后重试。没有已有大纲时才回落启发式，保证面板不空。
    if (previous.length > 0) throw new OutlineModelUnavailable(error)
    context?.onFallback?.()
    return heuristicOutline(texts,{...context,evidence,previous})
  }
}

export class OutlineModelUnavailable extends Error {
  readonly retrySafe:boolean
  constructor(cause: unknown) {
    super('outline model unavailable', { cause })
    const error=cause as {statusCode?:number;responseHeaders?:Record<string,string>}|null
    this.retrySafe=error?.statusCode===429||(error?.statusCode===503&&!!error.responseHeaders?.['retry-after'])
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

  let retryTimer:ReturnType<typeof setTimeout>|null=null,retried=false
  let force=false
  const synthetic=!!options.generate||!!options.readTexts
  let scope=`${getClassUserId()}:${getTranscriptPublic().sessionId}`
  const scheduler=createBoundedScheduler({delayMs:debounceMs,maxWaitMs:options.maxWaitMs??OUTLINE_MAX_WAIT_MS,run:async signal=>{
    if(isClassHydrating()||(!synthetic&&!force&&!getTranscriptPublic().autoOrganize))return
    const notes=getNotesPublic(),batch=synthetic?undefined:nextOutlineBatch(getTranscriptPublic().committed,notes.processedSegments)
    const texts=batch?batch.map(row=>row.text):readTexts()
    if(texts.every(text=>!text.trim())){force=false;patchNotesPublic({organizerStatus:'idle'});return}
    const sessionId=getTranscriptPublic().sessionId,owner=getClassUserId(),baseVersion=getNotesPublic().outlineVersion,currentRun=++runId
    generateCalls++
    patchNotesPublic({organizerStatus:'thinking',organizerError:''})
    let fallback=false,formulas:readonly FormulaProps[]=[]
    const digest=await generate(texts,{signal,evidence:batch,previous:notes.outlineDigest,onFallback:()=>{fallback=true},onFormulas:items=>{formulas=items}})
    if(signal.aborted||owner!==getClassUserId()||getTranscriptPublic().sessionId!==sessionId||currentRun!==runId)return
    if(batch){
      const current=new Map(getTranscriptPublic().committed.map(segment=>[segment.id,segment]))
      if(batch.some(row=>{const segment=current.get(row.id);return !segment||sourceFingerprint(segment)!==row.fingerprint})){scheduler.schedule();return}
      await transcriptFlusher.flush(true)
      if(transcriptFlusher.pendingCount())throw new Error('课堂原文尚未保存，暂缓关联导图与公式')
      if(signal.aborted||owner!==getClassUserId()||getTranscriptPublic().sessionId!==sessionId||currentRun!==runId)return
    }
    if(baseVersion!==getNotesPublic().outlineVersion){scheduler.schedule();return}
    const progress=batch?advanceOutlineProgress(notes.processedSegments??{},batch):notes.processedSegments
    const unfinished=!!batch&&nextOutlineBatch(getTranscriptPublic().committed,progress).length>0
    retried=false;patchNotesPublic({outlineDigest:digest,processedSegments:progress,organizerStatus:unfinished?'queued':fallback?'fallback':'idle',organizedAt:Date.now()})
    const rendered=[...getRenderMessages('transcript'),...getRenderMessages('notes')]
    for(const formula of formulas){
      if(rendered.some(message=>message.module==='formula'&&typeof message.props==='object'&&message.props!==null&&((message.props as FormulaProps).locked||(message.props as FormulaProps).studentConfirmed)&&(message.props as FormulaProps).sourceSegmentId===formula.sourceSegmentId&&(message.props as FormulaProps).spokenText===formula.spokenText))continue
      upsertRenderMessage({id:formula.id,module:'formula',version:'1.0',target:'transcript',props:formula,meta:{source:'silent-agent',createdAt:Date.now(),transcriptAnchor:formula.sourceSegmentId}})
    }
    if(unfinished)scheduler.schedule();else force=false
  },onError:error=>{
    patchNotesPublic({organizerStatus:'error',organizerError:error instanceof Error&&error.cause instanceof Error?error.cause.message:'导图整理暂未完成；先前内容仍保留，可重试'})
    if(error instanceof OutlineModelUnavailable&&error.retrySafe&&!retried){retried=true;retryTimer=setTimeout(()=>{retryTimer=null;scheduler.schedule()},OUTLINE_RETRY_MS)}
  }})
  const schedule=()=>{
    const next=`${getClassUserId()}:${getTranscriptPublic().sessionId}`
    if(next!==scope){scope=next;runId++;scheduler.reset();retried=false;if(retryTimer)clearTimeout(retryTimer);retryTimer=null}
    if(isClassHydrating())return
    if(!synthetic&&!force&&!getTranscriptPublic().autoOrganize)return
    patchNotesPublic({organizerStatus:'queued'})
    scheduler.schedule()
  }
  const refresh=(rebuild:boolean,immediate=false)=>{
    force=true;runId++;scheduler.reset();retried=false
    if(rebuild)patchNotesPublic({processedSegments:{}})
    schedule()
    if(immediate)return scheduler.flushNow()
  }
  refreshCurrent=refresh

  const unsubscribe = subscribeCommitted(schedule)

  const stop = () => {
    unsubscribe()
    scheduler.stop();if(retryTimer)clearTimeout(retryTimer)
    runId += 1
    if (stopCurrent === stop) {
      stopCurrent = null
    }
    if(refreshCurrent===refresh)refreshCurrent=null
  }
  stopCurrent = stop
  return stop
}
