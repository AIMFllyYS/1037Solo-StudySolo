'use client'

import { Streamdown, defaultRehypePlugins, defaultRemarkPlugins } from 'streamdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/contrib/mhchem'

import { cn } from '@/classolo/lib/utils'

/**
 * 课堂模型大量输出 `$…$` / `$$…$$` 公式。Streamdown 2 把数学拆成可选插件，
 * 默认不渲染——课堂解析卡片因此露出原始 LaTeX。这里在保留 Streamdown 默认
 * 插件（GFM / harden 等安全链）的前提下追加 remark-math + rehype-katex，
 * KaTeX 样式由 app/layout.tsx 全局引入。
 */
const REMARK = [...Object.values(defaultRemarkPlugins), remarkMath]
const REHYPE = [...Object.values(defaultRehypePlugins), rehypeKatex]

export function MarkdownStream({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  return (
    <div className={cn('max-w-none text-sm text-foreground', className)}>
      <Streamdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{markdown}</Streamdown>
    </div>
  )
}
