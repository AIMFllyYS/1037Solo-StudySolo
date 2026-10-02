import type {RenderModuleManifest} from '../manifest'
import {VisualModule} from './Component'
import {visualPropsSchema,type VisualProps} from './schema'

export const visualModule={name:'visual',version:'1.0',toolName:'render_visual',description:'课堂固定示意图、函数图或分子结构',propsSchema:visualPropsSchema,Component:VisualModule} satisfies RenderModuleManifest<VisualProps>
