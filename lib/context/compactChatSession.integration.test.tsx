import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/types/chat';
const state = vi.hoisted(() => ({ messages: [] as ChatMessage[], checkpoints: vi.fn(), meta: { id: 'public-session', kind: 'main' } }));
vi.mock('@/lib/storage/chatStorage', () => ({ loadSessionMessages: vi.fn(async () => state.messages), flushPendingSessionCheckpoints: vi.fn(async () => {}) }));
vi.mock('@/lib/stores/chat/chatHistory', () => ({ useChatHistory: { getState: () => ({ activeSessionId: 'public-session', sessionsMeta: [state.meta], setContextCheckpoint: state.checkpoints }) } }));
vi.mock('@/lib/stores/settings', () => ({ useSettings: { getState: () => ({ selectedModelId: 'fixture-model', customApiGroups: [] }) } }));
vi.mock('@/lib/stores/chat/sessionRuns', () => ({ useSessionRuns: { getState: () => ({ byId: {} }) } }));
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { useCompactionState } from './compactionState';
import { compactActiveSession } from './compactChatSession';
beforeEach(() => {
  activateStorageOwner('10000000-0000-4000-8000-000000000001');
  useCompactionState.setState({ byId: {} });
  state.checkpoints.mockReset();
  state.messages = Array.from({ length: 8 }, (_, i) => [{ id: `u${i}`, role: 'user' as const, timestamp: i * 2, parts: [{ type: 'text' as const, text: `public question ${i}` }] }, { id: `a${i}`, role: 'assistant' as const, timestamp: i * 2 + 1, parts: [{ type: 'text' as const, text: `public answer ${i}` }] }]).flat();
});
afterEach(() => { vi.unstubAllGlobals(); activateStorageOwner(null); });
it('manual compaction calls AI once and saves a checkpoint while retaining all original messages', async () => {
  const original = JSON.stringify(state.messages);
  const fetch = vi.fn(async () => { expect(useCompactionState.getState().byId['public-session']?.phase).toBe('running'); return Response.json({ summary: 'AI 整理的目标、事实、文件与待办' }); });
  vi.stubGlobal('fetch', fetch);
  await compactActiveSession('public-session');
  expect(fetch).toHaveBeenCalledOnce();
  expect(state.checkpoints).toHaveBeenCalledWith('public-session', expect.objectContaining({ summary: 'AI 整理的目标、事实、文件与待办', coveredIds: ['u0','a0','u1','a1'] }));
  expect(JSON.stringify(state.messages)).toBe(original);
  expect(useCompactionState.getState().byId['public-session']?.phase).toBe('done');
});
it('an AI failure preserves the original context and reports a visible error', async () => {
  const original = JSON.stringify(state.messages);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'AI 暂不可用' }, { status: 503 })));
  await expect(compactActiveSession('public-session')).rejects.toThrow('AI 暂不可用');
  expect(state.checkpoints).not.toHaveBeenCalled();
  expect(JSON.stringify(state.messages)).toBe(original);
  expect(useCompactionState.getState().byId['public-session']?.phase).toBe('error');
});
it('switching accounts while AI is responding discards its late checkpoint', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { activateStorageOwner('10000000-0000-4000-8000-000000000002'); return Response.json({ summary: 'old owner summary' }); }));
  await compactActiveSession('public-session');
  expect(state.checkpoints).not.toHaveBeenCalled();
});
it('a file cited from asset detail remains in the checkpoint even when AI omits its URL', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  state.messages[0].parts = [{ type: 'text', text: `引用公开材料 studysolo-file://${id}` }];
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ summary: '公开材料的结论与下一步' })));
  await compactActiveSession('public-session');
  expect(state.checkpoints).toHaveBeenCalledWith('public-session', expect.objectContaining({ cloudFileIds: [id] }));
});
