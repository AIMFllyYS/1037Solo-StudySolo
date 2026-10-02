'use client'

import Image from 'next/image'
import { useState } from 'react'

import { getClassUserId,getLocalClassSnapshot } from '@/classolo/lib/db'
import { getTranscriptPublic } from '@/classolo/lib/session'
import { upsertRenderMessage } from '@/classolo/lib/session/writes/render'
import {classCourseProfileSchema,reviewSubjectForClass} from '@/classolo/lib/course/profile'

import type { RenderMessage } from '../types'
import { imagePropsSchema } from './schema'
import { searchClassroomImage } from './search'

export type ImageModuleProps = typeof imagePropsSchema._output

/** Render a frozen search result. Legacy cards require an explicit click before a billable lookup. */
export function ImageModule({ props, message }: { props: ImageModuleProps; message: RenderMessage<ImageModuleProps>; onAnchorClick?: (segmentId: string) => void }) {
  const [working, setWorking] = useState(false)
  const result = props.result

  async function lookup() {
    if (working) return
    const owner = getClassUserId(), sessionId = getTranscriptPublic().sessionId
    if (!owner || !sessionId) return
    setWorking(true)
    const profile=classCourseProfileSchema.safeParse(getLocalClassSnapshot(sessionId)?.session.profile)
    const next = await searchClassroomImage(props.query,profile.success?reviewSubjectForClass(profile.data):undefined)
    if (owner !== getClassUserId() || sessionId !== getTranscriptPublic().sessionId) return
    upsertRenderMessage({ ...message, props: { ...props, result: next } })
    setWorking(false)
  }

  if (!result) return <div data-slot="image-unresolved" className="text-sm"><p>资料图片尚未检索。检索可能产生费用。</p><button type="button" className="ss-tool mt-2" disabled={working} onClick={() => void lookup()}>{working ? '正在检索…' : '检索一次'}</button></div>
  if (result.status === 'empty') return <p data-slot="image-empty" className="text-sm text-muted-foreground">这次检索没有找到图片，可调整关键词后重新生成资料卡。</p>
  if (result.status === 'error') return <p data-slot="image-error" className="text-sm text-destructive">{result.message}。本次请求状态请在计费记录中核对，卡片不会自动重试。</p>
  return <figure data-slot="image-ready">
    <Image src={result.url} alt={props.alt || result.alt} width={640} height={320} unoptimized className="max-h-48 w-full rounded-md object-cover" />
    <figcaption className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-[color:var(--ink-faint)]">{result.provider==='course'?'教材笔记图片':'真实资料图片'} <a href={result.pageUrl} target="_blank" rel="noopener noreferrer" className="ss-source-link">{result.author}{result.provider==='unsplash'?' / Unsplash':''}</a>{result.licenseUrl&&<a href={result.licenseUrl} target="_blank" rel="noopener noreferrer" className="ss-source-link">查看许可</a>}</figcaption>
  </figure>
}
