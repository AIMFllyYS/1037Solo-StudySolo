import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectMessageSources,
  collectMessageSourceRounds,
  collectSessionSourceRounds,
  dedupeByKey,
  traceSourceKey,
} from './traceSources.ts';
import type { ChatMessagePart } from '@/lib/types/chat';

test('dedupeByKey drops duplicate keys and keeps empty-key items', () => {
  const items = [
    { id: 'a' },
    { id: 'a' },
    { id: '' },
    { id: '' },
    { id: 'b' },
  ];
  assert.deepEqual(
    dedupeByKey(items, (item) => item.id || null),
    [{ id: 'a' }, { id: '' }, { id: '' }, { id: 'b' }],
  );
});

test('collectMessageSources gathers notes and dedupes web urls', () => {
  const parts = [
    {
      type: 'tool-searchNotes',
      toolCallId: 'n',
      state: 'output-available',
      input: { query: '贝叶斯' },
      output: { text: 'ok', hits: [{ title: '贝叶斯', path: 'probability/detail/1.4', snippet: '公式' }] },
    },
    {
      type: 'tool-webSearch',
      toolCallId: 'w',
      state: 'output-available',
      input: { query: 'q' },
      output: { text: 'ok', sources: [{ title: '课程', url: 'https://example.edu/a', snippet: '摘要' }] },
    },
    {
      type: 'tool-webSearch',
      toolCallId: 'w2',
      state: 'output-available',
      input: { query: 'q2' },
      output: { text: 'ok', sources: [
        { title: '课程重复', url: 'https://example.edu/a', snippet: '' },
        { title: '补充', url: 'https://example.edu/b', snippet: '' },
      ] },
    },
  ] as ChatMessagePart[];

  const sources = collectMessageSources(parts);
  assert.equal(sources.length, 3);
  assert.deepEqual(sources[0], { kind: 'note', title: '贝叶斯', path: 'probability/detail/1.4', snippet: '公式' });
  assert.equal(sources.filter((s) => s.kind === 'web').length, 2);
});

test('collectMessageSources keeps web hits that have a title but no url', () => {
  const parts = [
    {
      type: 'tool-webSearch',
      toolCallId: 'w',
      state: 'output-available',
      input: { query: 'q' },
      output: { text: 'ok', sources: [
        { title: '无链接', url: '', snippet: '摘要' },
        { title: '有链接', url: 'https://example.edu/a', snippet: '' },
      ] },
    },
  ] as ChatMessagePart[];
  const sources = collectMessageSources(parts);
  assert.equal(sources.length, 2);
  assert.equal(sources.filter((item) => item.kind === 'web' && !item.url).length, 1);
});

test('collectMessageSources dedupes notes by path and ignores source-url parts', () => {
  const parts = [
    {
      type: 'tool-searchNotes',
      toolCallId: 'n1',
      state: 'output-available',
      input: { query: 'a' },
      output: { text: 'ok', hits: [{ title: '贝叶斯', path: 'probability/detail/1.4', snippet: '公式' }] },
    },
    {
      type: 'tool-searchNotes',
      toolCallId: 'n2',
      state: 'output-available',
      input: { query: 'b' },
      output: { text: 'ok', hits: [
        { title: '贝叶斯重复', path: 'probability/detail/1.4', snippet: '另一段' },
        { title: '全概率', path: 'probability/detail/1.3', snippet: '全概率' },
      ] },
    },
    { type: 'source-url', sourceId: 'extra', title: '补充', url: 'https://example.edu/b' },
  ] as ChatMessagePart[];

  const sources = collectMessageSources(parts);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map((s) => s.kind === 'note' ? s.path : ''), [
    'probability/detail/1.4',
    'probability/detail/1.3',
  ]);
});

// ─── 检索轮次 ─────────────────────────────────────────────

test('collectMessageSourceRounds keeps each call as a round with its query', () => {
  const parts = [
    {
      type: 'tool-searchNotes',
      toolCallId: 'n',
      state: 'output-available',
      input: { query: '贝叶斯' },
      output: { text: 'ok', hits: [{ title: '贝叶斯', path: 'probability/detail/1.4', snippet: '公式' }] },
    },
    {
      type: 'tool-webSearch',
      toolCallId: 'w',
      state: 'output-available',
      input: { query: '全概率公式' },
      output: { text: 'ok', sources: [{ title: '课程', url: 'https://example.edu/a', snippet: '摘要' }] },
    },
  ] as ChatMessagePart[];

  const rounds = collectMessageSourceRounds(parts);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].tool, 'searchNotes');
  assert.equal(rounds[0].query, '贝叶斯');
  assert.equal(rounds[0].id, 'searchNotes:0:贝叶斯');
  assert.deepEqual(rounds[0].sources[0], {
    kind: 'note',
    title: '贝叶斯',
    path: 'probability/detail/1.4',
    snippet: '公式',
    query: '贝叶斯',
    roundId: 'searchNotes:0:贝叶斯',
  });
  assert.equal(rounds[1].tool, 'webSearch');
  assert.equal(rounds[1].query, '全概率公式');
  assert.deepEqual(rounds[1].sources[0], {
    kind: 'web',
    title: '课程',
    url: 'https://example.edu/a',
    snippet: '摘要',
    query: '全概率公式',
    roundId: 'webSearch:1:全概率公式',
  });
});

test('collectMessageSourceRounds falls back to the first hit title and ignores unfinished parts', () => {
  const parts = [
    {
      type: 'tool-searchNotes',
      toolCallId: 'n',
      state: 'output-available',
      input: { id: 'note-1' },
      output: { text: 'ok', hits: [{ title: '心传导系', path: 'anatomy/detail/3.2', snippet: '窦房结' }] },
    },
    {
      type: 'tool-webSearch',
      toolCallId: 'w1',
      state: 'output-available',
      preliminary: true,
      input: { query: '草稿' },
      output: { text: 'ok', sources: [{ title: '半成品', url: 'https://example.edu/draft', snippet: '' }] },
    },
    { type: 'tool-webSearch', toolCallId: 'w2', state: 'input-available', input: { query: '还没回来' } },
    {
      type: 'tool-webSearch',
      toolCallId: 'w3',
      state: 'output-available',
      input: { query: '零结果' },
      output: { text: 'ok', sources: [] },
    },
  ] as ChatMessagePart[];

  const rounds = collectMessageSourceRounds(parts);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].tool, 'searchNotes');
  // 走 id 直取时没有 query，用命中标题兜底，别让分组标题空着
  assert.equal(rounds[0].query, '心传导系');
  assert.equal(rounds[0].id, 'searchNotes:0:心传导系');
});

test('collectMessageSourceRounds turns image results into openable sources', () => {
  const parts = [
    {
      type: 'tool-imageSearch',
      toolCallId: 'i',
      state: 'output-available',
      input: { query: '肝小叶' },
      output: {
        text: 'ok',
        provider: 'unsplash',
        sources: [{ title: '', url: 'https://images.example/liver.jpg', snippet: '', alt: '肝小叶切片' }],
      },
    },
    {
      type: 'tool-searchNoteImages',
      toolCallId: 'ni',
      state: 'output-available',
      input: { query: '肺' },
      output: {
        text: 'ok',
        images: [{
          src: '/images/anatomy/textbook/p0405_01.png',
          alt: '肺泡',
          caption: '肺泡壁',
          path: 'anatomy/textbook/ch09-4',
          subjectId: 'anatomy',
          categoryId: 'textbook',
          itemId: 'ch09-4',
          title: '呼吸系统',
          context: '肺泡上皮',
          score: 1,
        }],
      },
    },
  ] as ChatMessagePart[];

  const rounds = collectMessageSourceRounds(parts);
  assert.equal(rounds.length, 2);
  // imageSearch 只有 alt 没有 title：标题要退回 alt，不能是空串
  assert.deepEqual(rounds[0].sources[0], {
    kind: 'web',
    title: '肝小叶切片',
    url: 'https://images.example/liver.jpg',
    snippet: '',
    query: '肝小叶',
    roundId: 'imageSearch:0:肝小叶',
  });
  // 笔记配图用图片 src 当 url：一条图一个可点开的入口
  assert.deepEqual(rounds[1].sources[0], {
    kind: 'web',
    title: '肺泡',
    url: '/images/anatomy/textbook/p0405_01.png',
    snippet: '肺泡壁',
    query: '肺',
    roundId: 'searchNoteImages:1:肺',
  });
});

test('collectSessionSourceRounds keeps message order, dedupes globally and rewrites round ids', () => {
  const messages = [
    {
      role: 'assistant',
      parts: [{
        type: 'tool-searchNotes',
        toolCallId: 'n1',
        state: 'output-available',
        input: { query: '甲' },
        output: { text: 'ok', hits: [
          { title: '甲一', path: 'p1', snippet: '' },
          { title: '甲二', path: 'p2', snippet: '' },
        ] },
      }],
    },
    {
      role: 'assistant',
      parts: [{
        type: 'tool-searchNotes',
        toolCallId: 'n2',
        state: 'output-available',
        input: { query: '乙' },
        output: { text: 'ok', hits: [
          { title: '甲一（重复）', path: 'p1', snippet: '' },
          { title: '乙一', path: 'p3', snippet: '' },
        ] },
      }],
    },
  ] as { role: string; parts: ChatMessagePart[] }[];

  const rounds = collectSessionSourceRounds(messages);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].id, '0:searchNotes:0:甲');
  assert.deepEqual(rounds[0].sources.map((source) => (source.kind === 'note' ? source.path : '')), ['p1', 'p2']);
  assert.equal(rounds[1].id, '1:searchNotes:0:乙');
  // p1 已经在第一轮里出现过，第二轮只留 p3
  assert.deepEqual(rounds[1].sources.map((source) => (source.kind === 'note' ? source.path : '')), ['p3']);
  // 来源的 roundId 跟着会话级 id 走，扁平列表也能按轮次分组
  assert.equal(rounds[1].sources[0].roundId, '1:searchNotes:0:乙');
  assert.equal(rounds[1].sources[0].query, '乙');
  // 纯函数：同一输入重复调用结果一致（id 稳定，才能当去重键 / React key）
  assert.deepEqual(collectSessionSourceRounds(messages), rounds);
});

test('collectSessionSourceRounds drops rounds whose sources were all seen before', () => {
  const hit = { title: '甲一', path: 'p1', snippet: '' };
  const searchPart = (toolCallId: string, query: string) => ({
    type: 'tool-searchNotes',
    toolCallId,
    state: 'output-available',
    input: { query },
    output: { text: 'ok', hits: [hit] },
  });
  const rounds = collectSessionSourceRounds([
    { role: 'assistant', parts: [searchPart('n1', '甲')] },
    { role: 'assistant', parts: [searchPart('n2', '甲的同一条')] },
    { role: 'assistant', parts: [{ type: 'text', text: '没有工具的消息' }] },
  ] as { role: string; parts: ChatMessagePart[] }[]);

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].query, '甲');
});

test('collectMessageSources includes getSection and getCurrentPage as notes', () => {
  const parts = [
    {
      type: 'tool-getSection',
      toolCallId: 's',
      state: 'output-available',
      input: { path: 'histology/textbook/ch02-1' },
      output: {
        text: '上皮',
        found: true,
        title: '被覆上皮',
        path: 'histology/textbook/ch02-1',
        contextKey: 'section:histology/textbook/ch02-1',
      },
    },
    {
      type: 'tool-getCurrentPage',
      toolCallId: 'p',
      state: 'output-available',
      input: {},
      output: {
        text: '当前页',
        found: true,
        title: '贝叶斯',
        path: 'probability/detail/1.4',
        contextKey: 'page:probability/detail/1.4',
      },
    },
  ] as ChatMessagePart[];
  const sources = collectMessageSources(parts);
  assert.deepEqual(sources.map((item) => item.kind === 'note' ? item.path : ''), [
    'histology/textbook/ch02-1',
    'probability/detail/1.4',
  ]);
});

test('collectSessionSourceRounds lets sources without a key through', () => {
  const rounds = collectSessionSourceRounds([{
    role: 'assistant',
    parts: [{
      type: 'tool-webSearch',
      toolCallId: 'w',
      state: 'output-available',
      input: { query: '无链接' },
      output: { text: 'ok', sources: [
        { title: '空链接甲', url: '', snippet: '甲' },
        { title: '空链接乙', url: '', snippet: '乙' },
      ] },
    }],
  }] as { role: string; parts: ChatMessagePart[] }[]);

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].sources.length, 2);
  assert.equal(traceSourceKey(rounds[0].sources[0]), null);
});
