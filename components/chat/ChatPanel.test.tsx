import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';
import ChatPanel from './ChatPanel';
import { useChatHistory } from '@/lib/hooks/useChatHistory';
import { useStore } from '@/lib/store';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSessionRuns, __resetSessionRunControllers } from '@/lib/stores/sessionRuns';
import { getMessageText } from '@/lib/chat/messageParts';
import { activateStorageOwner, getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';

const authState = vi.hoisted(() => ({ status: "signedIn" as "loading" | "signedOut" | "signedIn", userId: "test-owner" as string | null }));

vi.mock('@/lib/storage/idbStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/idbStorage')>(),
  idbStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), setItemLazy: vi.fn(), removeItem: vi.fn(async () => {}) },
}));
vi.mock('@/lib/hooks/useChatHistory', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/hooks/useChatHistory')>(),
  ensureChatHistoryBootstrap: vi.fn(async () => {}),
}));
vi.mock('@/lib/hooks/useAuthSession', () => ({ useAuthSession: () => authState }));
vi.mock('@/lib/hooks/useAutoHideChatHeader', () => ({ useAutoHideChatHeader: () => ({ autoHideEnabled: false, headerCollapsed: false }) }));
vi.mock('@/components/chat/ChatThread', () => ({ default: ({ isLoading, info, onClearInfo, accessGateContent }: {
  isLoading: boolean; info: string | null; onClearInfo: () => void; accessGateContent?: React.ReactNode;
}) => <div><span data-testid="loading">{String(isLoading)}</span><span data-testid="info">{info}</span>{accessGateContent}<button onClick={onClearInfo}>清除提示</button></div> }));
vi.mock('@/components/chat/composer/ChatInput', () => ({ default: ({ onSend, onStop, isLoading, disabled, disabledReason }: {
  onSend: (text: string) => void; onStop: () => void; isLoading: boolean; disabled?: boolean; disabledReason?: string;
}) => <div><span data-testid="chat-disabled">{String(!!disabled)}</span><span data-testid="chat-disabled-reason">{disabledReason}</span><button disabled={disabled && !isLoading} onClick={() => onSend('手动问题')}>手动发送</button><button disabled={disabled && !isLoading} onClick={onStop}>停止</button></div> }));
vi.mock('@/components/notes/SelectionPopover', () => ({ default: () => null }));
vi.mock('@/components/shared/ImageLightbox', () => ({ ImageLightbox: () => null }));
vi.mock('@/components/chat/ChatSettings', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatPanelHeader', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatEmptyState', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatHistoryOverlay', () => ({ default: () => null }));

const context = { subjectId: 'cell-biology', categoryId: 'textbook', itemId: 'ch01', currentTopic: '细胞' };
let requests: Array<Record<string, unknown>>;
let ownerBeforeTest: string | null = null;
function responseControl() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel }), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const emit = (...chunks: UIMessageChunk[]) => chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)));
  const finish = () => {
    emit({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '主面板答案' }, { type: 'text-end', id: 't' },
      { type: 'data-info', data: { message: '备用端点提示' }, transient: true }, { type: 'finish' });
    controller.close();
  };
  return { response, cancel, finish };
}
function mockFetch(response?: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/chat-title') return Response.json({ title: '自动标题' });
    requests.push(JSON.parse(String(init?.body)));
    if (response) return response();
    const control = responseControl(); control.finish(); return control.response;
  }));
}
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
const users = () => useChatHistory.getState().messagesById.main.filter((m) => m.role === 'user').map(getMessageText);

beforeEach(() => {
  vi.useFakeTimers();
  ownerBeforeTest = getStorageOwner();
  activateStorageOwner("chat-panel-test-owner");
  authState.status = "signedIn";
  authState.userId = "chat-panel-test-owner";
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requests = [];
  useStore.setState({ outbound: null, loginOverlayOpen: false });
  useSettings.setState({ selectedModelId: 'mimo-v2.5', customApiGroups: [] });
  useChatHistory.setState({ activeSessionId: 'main', _hasHydrated: true, _activeMessagesReady: true,
    messagesById: { main: [] }, sessionLoadState: { main: 'loaded' },
    sessionsMeta: [{ id: 'main', title: 'main', createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    loadedSessionIds: ['main'], pinnedSessionIds: [],
  });
  __resetSessionRunControllers();
  useSessionRuns.setState({ byId: {} });
});
afterEach(async () => {
  cleanup(); await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  activateStorageOwner(ownerBeforeTest);
});

describe('ChatPanel outbound lifecycle with real useChat', () => {
  it('keeps history hydration separate from generation while an owner-scoped session loads', () => {
    useChatHistory.setState({ _hasHydrated: false, _activeMessagesReady: false, sessionLoadState: {} });
    render(<ChatPanel chatContext={context} />);

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("chat-disabled")).toHaveTextContent("true");
    expect(screen.getByTestId("chat-disabled-reason")).toHaveTextContent("正在恢复对话历史");
    expect(screen.queryByRole("button", { name: "登录统一账号" })).toBeNull();
  });

  it('guest history readiness is not generation loading and a pending selection never crosses into a signed-in owner', async () => {
    const previousOwner = getStorageOwner();
    try {
      activateStorageOwner(null);
      authState.status = "signedOut";
      authState.userId = null;
      useChatHistory.setState({
        activeSessionId: "guest-main",
        _hasHydrated: false,
        _activeMessagesReady: false,
        messagesById: { "guest-main": [] },
        sessionLoadState: {},
        sessionsMeta: [],
        loadedSessionIds: [],
        pinnedSessionIds: [],
      });
      useStore.getState().sendToChat("guest selection must stay local");
      mockFetch();
      const view = render(<ChatPanel chatContext={context} />);
      await settle();

      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("chat-disabled")).toHaveTextContent("true");
      expect(screen.getByTestId("chat-disabled-reason")).toHaveTextContent("登录后即可使用 AI 对话");
      expect(screen.getByTestId("chat-access-notice")).toBeInTheDocument();
      expect(requests).toHaveLength(0);

      fireEvent.click(screen.getByRole("button", { name: "登录统一账号" }));
      expect(useStore.getState().loginOverlayOpen).toBe(true);

      act(() => {
        authState.status = "signedIn";
        authState.userId = "new-owner";
        activateStorageOwner("new-owner");
        useChatHistory.setState({
          activeSessionId: "new-owner-main",
          _hasHydrated: true,
          _activeMessagesReady: true,
          messagesById: { "new-owner-main": [] },
          sessionLoadState: { "new-owner-main": "loaded" },
          sessionsMeta: [{ id: "new-owner-main", title: "main", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
          loadedSessionIds: ["new-owner-main"],
          pinnedSessionIds: [],
        });
      });
      await settle();

      expect(useStore.getState().outbound).toBeNull();
      expect(useChatHistory.getState().messagesById["new-owner-main"]).toEqual([]);
      expect(requests).toHaveLength(0);
      view.unmount();
    } finally {
      activateStorageOwner(previousOwner);
    }
  });

  it('drops an outbound microtask when the owner changes before React can commit the new owner', async () => {
    const previousOwner = getStorageOwner();
    const previousEpoch = getOwnerEpoch();
    useStore.getState().sendToChat('old-owner queued selection');
    expect(useStore.getState().outbound).toMatchObject({ ownerId: previousOwner, ownerEpoch: previousEpoch });
    mockFetch();
    render(<ChatPanel chatContext={context} />);

    act(() => {
      authState.status = 'signedIn';
      authState.userId = 'chat-panel-next-owner';
      activateStorageOwner('chat-panel-next-owner');
      // Model the new owner's colliding session id becoming active before the old
      // component render has committed its cleanup.
      useChatHistory.setState({
        activeSessionId: 'main',
        _hasHydrated: true,
        _activeMessagesReady: true,
        messagesById: { main: [] },
        sessionLoadState: { main: 'loaded' },
        sessionsMeta: [{ id: 'main', title: 'new owner main', createdAt: 2, updatedAt: 2, messageCount: 0, artifactIds: [] }],
        loadedSessionIds: ['main'],
      });
      // Drain only after the imperative owner switch and before act flushes React.
      vi.runAllTicks();
    });
    await settle();

    expect(requests).toHaveLength(0);
    expect(useChatHistory.getState().messagesById.main).toEqual([]);
  });

  it('StrictMode 挂载时已有 outbound 只发送一次，不在 cleanup 时丢掉请求，info props 保留', async () => {
    useStore.getState().sendToChat('来自选区的问题');
    mockFetch();
    render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    expect(users()).toEqual(['来自选区的问题']);
    expect(useChatHistory.getState().messagesById.main).toHaveLength(2);
    expect(getMessageText(useChatHistory.getState().messagesById.main[1])).toBe('主面板答案');
    expect(useStore.getState().outbound).toBeNull();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('info')).toHaveTextContent('备用端点提示');
    fireEvent.click(screen.getByText('清除提示'));
    expect(screen.getByTestId('info')).toBeEmptyDOMElement();
  });

  it('忙碌时新 outbound 保留到完成后自动发送，不被 sendMessage 的门控吞掉', async () => {
    const first = responseControl();
    const second = responseControl();
    let count = 0;
    mockFetch(() => ++count === 1 ? first.response : second.response);
    render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    fireEvent.click(screen.getByText('手动发送'));
    await settle();
    act(() => useStore.getState().sendToChat('忙碌时排队的问题'));
    await settle();
    expect(requests).toHaveLength(1);
    expect(useStore.getState().outbound?.content).toBe('忙碌时排队的问题');
    first.finish();
    await settle();
    expect(requests).toHaveLength(2);
    expect(users()).toEqual(['手动问题', '忙碌时排队的问题']);
    expect(useStore.getState().outbound).toBeNull();
    second.finish();
    await settle();
  });

  it('微任务派发前手动请求已占用同步 loadingRef，outbound 拒绝后仍可重试', async () => {
    const first = responseControl();
    const second = responseControl();
    let count = 0;
    mockFetch(() => ++count === 1 ? first.response : second.response);
    useStore.getState().sendToChat('自动问题');
    render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    fireEvent.click(screen.getByText('手动发送'));
    await settle();
    expect(users()).toEqual(['手动问题']);
    expect(useStore.getState().outbound?.content).toBe('自动问题');
    first.finish();
    await settle();
    expect(users()).toEqual(['手动问题', '自动问题']);
    expect(requests).toHaveLength(2);
    second.finish(); await settle();
  });

  it('水合完成前不清空 outbound，挂载前后同一消息只产生一个请求', async () => {
    useChatHistory.setState({ _hasHydrated: false, _activeMessagesReady: false });
    useStore.getState().sendToChat('等待水合的问题');
    mockFetch();
    render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(0);
    expect(useStore.getState().outbound?.content).toBe('等待水合的问题');
    act(() => useChatHistory.setState({ _hasHydrated: true, _activeMessagesReady: true }));
    await settle();
    expect(requests).toHaveLength(1);
    expect(useStore.getState().outbound).toBeNull();
  });

  it('未派发的旧 outbound 被新对象替换时只发送新项；清空后重用 nonce 也不会误去重', async () => {
    useStore.getState().sendToChat('旧问题');
    mockFetch();
    render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    act(() => useStore.getState().sendToChat('最新问题'));
    await settle();
    expect(users()).toEqual(['最新问题']);
    act(() => useStore.getState().sendToChat('最新问题'));
    await settle();
    expect(users()).toEqual(['最新问题', '最新问题']);
    expect(requests).toHaveLength(2);
  });

  it('发送同步订阅期间新增 outbound 不被旧项的 clear 覆盖', async () => {
    const first = responseControl();
    const second = responseControl();
    let count = 0;
    mockFetch(() => ++count === 1 ? first.response : second.response);
    useStore.getState().sendToChat('第一条');
    let injected = false;
    const unsubscribe = useChatHistory.subscribe((state) => {
      if (!injected && state.messagesById.main.some((m) => m.role === 'user')) {
        injected = true;
        useStore.getState().sendToChat('同步插入的第二条');
      }
    });
    try {
      render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
      await settle();
      expect(useStore.getState().outbound?.content).toBe('同步插入的第二条');
      expect(requests).toHaveLength(1);
      first.finish(); await settle();
      expect(users()).toEqual(['第一条', '同步插入的第二条']);
      expect(requests).toHaveLength(2);
      second.finish(); await settle();
    } finally { unsubscribe(); }
  });

  it('微任务前卸载不清空待发送项，重新挂载发送；已启动流在卸载后继续跑', async () => {
    const control = responseControl();
    mockFetch(() => control.response);
    useStore.getState().sendToChat('稍后挂载');
    const first = render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    first.unmount();
    await settle();
    expect(users()).toEqual([]);
    expect(requests).toHaveLength(0);
    expect(useStore.getState().outbound?.content).toBe('稍后挂载');
    const second = render(<StrictMode><ChatPanel chatContext={context} /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    second.unmount(); await settle();
    // 卸载不再中止生成：流继续在后台跑，跑完落 done + 未读（用户没在看）。
    expect(control.cancel).not.toHaveBeenCalled();
    expect(useSessionRuns.getState().byId.main?.phase).toBe('running');
    control.finish(); await settle();
    expect(useSessionRuns.getState().byId.main?.phase).toBe('done');
    expect(useSessionRuns.getState().byId.main?.unseen).toBe(true);
  });
});
