import type { RenderModuleManifest } from '../manifest'

import { RichTextModule } from './Component'
import { richTextPropsSchema } from './schema'

export const richTextModule = {
  name: 'rich-text',
  version: '1.0',
  toolName: 'render_rich_text',
  description: '当老师讲解不清时，用流式 Markdown 补充讲解到渲染区',
  propsSchema: richTextPropsSchema,
  Component: RichTextModule,
} satisfies RenderModuleManifest<{ markdown: string }>
