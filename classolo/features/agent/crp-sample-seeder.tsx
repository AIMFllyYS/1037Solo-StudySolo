'use client'

import { useEffect } from 'react'

import {
  resetRenderProjection,
  upsertRenderMessage,
} from '@/classolo/lib/session/writes/render'

const now = () => Date.now()

export const PLAYBOOK_SAMPLE_MESSAGES = [
  {
    id: 'sample-rich-text',
    module: 'rich-text',
    version: '1.0',
    target: 'notes' as const,
    props: { markdown: '## 课堂补充\n这是一条样例富文本。' },
    meta: { createdAt: 0, source: 'system' as const },
  },
  {
    id: 'sample-ai-ask',
    module: 'ai-ask',
    version: '1.0',
    target: 'notes' as const,
    props: { question: '牛顿第一定律的内容是什么？' },
    meta: { createdAt: 0, source: 'system' as const },
  },
  {
    id: 'sample-agent-status',
    module: 'agent-status',
    version: '1.0',
    target: 'notes' as const,
    props: { status: 'thinking', detail: '样例思考态' },
    meta: { createdAt: 0, source: 'system' as const },
  },
  {
    id: 'sample-gen-ui',
    module: 'gen-ui',
    version: '1.0',
    target: 'notes' as const,
    props: { dsl: { type: 'text', text: '受控 DSL 样例' } },
    meta: { createdAt: 0, source: 'system' as const },
  },
  {
    id: 'sample-image',
    module: 'image',
    version: '1.0',
    target: 'transcript' as const,
    props: { query: 'newton cradle', alt: '样例检索' },
    meta: { createdAt: 0, source: 'system' as const },
  },
  {
    id: 'sample-invalid',
    module: 'rich-text',
    version: '1.0',
    target: 'transcript' as const,
    props: { nope: true },
    meta: { createdAt: 0, source: 'system' as const },
  },
]

export function CrpSampleSeeder() {
  useEffect(() => {
    const createdAt = now()
    for (const message of PLAYBOOK_SAMPLE_MESSAGES) {
      upsertRenderMessage({
        ...message,
        meta: { ...message.meta, createdAt },
      })
    }
    return () => {
      resetRenderProjection()
    }
  }, [])
  return null
}
