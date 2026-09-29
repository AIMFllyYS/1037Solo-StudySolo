'use client'

import { Button } from './button'
import { Card } from './card'
import { Dialog } from './dialog'
import { Input } from './input'
import { Select } from './select'
import { toast, Toaster } from './sonner'
import { Switch } from './switch'
import { Tabs } from './tabs'

const requiredKitKeys = [
  'Button',
  'Input',
  'Select',
  'Switch',
  'Tabs',
  'Card',
  'Dialog',
  'toast',
  'Toaster',
] as const

type RequiredKitKey = (typeof requiredKitKeys)[number]

/**
 * P0-INF-01 classroom kit. Missing a member fails `pnpm tsc --noEmit`
 * because Playbook `/playbook/ui/` imports this object.
 */
export const classroomUiKit = {
  Button,
  Input,
  Select,
  Switch,
  Tabs,
  Card,
  Dialog,
  toast,
  Toaster,
} satisfies Record<RequiredKitKey, unknown>

export type ClassroomUiKit = typeof classroomUiKit
