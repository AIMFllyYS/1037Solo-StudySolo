import type {RenderModuleManifest} from '../manifest'
import {formulaPropsSchema,type FormulaProps} from '@/classolo/features/formulas/schema'
import {FormulaModule} from './Component'
export const formulaModule={name:'formula',version:'1.0',toolName:'render_formula',description:'展示可追溯的课堂公式与分层验证结果',propsSchema:formulaPropsSchema,Component:FormulaModule} satisfies RenderModuleManifest<FormulaProps>
