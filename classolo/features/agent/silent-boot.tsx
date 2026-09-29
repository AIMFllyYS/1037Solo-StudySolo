'use client'

import { useEffect } from 'react'

import { startSilentAgent } from './silent-machine'

export function SilentAgentBoot() {
  useEffect(() => startSilentAgent(), [])
  return null
}
