'use client'

import { MarkdownStream } from './stream'

const requiredMarkdownKeys = ['MarkdownStream'] as const
type RequiredMarkdownKey = (typeof requiredMarkdownKeys)[number]

export const classroomMarkdownKit = {
  MarkdownStream,
} satisfies Record<RequiredMarkdownKey, unknown>

export type ClassroomMarkdownKit = typeof classroomMarkdownKit
