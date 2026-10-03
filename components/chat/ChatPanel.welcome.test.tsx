import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from './ChatPanel';
import { useChatHistory } from '@/lib/hooks/useChatHistory';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSkills } from '@/lib/hooks/useSkills';
import { useStore } from '@/lib/store';

vi.mock('@/lib/storage/idbStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/idbStorage')>(),
  idbStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), setItemLazy: vi.fn(), removeItem: vi.fn(async () => {}) },
}));
vi.mock('@/lib/hooks/useChatHistory', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/hooks/useChatHistory')>(),
  ensureChatHistoryBootstrap: vi.fn(async () => {}),
}));
vi.mock('@/lib/hooks/useAutoHideChatHeader', () => ({ useAutoHideChatHeader: () => ({ autoHideEnabled: false, headerCollapsed: false }) }));
vi.mock('@/components/chat/ChatThread', () => ({
  default: ({ emptyState }: { emptyState?: React.ReactNode }) => <div data-testid="chat-thread">{emptyState}</div>,
}));
vi.mock('@/components/chat/ChatEmptyState', () => ({ default: () => <div data-testid="chat-empty-state" /> }));
vi.mock('@/components/chat/ChatPanelHeader', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatHistoryOverlay', () => ({ default: () => null }));
vi.mock('@/components/notes/SelectionPopover', () => ({ default: () => null }));
vi.mock('@/components/shared/ImageLightbox', () => ({ ImageLightbox: () => null }));
vi.mock('@/components/chat/TokenDashboard', () => ({ default: () => <div data-testid="token-dashboard" /> }));
vi.mock('@/components/chat/ModelMenu', () => ({ default: () => <div data-testid="model-menu" /> }));
vi.mock('@/lib/hooks/useChatUI', () => ({ useChatUI: () => ({ quotedText: null, clearQuotedText: vi.fn() }) }));
vi.mock('@/lib/hooks/useImageAttachments', () => ({ useImageAttachments: () => ({
  attachments: [], addFiles: vi.fn(), remove: vi.fn(), clear: vi.fn(), toChatFormat: () => [],
  handlePaste: vi.fn(), handleDrop: vi.fn(), handleDragOver: vi.fn(), handleDragEnter: vi.fn(), handleDragLeave: vi.fn(),
  isDragging: false, endDrag: vi.fn(), error: null,
}) }));

/** Agent 的上下文不绑定章节：分类 / 内容项都空。 */
const agentContext = { subjectId: 'probability', categoryId: '', itemId: '', currentTopic: '' };
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

function mockChatStream() {
  const body = [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: '好的' },
    { type: 'text-end', id: 't' },
    { type: 'finish' },
  ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    url === '/api/chat-title'
      ? Response.json({ title: '新对话' })
      : new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  )));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useStore.setState({ outbound: null });
  useSettings.setState({ selectedModelId: 'mimo-v2.5', customApiGroups: [], defaultThinking: false, defaultSearch: false });
  useSkills.setState({ skills: [] });
  useChatHistory.setState({ activeSessionId: 'main', _hasHydrated: true, _activeMessagesReady: true,
    messagesById: { main: [] }, sessionLoadState: { main: 'loaded' },
    sessionsMeta: [{ id: 'main', title: 'main', createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    loadedSessionIds: ['main'], pinnedSessionIds: [],
  });
});
afterEach(async () => {
  cleanup(); await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Agent 空对话欢迎页', () => {
  it('空对话时给问候语与示例清单，输入框照旧可用', async () => {
    mockChatStream();
    const { container } = render(<ChatPanel chatContext={agentContext} hideHeader emptyLayout="agent" />);
    await settle();
    expect(container.querySelector('.chat-panel--welcome')).toBeTruthy();
    expect(screen.getByTestId('agent-welcome-greeting')).toBeInTheDocument();
    expect(screen.getByTestId('agent-welcome-examples')).toBeInTheDocument();
    expect(screen.getByLabelText('试试这样问我')).toBeInTheDocument();
    expect(screen.getByTestId('agent-welcome-example-outline')).toHaveTextContent('按核心概念搭出清晰的章节框架');
    expect(screen.getByTestId('agent-composer-hints')).toHaveTextContent('Enter');
    expect(screen.getByTestId('agent-composer-hints')).toHaveTextContent('发送');
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '输入问题、引用笔记、计划或工具');
  });

  it('发出第一条消息后欢迎页退场，输入框是同一个节点、草稿不丢', async () => {
    mockChatStream();
    const { container } = render(<ChatPanel chatContext={agentContext} hideHeader emptyLayout="agent" />);
    await settle();
    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textbox, { target: { value: '我自己敲了一半的草稿' } });
    fireEvent.click(screen.getByTestId('agent-welcome-example-outline'));
    await settle();
    expect(container.querySelector('.chat-panel--welcome')).toBeNull();
    expect(screen.queryByTestId('agent-welcome-examples')).toBeNull();
    expect(screen.queryByTestId('agent-welcome-greeting')).toBeNull();
    expect(screen.getByTestId('agent-composer-hints')).toBeInTheDocument();
    const after = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(after).toBe(textbox);
    expect(after.value).toBe('我自己敲了一半的草稿');
  });

  it('点了「新建对话」但其实已经在空白对话里：不新增会话，只提示并聚焦输入框', async () => {
    mockChatStream();
    render(<ChatPanel chatContext={agentContext} hideHeader emptyLayout="agent" />);
    await settle();
    const textbox = screen.getByRole('textbox');
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(1);

    act(() => { useChatHistory.getState().startNewChat(agentContext); });
    await settle();

    expect(screen.getByTestId('blank-chat-hint')).toHaveTextContent('已经在一条新对话里了');
    expect(textbox).toHaveFocus();
    expect(useChatHistory.getState().sessionsMeta).toHaveLength(1);

    // 提示是瞬态的，两秒后自己退场
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.queryByTestId('blank-chat-hint')).toBeNull();
  });

  it('默认版式不受影响：Studio / 手机端空对话仍是原来的占位卡', async () => {
    mockChatStream();
    const { container } = render(<ChatPanel chatContext={agentContext} />);
    await settle();
    expect(container.querySelector('.chat-panel--welcome')).toBeNull();
    expect(screen.queryByTestId('agent-welcome-examples')).toBeNull();
    expect(screen.queryByTestId('agent-composer-hints')).toBeNull();
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
  });
});
