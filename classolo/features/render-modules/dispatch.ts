import type { RenderModuleRegistry } from './manifest'
import type { RenderMessage } from './types'

export type ResolvedRenderView =
  | {
      ok: true
      moduleName: string
      props: unknown
    }
  | {
      ok: false
      error: string
    }

export function resolveRenderView(
  message: RenderMessage,
  registry: RenderModuleRegistry,
): ResolvedRenderView {
  const mod = registry[message.module]
  if (!mod) {
    return { ok: false, error: `未知渲染模块：${message.module}` }
  }
  const parsed = mod.propsSchema.safeParse(message.props)
  if (!parsed.success) {
    return { ok: false, error: `非法 props：${parsed.error.message}` }
  }
  return { ok: true, moduleName: mod.name, props: parsed.data }
}
