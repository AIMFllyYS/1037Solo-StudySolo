'use client'

import { ClassroomMindmap } from './canvas'
import { ClassroomOutlineNode } from './classroom-outline-node'
import { diffOutlineLayout, layoutOutlineTree } from './layout'

const requiredMindmapKeys = [
  'ClassroomMindmap',
  'ClassroomOutlineNode',
  'diffOutlineLayout',
  'layoutOutlineTree',
] as const

type RequiredMindmapKey = (typeof requiredMindmapKeys)[number]

/**
 * P0-N-02 mindmap kit. Missing a member fails `pnpm tsc --noEmit`
 * because Playbook `/playbook/ui/` imports this object.
 */
export const classroomMindmapKit = {
  ClassroomMindmap,
  ClassroomOutlineNode,
  diffOutlineLayout,
  layoutOutlineTree,
} satisfies Record<RequiredMindmapKey, unknown>

export type ClassroomMindmapKit = typeof classroomMindmapKit
