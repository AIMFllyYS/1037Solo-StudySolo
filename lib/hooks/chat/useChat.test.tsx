import { act, cleanup, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';
import { useChat } from './useChat';
import { useChatHistory } from '../../stores/chat/chatHistory';
import { useUserNotes } from '@/lib/stores/learning/userNotes';
import { useSettings } from '../../stores/settings';
import { useTokenTracker } from '../../stores/chat/tokenTracker';
import { useFloatingTokenTracker } from '../../stores/chat/floatingTokenTracker';
import { useBillingStore } from '../../stores/billing';
import { useSkills } from '../../stores/skills';
import { useAcademicYear } from '../../stores/academicYear';
import { useSessionRuns, __resetSessionRunControllers } from '@/lib/stores/chat/sessionRuns';
import { hydrateAttachmentsForApi } from '@/lib/storage/chatStorage';
import { createUserMessage, getMessageText } from '@/lib/chat/messages/messageParts';
import type { ChatContext, ChatMessage, ContextBreakdown, UsageSummary } from '@/lib/types/chat';

import { buildTrace } from '@/lib/chat/messages/buildTrace';

vi.mock('@/lib/storage/idbStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/idbStorage')>();
  // This transport fixture represents available storage; durable Blob writes use setItemNow directly.
  return { ...actual, setItemNow: vi.fn(async () => true), idbStorage: {
    getItem: vi.fn(async () => null), setItem: vi.fn(), setItemLazy: vi.fn(), removeItem: vi.fn(async () => {}),
  } };
});
vi.mock('@/lib/storage/chatStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/chatStorage')>();
  return { ...actual, hydrateAttachmentsForApi: vi.fn(async (messages: ChatMessage[]) => messages) };
});

const context: ChatContext = { subjectId: 'cell-biology', categoryId: 'textbook', itemId: 'chapter-1', currentTopic: '细胞' };
const usage: UsageSummary = { promptTokens: 50, completionTokens: 10, cachedTokens: 20, totalTokens: 60 };
const breakdown: ContextBreakdown = { tools: 5, skills: 5, conversation: 10, pages: 30, webSearch: 10, total: 60, cacheHit: true };
const initialSettings = useSettings.getState();
const encode = (chunk: UIMessageChunk) => new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
const answerChunks = (answer = '最终回答'): UIMessageChunk[] => [
  { type: 'start', messageId: 'remote-id' }, { type: 'start-step' },
  { type: 'reasoning-start', id: 'r' }, { type: 'reasoning-delta', id: 'r', delta: '查找知识点' }, { type: 'reasoning-end', id: 'r' },
  { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: answer }, { type: 'text-end', id: 't' },
];

function controlledResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel }), {
    headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  });
  return { response, cancel,
    emit: (...chunks: UIMessageChunk[]) => chunks.forEach((chunk) => controller.enqueue(encode(chunk))),
    heartbeat: () => controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')),
    close: () => { controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); },
  };
}

function completedResponse(chunks = [...answerChunks(), { type: 'finish' } as UIMessageChunk]) {
  const control = controlledResponse();
  control.emit(...chunks);
  control.close();
  return control.response;
}

type SentRequest = { body: Record<string, unknown>; signal: AbortSignal | null | undefined };
let requests: SentRequest[];
function mockResponses(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url === '/api/chat-title') return Response.json({ title: '自动会话标题' });
    requests.push({ body, signal: init?.signal });
    return respond(body);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function messagesFor(sessionId = 'main') { return useChatHistory.getState().messagesById[sessionId]; }
function lastAssistant(sessionId = 'main') { return messagesFor(sessionId).filter((m) => m.role === 'assistant').at(-1)!; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requests = [];
  const ids = ['main', 'float-a', 'float-b', 'other'];
  useChatHistory.setState({
    activeSessionId: 'main', _hasHydrated: true, _activeMessagesReady: true,
    messagesById: Object.fromEntries(ids.map((id) => [id, []])),
    sessionsMeta: ids.map((id) => ({ id, title: id, createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] })),
    sessionLoadState: Object.fromEntries(ids.map((id) => [id, 'loaded' as const])), loadedSessionIds: ids, pinnedSessionIds: [],
  });
  useSettings.setState({ ...initialSettings, selectedModelId: 'mimo-v2.5', customApiGroups: [] });
  useTokenTracker.getState().resetSession();
  useFloatingTokenTracker.setState({ sessions: {} });
  useBillingStore.setState({ records: [] });
  useSkills.setState({ skills: [] });
  __resetSessionRunControllers();
  useSessionRuns.setState({ byId: {} });
  vi.mocked(hydrateAttachmentsForApi).mockReset().mockImplementation(async (messages) => messages);
});

afterEach(async () => {
  cleanup();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useChat SDK transport regression', () => {
  it('保留 UIMessage/Zustand 真相、选项、标题、data 提示、追问与 exactly-once 计费', async () => {
    const control = controlledResponse();
    const fetch = mockResponses(() => control.response);
    useSettings.setState({ disabledTools: ['drawDiagram'], defaultImageModelId: 'image-model', imageModeTextModel: 'text-primary',
      imageModeTextModelFallback: 'text-fallback', globalContext: '全局上下文', defaultThinkingEffort: 'low' });
    const skills = [{ id: 's', name: '速记', description: '技巧', content: '正文', pinned: true, createdAt: 1 }];
    useSkills.setState({ skills });
    const { result } = renderHook(() => useChat(context, { enableThinking: true, enableSearch: true, thinkingEffort: 'high', contextMode: 'semantic' }));
    act(() => { result.current.sendMessage('什么是细胞？', { quotedText: '教材原文' }); result.current.sendMessage('重复发送'); });
    const assistantId = lastAssistant().id;
    expect(result.current.isLoading).toBe(true);
    expect(messagesFor()).toHaveLength(2);
    expect(getMessageText(messagesFor()[0])).toContain('> 教材原文');
    expect(lastAssistant().parts).toEqual([]);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ modelId: 'mimo-v2.5', ...context, enableThinking: true, thinkingEffort: 'high', enableSearch: true,
      contextMode: 'semantic', academicYear: useAcademicYear.getState().year, disabledTools: ['drawDiagram'],
      defaultImageModelId: 'image-model', imageModeTextModel: 'text-primary', imageModeTextModelFallback: 'text-fallback',
      globalContext: '全局上下文', skills });
    expect(requests[0].body.messages).toEqual([{ id: messagesFor()[0].id, role: 'user', parts: messagesFor()[0].parts }]);
    expect(fetch.mock.calls.some(([url]) => url === '/api/chat-title')).toBe(true);
    expect(useChatHistory.getState().sessionsMeta.find((m) => m.id === 'main')?.title).toBe('自动会话标题');
    control.emit(...answerChunks(), { type: 'data-info', data: { message: '已切换备用 API' }, transient: true },
      { type: 'data-context-breakdown', data: breakdown }, { type: 'data-followup', data: { questions: [' 追问一 ', '追问二'] } },
      { type: 'data-usage', data: usage }, { type: 'data-usage', data: usage },
      { type: 'message-metadata', messageMetadata: { usage, durationMs: 800 } }, { type: 'finish' });
    act(() => useSettings.setState({ selectedModelId: 'changed-mid-flight' }));
    control.close();
    await settle();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.info).toBe('已切换备用 API');
    expect(lastAssistant().id).toBe(assistantId);
    expect(getMessageText(lastAssistant())).toBe('最终回答');
    expect(lastAssistant().metadata).toMatchObject({ usage, modelId: 'mimo-v2.5', thinkingEnabled: true, durationMs: 800 });
    expect(lastAssistant().followUpQuestions).toEqual(['追问一', '追问二']);
    expect(lastAssistant().parts.some((p) => p.type === 'data-info')).toBe(false);
    expect(useTokenTracker.getState().sessionTotal).toEqual(usage);
    expect(useTokenTracker.getState().contextBreakdown).toEqual(breakdown);
    expect(useBillingStore.getState().records).toHaveLength(1);
    expect(useBillingStore.getState().records[0]).toMatchObject({ modelId: 'mimo-v2.5', sessionId: 'main', ...usage });
    act(() => result.current.clearInfo());
    expect(result.current.info).toBeNull();
  });

  it('生图模式客户端账单按实际文本模型计价', async () => {
    const control = controlledResponse();
    mockResponses(() => control.response);
    useSettings.setState({ selectedModelId: 'Tongyi-MAI/Z-Image-Turbo', imageModeTextModel: 'mimo-v2.5' });
    const { result } = renderHook(() => useChat(context));
    act(() => { result.current.sendMessage('画一个细胞'); });
    await settle();
    control.emit(...answerChunks(), { type: 'data-usage', data: { ...usage, actualModelId: 'mimo-v2.5' } }, { type: 'finish' });
    control.close();
    await settle();
    const record = useBillingStore.getState().records[0];
    expect(record.modelId).toBe('mimo-v2.5');
    expect(record.cost).toBeCloseTo((30 * 1 + 20 * 0.02 + 10 * 2) / 1_000_000);
  });

  it('主会话/两划词浮窗并发隔离，切换活动会话不污染新看板，浮窗可单独停止', async () => {
    const main = controlledResponse();
    const first = controlledResponse();
    const second = controlledResponse();
    mockResponses((body) => body.id === 'float-a' ? first.response : body.id === 'float-b' ? second.response : main.response);
    const { result } = renderHook(() => ({
      main: useChat(context), a: useChat(context, undefined, { sessionId: 'float-a', modelId: 'Qwen/Qwen3.8-27B' }),
      b: useChat(context, undefined, { sessionId: 'float-b', modelId: 'deepseek/deepseek-v4-flash' }),
    }));
    act(() => { result.current.main.sendMessage('主'); result.current.a.sendMessage('浮一'); result.current.b.sendMessage('浮二'); });
    await settle();
    expect(requests).toHaveLength(3);
    expect(requests.find((r) => r.body.id === 'float-a')?.body.modelId).toBe('Qwen/Qwen3.8-27B');
    expect(new Set(['main', 'float-a', 'float-b'].flatMap((id) => messagesFor(id).map((m) => m.id))).size).toBe(6);
    first.emit({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '浮窗已收到' });
    await settle();
    act(() => result.current.a.stopGeneration());
    await settle();
    expect(result.current.a.isLoading).toBe(false);
    expect(result.current.a.error).toBeNull();
    expect(result.current.b.isLoading).toBe(true);
    expect(result.current.main.isLoading).toBe(true);
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(getMessageText(lastAssistant('float-a'))).toBe('浮窗已收到');
    const mainTokens = useTokenTracker.getState().sessionTotal;
    act(() => { useChatHistory.setState({ activeSessionId: 'other' }); useSettings.setState({ selectedModelId: 'changed' }); });
    second.emit(...answerChunks('浮窗二答案'), { type: 'data-context-breakdown', data: breakdown }, { type: 'data-usage', data: usage }, { type: 'finish' });
    main.emit(...answerChunks('旧主会话答案'), { type: 'data-context-breakdown', data: breakdown }, { type: 'data-usage', data: usage }, { type: 'finish' });
    second.close(); main.close();
    await settle();
    expect(result.current.main.sessionId).toBe('other');
    expect(result.current.main.messages).toEqual([]);
    expect(getMessageText(lastAssistant('main'))).toBe('旧主会话答案');
    expect(getMessageText(lastAssistant('float-b'))).toBe('浮窗二答案');
    expect(useTokenTracker.getState().sessionTotal).toEqual(mainTokens);
    expect(useTokenTracker.getState().contextBreakdown).toBeNull();
    expect(useFloatingTokenTracker.getState().getSession('float-b').sessionTotal).toEqual(usage);
    expect(useFloatingTokenTracker.getState().getSession('float-a').sessionTotal.totalTokens).toBe(0);
    expect(useBillingStore.getState().records).toHaveLength(2);
    expect(useBillingStore.getState().records.find((r) => r.sessionId === 'float-b')?.modelId).toBe('deepseek/deepseek-v4-flash');
  });

  it('60ms 尾随节流且用户停止保留末帧，之后可以重新发送', async () => {
    const control = controlledResponse();
    let call = 0;
    mockResponses(() => ++call === 1 ? control.response : completedResponse());
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('解释细胞'));
    await settle();
    control.emit({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '第' }, { type: 'text-delta', id: 't', delta: '一帧' });
    await settle();
    expect(getMessageText(lastAssistant())).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(59); });
    expect(getMessageText(lastAssistant())).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getMessageText(lastAssistant())).toBe('第一帧');
    control.emit({ type: 'text-delta', id: 't', delta: '末尾' });
    await settle();
    act(() => result.current.stopGeneration());
    await settle();
    expect(getMessageText(lastAssistant())).toBe('第一帧末尾');
    expect(lastAssistant().parts[0]).toMatchObject({ state: 'streaming' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(control.cancel).toHaveBeenCalledTimes(1);
    expect(useBillingStore.getState().records).toHaveLength(0);
    act(() => result.current.sendMessage('下一次'));
    await settle();
    expect(requests).toHaveLength(2);
    expect(messagesFor()).toHaveLength(4);
    expect(result.current.isLoading).toBe(false);
  });

  it('仅 reasoning 时停止，持久化快照保留中断状态，非运行态 Trace 不显示已完成', async () => {
    const control = controlledResponse();
    mockResponses(() => control.response);
    const { result } = renderHook(() => useChat(context, { enableThinking: true }));
    act(() => result.current.sendMessage('先思考问题'));
    await settle();
    control.emit({ type: 'reasoning-start', id: 'r' }, { type: 'reasoning-delta', id: 'r', delta: '思考尚未结束' });
    await settle();
    act(() => result.current.stopGeneration());
    await settle();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    const saved = lastAssistant();
    expect(saved.parts).toContainEqual(expect.objectContaining({ type: 'reasoning', text: '思考尚未结束', state: 'streaming' }));
    const trace = buildTrace(saved, result.current.isLoading);
    expect(trace.interruptedCount).toBe(1);
    expect(trace.steps[0].status).toBe('interrupted');
    expect(trace.answerText).toBe('');
    expect(control.cancel).toHaveBeenCalledTimes(1);
  });

  it('服务端 error 保留部分答案且不添加通用追问；HTTP 错误可清除', async () => {
    let call = 0;
    mockResponses(() => ++call === 1 ? completedResponse([
      { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '部分答案' },
      { type: 'tool-input-available', toolCallId: 'pending', toolName: 'searchNotes', input: { query: '细胞' } },
      { type: 'error', errorText: '上游返回错误' },
    ]) : new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('问题'));
    await settle();
    expect(result.current.error).toBe('上游返回错误');
    expect(result.current.isLoading).toBe(false);
    expect(getMessageText(lastAssistant())).toBe('部分答案');
    expect(lastAssistant().followUpQuestions).toBeUndefined();
    expect(lastAssistant().parts.find((p) => p.type === 'tool-searchNotes')).toMatchObject({ state: 'output-error' });
    act(() => result.current.sendMessage('再试'));
    await settle();
    expect(result.current.error).toContain('左下角「设置」');
    expect(result.current.error).toContain('邮箱验证码');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('水合门控、未知浮窗会话与空内容不会创建消息或请求', () => {
    const fetch = mockResponses(() => completedResponse());
    useChatHistory.setState({ _hasHydrated: false });
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('不能抢跑'));
    act(() => useChatHistory.setState({ _hasHydrated: true, messagesById: {}, sessionLoadState: {} }));
    act(() => result.current.sendMessage('会话还没加载'));
    const floating = renderHook(() => useChat(context, undefined, { sessionId: 'missing', modelId: 'mimo-v2.5' }));
    act(() => { floating.result.current.sendMessage('无效浮窗'); result.current.sendMessage('   '); });
    expect(fetch).not.toHaveBeenCalled();
    expect(useChatHistory.getState().activeSessionId).toBe('main');
    expect(useChatHistory.getState().messagesById).toEqual({});
  });

  it('附件水合先于请求，80% 软上限仍发送完整历史但不删本地历史', async () => {
    const history: ChatMessage[] = Array.from({ length: 24 }, (_, i) => createUserMessage(`old-${i}`, `历史 ${i}`));
    history[0].attachments = [{ type: 'image', id: 'old-image', mimeType: 'image/png' }];
    history[23].attachments = [{ type: 'image', id: 'recent-image', mimeType: 'image/png' }];
    useChatHistory.setState({ messagesById: { ...useChatHistory.getState().messagesById, main: history } });
    useTokenTracker.setState({ serverContextTokens: 900_000, sessionContextBudgetTokens: 1_000_000 });
    vi.mocked(hydrateAttachmentsForApi).mockImplementation(async (messages) => messages.map((m) => ({
      ...m, attachments: m.attachments?.map(() => ({ type: 'image' as const, mimeType: 'image/png', base64: 'data:image/png;base64,aW1hZ2U=' })),
    })));
    mockResponses(() => completedResponse());
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('本轮带图', { attachments: [{ type: 'image', mimeType: 'image/png', base64: 'data:image/png;base64,aW1hZ2U=' }] }));
    await settle();
    expect(hydrateAttachmentsForApi).toHaveBeenCalledTimes(1);
    const sent = requests[0].body.messages as ChatMessage[];
    expect(sent.length).toBeGreaterThan(16);
    expect(sent.some((m) => m.id === 'old-0')).toBe(true);
    expect(sent.filter((m) => m.id === 'old-0').some((m) => m.parts.some((p) => p.type === 'file'))).toBe(false);
    expect(sent.at(-1)?.parts).toContainEqual({ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,aW1hZ2U=' });
    expect(requests[0].body).toMatchObject({ contextTruncated: true, sessionContextBudgetTokens: 1_000_000 });
    expect(useTokenTracker.getState().contextWarning).toContain('80%');
    expect(messagesFor()).toHaveLength(26);
    expect(messagesFor()[0]).toBe(history[0]);
  });

  it('发送前取消不发 /api/chat；卸载不杀流、后台跑完并落定内容', async () => {
    const control = controlledResponse();
    mockResponses(() => control.response);
    const { result, unmount } = renderHook(() => useChat(context));
    act(() => { result.current.sendMessage('取消水合'); result.current.stopGeneration(); });
    await settle();
    expect(requests).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    act(() => result.current.sendMessage('卸载测试'));
    await settle();
    control.emit({ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '卸载前末帧' });
    await settle();
    unmount();
    await settle();
    // 组件卸载不再中止请求：流继续在后台跑（运行态在 sessionRuns，与组件解耦）。
    expect(control.cancel).not.toHaveBeenCalled();
    expect(useSessionRuns.getState().byId.main?.phase).toBe('running');
    control.emit({ type: 'text-end', id: 't' }, { type: 'finish' });
    control.close();
    await settle();
    expect(useSessionRuns.getState().byId.main?.phase).toBe('done');
    expect(getMessageText(lastAssistant())).toBe('卸载前末帧');
  });

  it('心跳注释保持连接活动，超过 60 秒无字节则停止并给出超时提示', async () => {
    const control = controlledResponse();
    mockResponses(() => control.response);
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('慢请求'));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    control.heartbeat();
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(result.current.isLoading).toBe(true);
    expect(requests[0].signal?.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('60 秒');
    expect(requests[0].signal?.aborted).toBe(true);
    expect(control.cancel).toHaveBeenCalledTimes(1);
  });

  it('请求快照保留自定义配置，per-message 选项优先且不支持思考的模型不发送思考力度', async () => {
    const groups = [{ id: 'custom', name: '自定义', baseUrl: 'https://custom.example/v1', apiKey: 'fake-test-key', models: [{ id: 'plain', thinking: false, contextK: 64 }] }];
    useSettings.setState({ customApiGroups: groups });
    mockResponses(() => completedResponse());
    const { result } = renderHook(() => useChat(context, { enableThinking: true, enableSearch: true }, { sessionId: 'float-a', modelId: 'custom:custom:plain' }));
    act(() => result.current.sendMessage('自定义', { enableSearch: false, thinkingEffort: 'max' }));
    await settle();
    expect(requests[0].body.customApiGroups).toEqual(groups);
    expect(requests[0].body.enableThinking).toBe(false);
    expect(requests[0].body.enableSearch).toBe(false);
    expect(requests[0].body).not.toHaveProperty('thinkingEffort');
    expect(useTokenTracker.getState().currentContextTokens).toBe(0);
  });

  it('服务端 abort chunk 不呈现错误，旧 customProvider 配置仍发往 API', async () => {
    useSettings.setState({
      selectedModelId: 'custom:legacy-model',
      customApiGroups: [],
      customBaseUrl: 'https://legacy.example/v1',
      customApiKey: 'fake-legacy-key',
      customModelId: 'legacy-model',
    });
    mockResponses(() => completedResponse([{ type: 'abort' }]));
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('兼容旧端点'));
    await settle();
    expect(requests[0].body.customProvider).toEqual({ baseUrl: 'https://legacy.example/v1', apiKey: 'fake-legacy-key', model: 'legacy-model' });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('旧 FollowUp 标签与本地追问兜底保留；空主会话能正常创建', async () => {
    let call = 0;
    mockResponses(() => completedResponse(answerChunks(++call === 1 ? '答案<FollowUp>标签一|标签二</FollowUp>' : '第二条答案')));
    useChatHistory.setState({ activeSessionId: null });
    const { result } = renderHook(() => useChat(context));
    act(() => result.current.sendMessage('解释细胞'));
    await settle();
    const sid = result.current.sessionId!;
    expect(sid).toBeTruthy();
    expect(lastAssistant(sid).followUpQuestions).toEqual(['标签一', '标签二']);
    act(() => result.current.sendMessage('推导公式'));
    await settle();
    expect(lastAssistant(sid).followUpQuestions).toEqual(['每一步的依据是什么？', '有没有更简单的推导方法？', '这个公式怎么记忆？']);
  });

  it('窗内笔记会话带上指定 editingUserNote，且不改主 thread', async () => {
    mockResponses(() => completedResponse());
    const noteId = useUserNotes.getState().createNote('anatomy', { title: '被覆上皮', markdown: '# 被覆上皮\n\n旧稿' });
    useUserNotes.getState().openEditor(noteId);
    useUserNotes.getState().setAgentEditingNoteId('other-note');
    useChatHistory.setState({
      activeSessionId: 'main',
      messagesById: { main: [], 'note-s': [] },
      sessionsMeta: ['main', 'note-s'].map((id) => ({
        id, title: id, createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [],
      })),
      sessionLoadState: { main: 'loaded', 'note-s': 'loaded' },
      loadedSessionIds: ['main', 'note-s'],
    });
    const { result } = renderHook(() => useChat(context, undefined, { sessionId: 'note-s', editingUserNoteId: noteId }));
    act(() => { result.current.sendMessage('把分类补全'); });
    await settle();
    // updatedAt 随正文一起上行，作为候选稿的并发校验基线（见 noteChangeProposal）。
    expect(requests[0].body.editingUserNote).toEqual({
      id: noteId,
      title: '被覆上皮',
      markdown: '# 被覆上皮\n\n旧稿',
      updatedAt: useUserNotes.getState().byId[noteId]!.updatedAt,
    });
    expect(requests[0].body.noteWindowAgent).toBe(true);
    expect(requests[0].body.userNotes).toEqual([]);
    expect(requests[0].body.flashcards).toEqual([]);
    expect(messagesFor('main')).toEqual([]);
    expect(messagesFor('note-s')).toHaveLength(2);
  });

  it('sendMessage 把 planMode / forcedTool / attachedFiles 与设置里的 maxToolRounds 带进 /api/chat', async () => {
    mockResponses(() => completedResponse());
    useSettings.setState({ maxToolRounds: 9 });
    const attached = [{
      path: 'probability/detail/1.4', title: '古典概型', kind: 'file' as const,
      address: '概率论 › 详解 › 古典概型', subjectId: 'probability', categoryId: 'detail', itemId: '1.4',
    }];
    const { result } = renderHook(() => useChat(context));
    act(() => { result.current.sendMessage('先列计划', { planMode: true, forcedTool: 'generateImage', attachedFiles: attached }); });
    await settle();
    expect(requests[0].body.planMode).toBe(true);
    expect(requests[0].body.forcedTool).toBe('generateImage');
    expect(requests[0].body.attachedFiles).toEqual(attached);
    expect(requests[0].body.maxToolRounds).toBe(9);
  });
});
