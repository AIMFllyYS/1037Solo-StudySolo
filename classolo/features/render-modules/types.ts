/**
 * Classolo Render Protocol（CRP）协议类型（ADR-0010）。
 * 渲染模块之间禁止横向 import——模块只允许依赖本文件、src/lib、src/components/ui。
 * 完整协议设计见 docs/designs/render-module-protocol.md。
 * transcriptAnchor 点击回调由 Host 注入，不进协议 schema。
 */

export interface RenderMessage<P = unknown> {
  /** 消息唯一 ID（可用于更新/撤回已渲染块） */
  id: string
  /** 模块名：'image' | 'rich-text' | 'ai-ask' | 'gen-ui' | 'agent-status' */
  module: string
  /** 模块协议版本，如 '1.0'（禁止对已发布 schema 做破坏性修改） */
  version: string
  /** 投递目标：文稿区下方 / 笔记区下方 */
  target: 'transcript' | 'notes'
  /** 模块自定义 props，必须过 manifest 的 zod schema 校验，失败渲染兜底错误卡片 */
  props: P
  meta: {
    createdAt: number
    source: 'silent-agent' | 'chat-agent' | 'system'
    /** 关联的文稿片段 ID（点击回跳） */
    transcriptAnchor?: string
  }
}
