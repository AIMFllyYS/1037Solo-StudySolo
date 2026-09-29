import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildOutlineTree,
  outlineTreeFromLines,
  parseOutlineLine,
  stableOutlineId,
} from '../features/notes/hierarchy.ts'
import {
  SILENT_TOOL_TO_MODULE,
  extractModuleProps,
  silentToolToRender,
} from '../features/agent/silent-tools.ts'
import { collectToolCalls } from '../features/agent/silent-deliver.ts'
import { parseFlashcards } from '../features/notes/flashcard-parse.ts'

test('every silent tool maps to a registered render module', () => {
  assert.deepEqual(Object.keys(SILENT_TOOL_TO_MODULE).sort(), [
    'render_agent_status',
    'render_ai_ask',
    'render_gen_ui',
    'render_image',
    'render_rich_text',
  ])
})

test('extractModuleProps strips protocol-only keys', () => {
  const props = extractModuleProps({
    markdown: 'hi',
    target: 'notes',
    transcriptAnchor: 'seg-1',
    alt: undefined,
  })
  assert.deepEqual(props, { markdown: 'hi' })
})

test('rich-text tool call becomes a valid notes render message', () => {
  const result = silentToolToRender(
    {
      toolName: 'render_rich_text',
      input: { markdown: '导数是变化率', target: 'notes', transcriptAnchor: 'seg-7' },
    },
    { id: 'r1', createdAt: 100 },
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.message.module, 'rich-text')
  assert.equal(result.message.target, 'notes')
  assert.equal(result.message.meta.transcriptAnchor, 'seg-7')
  assert.deepEqual(result.message.props, { markdown: '导数是变化率' })
})

test('image tool defaults target to notes and keeps query/alt', () => {
  const result = silentToolToRender(
    { toolName: 'render_image', input: { query: '心脏解剖', alt: '心脏' } },
    { id: 'r2' },
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.message.module, 'image')
  assert.equal(result.message.target, 'notes')
  assert.deepEqual(result.message.props, { query: '心脏解剖', alt: '心脏' })
})

test('ai-ask tool defaults target to transcript', () => {
  const result = silentToolToRender(
    { toolName: 'render_ai_ask', input: { question: '什么是极限？' } },
    { id: 'r3' },
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.message.target, 'transcript')
})

test('invalid props fail mapping instead of throwing', () => {
  const result = silentToolToRender(
    { toolName: 'render_image', input: { alt: 'no query' } },
    { id: 'r4' },
  )
  assert.equal(result.ok, false)
})

test('unknown tool name fails mapping', () => {
  const result = silentToolToRender(
    // @ts-expect-error deliberate unknown tool
    { toolName: 'render_bogus', input: {} },
    { id: 'r5' },
  )
  assert.equal(result.ok, false)
})

test('collectToolCalls reads calls from steps and top-level, dedupes', () => {
  const a = { toolName: 'render_image', input: { query: 'x' } }
  const b = { toolName: 'render_rich_text', args: { markdown: 'y' } }
  const calls = collectToolCalls({ toolCalls: [a], steps: [{ toolCalls: [a, b] }] })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].toolName, 'render_image')
  assert.deepEqual(calls[1].input, { markdown: 'y' })
})

// ---- outline hierarchy ----

test('parseOutlineLine strips bullets, numbers, headings and measures depth', () => {
  assert.deepEqual(parseOutlineLine('# 导数'), { title: '导数', depth: 0 })
  assert.deepEqual(parseOutlineLine('  - 定义'), { title: '定义', depth: 1 })
  assert.deepEqual(parseOutlineLine('    1. 极限'), { title: '极限', depth: 2 })
  assert.equal(parseOutlineLine('   '), null)
})

test('buildOutlineTree assigns stable parentIds by indentation', () => {
  const tree = buildOutlineTree([
    { title: '导数', depth: 0 },
    { title: '定义', depth: 1 },
    { title: '几何意义', depth: 1 },
    { title: '极限', depth: 0 },
  ])
  assert.equal(tree.length, 4)
  assert.equal(tree[0].parentId, null)
  assert.equal(tree[1].parentId, tree[0].id)
  assert.equal(tree[2].parentId, tree[0].id)
  assert.equal(tree[3].parentId, null)
})

test('outline ids are stable across identical inputs', () => {
  const first = outlineTreeFromLines(['导数', '  定义'])
  const second = outlineTreeFromLines(['导数', '  定义'])
  assert.deepEqual(
    first.map((n) => n.id),
    second.map((n) => n.id),
  )
})

test('stableOutlineId differs by parent scope', () => {
  assert.notEqual(stableOutlineId('p1', '定义'), stableOutlineId('p2', '定义'))
  assert.equal(stableOutlineId(null, '导数'), stableOutlineId(null, '导数'))
})

// ---- flashcards ----

test('parseFlashcards extracts cards from fenced json', () => {
  const text = '好的：\n```json\n{"cards":[{"front":"什么是导数","back":"变化率"}]}\n```'
  const cards = parseFlashcards(text)
  assert.equal(cards.length, 1)
  assert.deepEqual(cards[0], { front: '什么是导数', back: '变化率' })
})

test('parseFlashcards returns empty on malformed output', () => {
  assert.deepEqual(parseFlashcards('no json here'), [])
  assert.deepEqual(parseFlashcards('{"cards":[{"front":""}]}'), [])
})
