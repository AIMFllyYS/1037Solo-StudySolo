import { z } from 'zod'

import type { RenderModuleManifest } from '../manifest'

import { ImageModule } from './Component'
import { imagePropsSchema } from './schema'

export { imagePropsSchema } from './schema'

export const imageModule = {
  name: 'image',
  version: '1.0',
  toolName: 'render_image',
  description:
    '当课堂需要真实图片（解剖图、示意图、实物照片）时检索并渲染到渲染区',
  propsSchema: imagePropsSchema,
  Component: ImageModule,
} satisfies RenderModuleManifest<z.infer<typeof imagePropsSchema>>
