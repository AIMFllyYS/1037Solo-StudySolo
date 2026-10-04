import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';
import FloatingChatBody from './FloatingChatBody';
import { useChatHistory } from '@/lib/hooks/useChatHistory';
import { useFloatingChats, type SeedMode } from '@/lib/hooks/useFloatingChats';
import { useSettings } from '@/lib/hooks/useSettings';
import { useBillingStore } from '@/lib/hooks/useBillingStore';
import { useTokenTracker } from '@/lib/hooks/useTokenTracker';
import { useFloatingTokenTracker } from '@/lib/hooks/useFloatingTokenTracker';
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
vi.mock('@/components/chat/ChatThread', () => ({ default: ({ isLoading, info, onClearInfo, accessGateContent }: {
  isLoading: boolean; info: string | null; onClearInfo: () => void; accessGateContent?: React.ReactNode;
}) => <div><span data-testid="loading">{String(isLoading)}</span><span data-testid="info">{info}</span>{accessGateContent}<button onClick={onClearInfo}>清除提示</button></div> }));
vi.mock('@/components/chat/ChatInput', () => ({ default: ({ onSend, onStop, isLoading, disabled, disabledReason }: {
  onSend: (text: string) => void; onStop: () => void; isLoading: boolean; disabled?: boolean; disabledReason?: string;
}) => <div><span data-testid="chat-disabled">{String(!!disabled)}</span><span data-testid="chat-disabled-reason">{disabledReason}</span><button disabled={disabled && !isLoading} onClick={() => onSend('手动输入')}>手动发送</button><button disabled={disabled && !isLoading} onClick={onStop}>停止</button></div> }));

const context = { subjectId: 'cell-biology', categoryId: 'textbook', itemId: 'ch01', currentTopic: '细胞' };
const initialSettings = useSettings.getState();
const seed = (mode: SeedMode = 'explain') => ({ id: 'window', sessionId: 'floating', ownerId: getStorageOwner(), ownerEpoch: getOwnerEpoch(), modelId: 'Qwen/Qwen3.8-27B', seedMode: mode, seedText: '被选中的教材原文', seedNonce: 1 });
let requests: Array<Record<string, unknown>>;
let ownerBeforeTest: string | null = null;

function Host({ visible = true }: { visible?: boolean }) {
  const win = useFloatingChats((s) => s.windows[0]);
  return visible && win ? <FloatingChatBody win={win} chatContext={context} onModelChange={() => {}} /> : null;
}

function responseControl() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel }), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const emit = (...chunks: UIMessageChunk[]) => chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)));
  const finish = () => {
    emit({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '浮窗答案' }, { type: 'text-end', id: 't' },
      { type: 'data-info', data: { message: '备用端点提示' }, transient: true },
      { type: 'data-usage', data: { promptTokens: 10, completionTokens: 5, cachedTokens: 2, totalTokens: 15 } }, { type: 'finish' });
    controller.close();
  };
  return { response, cancel, emit, finish };
}

function mockFetch(response?: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/chat-title') return Response.json({ title: '浮窗自动标题' });
    requests.push(JSON.parse(String(init?.body)));
    if (response) return response();
    const control = responseControl();
    control.finish();
    return control.response;
  }));
}

const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
const floatingMessages = () => useChatHistory.getState().messagesById.floating;

beforeEach(() => {
  vi.useFakeTimers();
  ownerBeforeTest = getStorageOwner();
  activateStorageOwner("floating-test-owner");
  authState.status = "signedIn";
  authState.userId = "floating-test-owner";
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requests = [];
  useChatHistory.setState({ activeSessionId: 'main', _hasHydrated: true, _activeMessagesReady: true,
    messagesById: { main: [], floating: [] }, sessionLoadState: { main: 'loaded', floating: 'loaded' },
    sessionsMeta: ['main', 'floating'].map((id) => ({ id, title: id, createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] })),
    loadedSessionIds: ['main', 'floating'], pinnedSessionIds: [],
  });
  useFloatingChats.setState({ windows: [seed()] });
  useSettings.setState({ ...initialSettings, selectedModelId: 'mimo-v2.5', customApiGroups: [] });
  useBillingStore.setState({ records: [] });
  useTokenTracker.getState().resetSession();
  useFloatingTokenTracker.setState({ sessions: {} });
  __resetSessionRunControllers();
  useSessionRuns.setState({ byId: {} });
});

afterEach(async () => {
  cleanup();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  activateStorageOwner(ownerBeforeTest);
});

describe('FloatingChatBody automatic seed lifecycle with real useChat', () => {
  it('shows signed-out status instead of fake Stop and rejects a seed across owner switches', async () => {
    authState.status = "signedOut";
    authState.userId = null;
    activateStorageOwner(null);
    useFloatingChats.setState({ windows: [seed()] });
    useChatHistory.setState({
      activeSessionId: "floating",
      _hasHydrated: false,
      _activeMessagesReady: false,
      messagesById: {},
      sessionLoadState: {},
      sessionsMeta: [],
      loadedSessionIds: [],
      pinnedSessionIds: [],
    });
    mockFetch();
    render(<Host />);
    await settle();

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("chat-disabled")).toHaveTextContent("true");
    expect(screen.getByTestId("chat-access-notice")).toHaveTextContent("登录后继续对话");
    expect(useFloatingChats.getState().windows[0]?.seedNonce).toBe(1);
    expect(requests).toHaveLength(0);

    act(() => {
      authState.status = "signedIn";
      authState.userId = "floating-new-owner";
      activateStorageOwner("floating-new-owner");
      useChatHistory.setState({
        activeSessionId: "floating",
        _hasHydrated: true,
        _activeMessagesReady: true,
        messagesById: { floating: [] },
        sessionLoadState: { floating: "loaded" },
        sessionsMeta: [{ id: "floating", title: "current owner session", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
        loadedSessionIds: ["floating"],
        pinnedSessionIds: [],
      });
    });
    await settle();

    expect(screen.getByTestId("chat-access-notice")).toHaveTextContent("账号已切换");
    expect(useFloatingChats.getState().windows[0]?.seedNonce).toBe(1);
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "关闭浮窗" }));
    expect(useChatHistory.getState().sessionsMeta.some((session) => session.id === "floating")).toBe(true);
  });

  it('drops a queued seed when the owner changes before React can commit the new owner', async () => {
    mockFetch();
    render(<Host />);

    act(() => {
      authState.status = "signedIn";
      authState.userId = "floating-next-owner";
      activateStorageOwner("floating-next-owner");
      // The new owner can have the same local session id; a queued callback from
      // the previous render must not seed this colliding session.
      useChatHistory.setState({
        activeSessionId: "floating",
        _hasHydrated: true,
        _activeMessagesReady: true,
        messagesById: { main: [], floating: [] },
        sessionLoadState: { main: "loaded", floating: "loaded" },
        sessionsMeta: [{ id: "floating", title: "next owner session", createdAt: 2, updatedAt: 2, messageCount: 0, artifactIds: [] }],
        loadedSessionIds: ["main", "floating"],
        pinnedSessionIds: [],
      });
      vi.runAllTicks();
    });
    await settle();

    expect(requests).toHaveLength(0);
    expect(useChatHistory.getState().messagesById.floating).toEqual([]);
    expect(useFloatingChats.getState().windows[0]?.seedNonce).toBe(1);
  });

  it.each(['explain', 'example'] as const)('StrictMode %s 首次挂载只发送一次，保留浮窗模型/会话/计费与 info props', async (mode) => {
    useFloatingChats.setState({ windows: [seed(mode)] });
    mockFetch();
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: 'floating', modelId: 'Qwen/Qwen3.8-27B' });
    expect(floatingMessages()).toHaveLength(2);
    expect(getMessageText(floatingMessages()[0])).toContain('> 被选中的教材原文');
    expect(getMessageText(floatingMessages()[0])).toContain(mode === 'explain' ? '通俗易懂' : '具体、贴近的例子');
    expect(getMessageText(floatingMessages()[1])).toBe('浮窗答案');
    expect(useFloatingChats.getState().windows[0].seedNonce).toBe(0);
    expect(useChatHistory.getState().messagesById.main).toEqual([]);
    expect(useTokenTracker.getState().sessionTotal.totalTokens).toBe(0);
    expect(useFloatingTokenTracker.getState().getSession('floating').sessionTotal.totalTokens).toBe(15);
    expect(useBillingStore.getState().records).toHaveLength(1);
    expect(useBillingStore.getState().records[0]).toMatchObject({ sessionId: 'floating', modelId: 'Qwen/Qwen3.8-27B' });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('info')).toHaveTextContent('备用端点提示');
    fireEvent.click(screen.getByText('清除提示'));
    expect(screen.getByTestId('info')).toBeEmptyDOMElement();
  });

  it('等待 manifest/session 水合后再发送，未就绪时不消耗 seedNonce', async () => {
    useChatHistory.setState({ _hasHydrated: false });
    mockFetch();
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(0);
    expect(floatingMessages()).toEqual([]);
    expect(useFloatingChats.getState().windows[0].seedNonce).toBe(1);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("chat-disabled")).toHaveTextContent("true");
    act(() => useChatHistory.setState({ _hasHydrated: true }));
    await settle();
    expect(requests).toHaveLength(1);
  });

  it('最小化卸载不杀真实流、后台跑完落终态；恢复后不再次发送已经接收的 seed', async () => {
    const control = responseControl();
    mockFetch(() => control.response);
    const view = render(<StrictMode><Host /></StrictMode>);
    await settle();
    control.emit({ type: 'reasoning-start', id: 'r' }, { type: 'reasoning-delta', id: 'r', delta: '部分思考' });
    await settle();
    view.rerender(<StrictMode><Host visible={false} /></StrictMode>);
    await settle();
    // 最小化不再中止：会话继续在后台跑完（离开对话仍继续）。
    expect(control.cancel).not.toHaveBeenCalled();
    expect(useSessionRuns.getState().byId.floating?.phase).toBe('running');
    control.finish();
    await settle();
    expect(useSessionRuns.getState().byId.floating?.phase).toBe('done');
    expect(useChatHistory.getState().pinnedSessionIds).not.toContain('floating');
    view.rerender(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    expect(floatingMessages()).toHaveLength(2);
    expect(useChatHistory.getState().pinnedSessionIds).toContain('floating');
  });

  it('忙碌时保留新 seed，空闲后发送一次；窗口模型变化不会重发已消费项', async () => {
    const first = responseControl();
    const second = responseControl();
    let count = 0;
    mockFetch(() => ++count === 1 ? first.response : second.response);
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    act(() => useFloatingChats.getState().updateWindow('window', { seedNonce: 2, seedText: '第二段原文', seedMode: 'example' }));
    await settle();
    expect(requests).toHaveLength(1);
    expect(useFloatingChats.getState().windows[0].seedNonce).toBe(2);
    first.finish();
    await settle();
    expect(requests).toHaveLength(2);
    expect(getMessageText(floatingMessages()[2])).toContain('第二段原文');
    expect(getMessageText(floatingMessages()[2])).toContain('具体、贴近的例子');
    second.finish();
    await settle();
    act(() => useFloatingChats.getState().updateWindow('window', { modelId: 'mimo-v2.5' }));
    await settle();
    expect(requests).toHaveLength(2);
  });

  it('微任务派发前真实卸载不产生占位，也不消费 seed；后续挂载可以发送', async () => {
    mockFetch();
    const first = render(<StrictMode><Host /></StrictMode>);
    first.unmount();
    await settle();
    expect(requests).toHaveLength(0);
    expect(floatingMessages()).toEqual([]);
    expect(useFloatingChats.getState().windows[0].seedNonce).toBe(1);
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
  });

  it('ask 模式不自动发送，只有首次手动问题自动引用选中文字', async () => {
    useFloatingChats.setState({ windows: [seed('ask')] });
    mockFetch();
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByText('手动发送'));
    await settle();
    fireEvent.click(screen.getByText('手动发送'));
    await settle();
    expect(getMessageText(floatingMessages()[0])).toContain('> 被选中的教材原文');
    expect(getMessageText(floatingMessages()[2])).toBe('手动输入');
  });
});
