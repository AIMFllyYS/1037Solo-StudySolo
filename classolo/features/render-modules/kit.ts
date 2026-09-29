import { resolveRenderView } from './dispatch'
import { listRenderTools } from './manifest'
import { renderModuleRegistry } from './registry'

const requiredCrpKeys = [
  'renderModuleRegistry',
  'resolveRenderView',
  'listRenderTools',
] as const

type RequiredCrpKey = (typeof requiredCrpKeys)[number]

export const crpHostKit = {
  renderModuleRegistry,
  resolveRenderView,
  listRenderTools,
} satisfies Record<RequiredCrpKey, unknown>

export type CrpHostKit = typeof crpHostKit
