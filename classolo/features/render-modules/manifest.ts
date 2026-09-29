import type { ComponentType } from 'react'
import type { z } from 'zod'

import type { RenderMessage } from './types'

export interface RenderModuleManifest<P = unknown> {
  name: string
  version: string
  toolName: string
  description: string
  propsSchema: z.ZodType<P>
  Component: ComponentType<{
    props: P
    message: RenderMessage<P>
    onAnchorClick?: (segmentId: string) => void
  }>
}

export type RenderModuleRegistry = Readonly<
  Record<string, RenderModuleManifest<unknown>>
>

export interface RenderToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType<unknown>
}

export function listRenderTools(
  registry: RenderModuleRegistry,
): readonly RenderToolDefinition[] {
  return Object.values(registry).map((mod) => ({
    name: mod.toolName,
    description: mod.description,
    inputSchema: mod.propsSchema,
  }))
}
