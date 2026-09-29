import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  filterSessions,
  sessionStatusLabel,
} from '../features/session-library/filter.ts'
import type { ClassSession } from '../lib/db/index.ts'

function session(over: Partial<ClassSession>): ClassSession {
  return {
    id: over.id ?? crypto.randomUUID(),
    userId: 'u',
    title: over.title ?? '课堂',
    status: over.status ?? 'ended',
    startedAt: over.startedAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    asrSnapshot: {
      family: 'text-import',
      dialect: 'text',
      model: 'none',
      baseUrl: '',
      sampleRate: 16000,
    },
    archived: over.archived,
  }
}

test('filterSessions hides archived by default', () => {
  const rows = [
    session({ title: 'A', archived: true }),
    session({ title: 'B' }),
  ]
  const out = filterSessions(rows)
  assert.deepEqual(
    out.map((s) => s.title),
    ['B'],
  )
})

test('filterSessions includeArchived shows all', () => {
  const rows = [
    session({ title: 'A', archived: true }),
    session({ title: 'B' }),
  ]
  const out = filterSessions(rows, { includeArchived: true })
  assert.equal(out.length, 2)
})

test('filterSessions matches title case-insensitively', () => {
  const rows = [session({ title: '导数与极限' }), session({ title: '牛顿定律' })]
  const out = filterSessions(rows, { query: '导数' })
  assert.deepEqual(
    out.map((s) => s.title),
    ['导数与极限'],
  )
})

test('filterSessions sorts by updatedAt descending', () => {
  const rows = [
    session({ title: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
    session({ title: 'new', updatedAt: '2026-02-01T00:00:00.000Z' }),
  ]
  const out = filterSessions(rows)
  assert.deepEqual(
    out.map((s) => s.title),
    ['new', 'old'],
  )
})

test('sessionStatusLabel maps known states to Chinese', () => {
  assert.equal(sessionStatusLabel('recording'), '录音中')
  assert.equal(sessionStatusLabel('ended'), '已结束')
  assert.equal(sessionStatusLabel('paused'), '已暂停')
  assert.equal(sessionStatusLabel('weird'), '草稿')
})
