import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UIMessageChunk } from 'ai';
import { TOOL_STEP_LIMIT_INFO } from '@/lib/ai/agent/tools/_shared';
import { consumeStudyStream, createStudyChatTransport } from './consumeStudyStream';
import { createAssistantPlaceholder, getMessageText, getReasoningText } from '../messages/messageParts';
import type { ChatMessage, ContextBreakdown, UsageSummary } from '@/lib/types/chat';

const usage: UsageSummary = { promptTokens: 100, completionTokens: 20, cachedTokens: 30, totalTokens: 120 };
const breakdown: ContextBreakdown = {
  tools: 5, skills: 5, conversation: 10, pages: 80, webSearch: 20, total: 120,
  displayTotal: 120, cachedTokens: 30, cacheHit: true,
};
const initial = () => createAssistantPlaceholder('local-id', { modelId: 'selected-model', thinkingEnabled: true }, 123);

function fromChunks(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  });
}

const textChunks = (text = '最终回答'): UIMessageChunk[] => [
  { type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: text }, { type: 'text-end', id: 'text' },
];

test('SDK 有序多步快照保留 reasoning/tool outputs/metadata，data 只结算一次且不修改占位对象', async (t) => {
  let clock = 1_000;
  t.mock.method(Date, 'now', () => {
    clock += 10;
    return clock;
  });
  const placeholder = initial();
  const original = structuredClone(placeholder);
  const snapshots: ChatMessage[] = [];
  const charges: UsageSummary[] = [];
  const contexts: ContextBreakdown[] = [];
  const infos: string[] = [];
  const output = { text: '检索完成', sources: [{ title: '来源', url: 'https://example.com', snippet: '摘要' }], cacheHit: true };
  const result = await consumeStudyStream({
    message: placeholder,
    stream: fromChunks([
      { type: 'start', messageId: 'server-id' }, { type: 'start-step' },
      { type: 'reasoning-start', id: 'r' }, { type: 'reasoning-delta', id: 'r', delta: '先检索资料' }, { type: 'reasoning-end', id: 'r' },
      { type: 'tool-input-start', toolCallId: 'search', toolName: 'webSearch' },
      { type: 'tool-input-delta', toolCallId: 'search', inputTextDelta: '{"query":"细胞"}' },
      { type: 'tool-input-available', toolCallId: 'search', toolName: 'webSearch', input: { query: '细胞' } },
      { type: 'tool-output-available', toolCallId: 'search', output },
      { type: 'finish-step' }, { type: 'start-step' }, ...textChunks(),
      { type: 'data-info', data: { message: '已切换备用端点' }, transient: true },
      { type: 'data-context-breakdown', data: breakdown },
      { type: 'data-followup', data: { questions: [' 问题一 ', '', '问题二', '问题三', '第四条'] } },
      { type: 'data-usage', data: { ...usage, actualModelId: 'mimo-v2.5' } }, { type: 'data-usage', data: { ...usage, actualModelId: 'mimo-v2.5' } },
      { type: 'message-metadata', messageMetadata: { usage, durationMs: 246, cacheHit: true } },
      { type: 'finish', messageMetadata: { usage } },
    ]),
    onMessage: (snapshot) => snapshots.push(snapshot),
    onUsage: (value) => charges.push(value), onContextBreakdown: (value) => contexts.push(value), onInfo: (value) => infos.push(value),
  });
  assert.deepEqual(placeholder, original);
  assert.equal(result.id, 'local-id');
  assert.equal(result.timestamp, 123);
  assert.equal(result.metadata?.modelId, 'selected-model');
  assert.equal(result.metadata?.thinkingEnabled, true);
  assert.deepEqual(result.metadata?.usage, { ...usage, actualModelId: 'mimo-v2.5' });
  assert.equal(result.metadata?.durationMs, 246);
  assert.equal(result.metadata?.cacheHit, true);
  assert.ok((result.metadata?.stepDurationsMs?.['reasoning:1'] ?? -1) >= 0);
  assert.ok((result.metadata?.stepDurationsMs?.['tool:search'] ?? -1) >= 0);
  const completedToolSnapshot = snapshots.find((snapshot) => snapshot.parts.some(
    (part) => part.type === 'tool-webSearch' && part.state === 'output-available',
  ));
  const toolDurationAtCompletion = completedToolSnapshot?.metadata?.stepDurationsMs?.['tool:search'];
  assert.ok(toolDurationAtCompletion != null && toolDurationAtCompletion > 0);
  assert.equal(result.metadata?.stepDurationsMs?.['tool:search'], toolDurationAtCompletion);
  assert.deepEqual(result.parts.slice(0, 5).map((p) => p.type), ['step-start', 'reasoning', 'tool-webSearch', 'step-start', 'text']);
  const tool = result.parts.find((p) => p.type === 'tool-webSearch');
  assert.equal(tool?.state, 'output-available');
  if (tool?.state === 'output-available') assert.deepEqual(tool.output, output);
  assert.equal(getReasoningText(result), '先检索资料');
  assert.equal(getMessageText(result), '最终回答');
  assert.equal(result.parts.some((p) => p.type === 'data-info'), false);
  assert.deepEqual(result.followUpQuestions, ['问题一', '问题二', '问题三']);
  assert.deepEqual(charges, [{ ...usage, actualModelId: 'mimo-v2.5' }]);
  assert.deepEqual(contexts, [breakdown]);
  assert.deepEqual(infos, ['已切换备用端点']);
  assert.ok(snapshots.some((m) => m.parts.some((p) => p.type === 'tool-webSearch' && p.state === 'input-streaming')));
  const emptyTextSnapshot = snapshots.find((m) => m.parts.some((p) => p.type === 'text' && p.text === ''));
  assert.ok(emptyTextSnapshot);
  assert.equal(getMessageText(emptyTextSnapshot), ''); // 后续 delta 不得原地污染已发布的快照。
});

test('所有结构化工具结果（artifact/image/search/skill）由 SDK 原样保留，工具错误不终止回答', async () => {
  const calls = [
    { name: 'renderInteractive', input: { title: '模型', prompt: '交互模型' }, output: { text: '已准备', artifactId: 'art-1', title: '模型', prompt: '交互模型', modelId: 'custom:a' } },
    { name: 'generateImage', input: { prompt: '细胞图', title: '细胞' }, output: { text: '等待批准', imageGenId: 'img-1', title: '细胞', prompt: '细胞图', modelId: 'image-model', size: '1024x1024', count: 1 } },
    { name: 'imageSearch', input: { query: '细胞' }, output: { text: '图片', provider: 'unsplash', sources: [{ title: '细胞', url: 'https://example.com/image', snippet: '', media: 'https://example.com/thumb', author: '作者' }] } },
    { name: 'searchNotes', input: { query: '细胞' }, output: { text: '笔记', hits: [{ title: '细胞', path: '/chapter', snippet: '摘要' }] } },
    { name: 'useSkill', input: { name: '记忆' }, output: { text: '技巧', skill: '记忆', found: true } },
  ];
  const result = await consumeStudyStream({
    message: initial(), onMessage() {},
    stream: fromChunks([
      ...calls.flatMap((call): UIMessageChunk[] => [
        { type: 'tool-input-available', toolCallId: call.name, toolName: call.name, input: call.input },
        { type: 'tool-output-available', toolCallId: call.name, output: call.output },
      ]),
      { type: 'tool-input-available', toolCallId: 'failed', toolName: 'getSection', input: { path: '/missing' } },
      { type: 'tool-output-error', toolCallId: 'failed', errorText: '页不存在' }, ...textChunks(), { type: 'finish' },
    ]),
  });
  for (const call of calls) {
    const part = result.parts.find((p) => p.type === `tool-${call.name}`);
    assert.ok(part && 'output' in part);
    assert.deepEqual(part.output, call.output);
  }
  assert.equal(getMessageText(result), '最终回答');
  const failed = result.parts.find((p) => p.type === 'tool-getSection');
  assert.equal(failed?.state, 'output-error');
});

test('finishReason 从 finish 落到 metadata，触顶 data-info 仍走 onInfo', async () => {
  const infos: string[] = [];
  const result = await consumeStudyStream({
    message: initial(), onMessage() {}, onInfo: (value) => infos.push(value),
    stream: fromChunks([
      ...textChunks('部分卡片'),
      { type: 'data-info', data: { message: TOOL_STEP_LIMIT_INFO }, transient: true },
      { type: 'message-metadata', messageMetadata: { finishReason: 'tool-calls', durationMs: 12 } },
      { type: 'finish', finishReason: 'tool-calls' },
    ]),
  });
  assert.equal(result.metadata?.finishReason, 'tool-calls');
  assert.deepEqual(infos, [TOOL_STEP_LIMIT_INFO]);
  assert.equal(result.parts.some((p) => p.type === 'data-info'), false);
});

test('0/0 usage 不触发 onUsage，避免 ¥0 幽灵账单', async () => {
  const charges: UsageSummary[] = [];
  const zero = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };
  await consumeStudyStream({
    message: initial(), onMessage() {}, onUsage: (u) => charges.push(u),
    stream: fromChunks([
      ...textChunks(),
      { type: 'data-usage', data: zero },
      { type: 'message-metadata', messageMetadata: { usage: zero, durationMs: 10 } },
      { type: 'finish' },
    ]),
  });
  assert.deepEqual(charges, []);
});

test('usage metadata 是 data 缺失时的兜底，畸形 data 不污染计费/上下文', async () => {
  const charges: UsageSummary[] = [];
  const contexts: ContextBreakdown[] = [];
  await consumeStudyStream({
    message: initial(), onMessage() {}, onUsage: (u) => charges.push(u), onContextBreakdown: (b) => contexts.push(b),
    stream: fromChunks([
      { type: 'data-usage', data: { promptTokens: 'invalid', completionTokens: -1 } },
      { type: 'data-context-breakdown', data: { total: 'invalid' } },
      { type: 'data-followup', data: { questions: 'invalid' } },
      { type: 'message-metadata', messageMetadata: { usage } }, { type: 'finish' },
    ]),
  });
  assert.deepEqual(charges, [usage]);
  assert.deepEqual(contexts, []);
});

test('取消未关闭的流会立即取消底层 reader，保留文字/思考及未完成 part 状态供 Trace 显示中断', async () => {
  const abort = new AbortController();
  let cancellations = 0;
  let last = initial();
  const charges: UsageSummary[] = [];
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'reasoning-start', id: 'r' });
      controller.enqueue({ type: 'reasoning-delta', id: 'r', delta: '已收到思考' });
      controller.enqueue({ type: 'text-start', id: 't' });
      controller.enqueue({ type: 'text-delta', id: 't', delta: '保留正文' });
      controller.enqueue({ type: 'data-usage', data: usage });
      controller.enqueue({ type: 'tool-input-available', toolCallId: 'pending', toolName: 'getSection', input: { path: '/chapter' } });
    },
    cancel() { cancellations++; },
  });
  await assert.rejects(consumeStudyStream({
    stream, message: initial(), abortSignal: abort.signal, onUsage: (u) => charges.push(u),
    onMessage(snapshot) {
      last = snapshot;
      if (snapshot.parts.some((p) => p.type === 'tool-getSection' && p.state === 'input-available')) abort.abort();
    },
  }), { name: 'AbortError' });
  assert.equal(cancellations, 1);
  assert.equal(stream.locked, false);
  assert.equal(getMessageText(last), '保留正文');
  assert.equal(getReasoningText(last), '已收到思考');
  assert.ok(last.parts.every((p) => (p.type !== 'text' && p.type !== 'reasoning') || p.state === 'streaming'));
  const tool = last.parts.find((p) => p.type === 'tool-getSection');
  assert.equal(tool?.state, 'input-available');
  assert.deepEqual(charges, [usage]);
});

test('服务端 error 会拒绝并关闭仍打开的网络流，partial text 最终仍落盘', async () => {
  let last = initial();
  let cancelled = 0;
  await assert.rejects(consumeStudyStream({
    message: initial(), onMessage(m) { last = m; },
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: 't' });
        controller.enqueue({ type: 'text-delta', id: 't', delta: '部分答案' });
        controller.enqueue({ type: 'error', errorText: '上游失败' });
      },
      cancel() { cancelled++; },
    }),
  }), /上游失败/);
  assert.equal(getMessageText(last), '部分答案');
  assert.equal(last.parts[0].type === 'text' && last.parts[0].state, 'streaming');
  assert.equal(cancelled, 1);
});

test('预取消、服务端 abort 和 SDK 协议错误都结束请求且不生成用量', async () => {
  const aborted = new AbortController();
  aborted.abort();
  for (const [stream, signal, expected] of [
    [fromChunks(textChunks()), aborted.signal, /abort/i],
    [fromChunks([{ type: 'abort' }]), undefined, /生成被中断/],
    [fromChunks([{ type: 'text-delta', id: 'missing', delta: '坏帧' }]), undefined, /missing text part/],
  ] as const) {
    let billed = false;
    await assert.rejects(consumeStudyStream({ stream, abortSignal: signal, message: initial(), onMessage() {}, onUsage() { billed = true; } }), expected);
    assert.equal(billed, false);
    assert.equal(stream.locked, false);
  }
});

test('DefaultChatTransport 解析跨 UTF-8 分片/心跳/[DONE]，透传 UIMessage 及请求设置', async (t) => {
  let request: Record<string, unknown> | undefined;
  let activities = 0;
  const bytes = new TextEncoder().encode(`: heartbeat\n\ndata: ${JSON.stringify({ type: 'text-start', id: 't' })}\n\ndata: ${JSON.stringify({ type: 'text-delta', id: 't', delta: '中文💡' })}\n\ndata: ${JSON.stringify({ type: 'text-end', id: 't' })}\n\ndata: [DONE]\n\n`);
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    request = JSON.parse(String(init?.body));
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); },
    }), { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
  });
  const transport = createStudyChatTransport(() => { activities++; });
  const messages = [{ id: 'user', role: 'user' as const, parts: [{ type: 'text' as const, text: '问题' }] }];
  const stream = await transport.sendMessages({ chatId: 'session', messageId: 'user', trigger: 'submit-message', messages,
    abortSignal: undefined, body: { modelId: 'custom:model', contextTruncated: true } });
  const result = await consumeStudyStream({ stream, message: initial(), onMessage() {} });
  assert.equal(getMessageText(result), '中文💡');
  assert.equal(activities, bytes.length + 1);
  assert.deepEqual(request?.messages, messages);
  assert.equal(request?.modelId, 'custom:model');
  assert.equal(request?.contextTruncated, true);
});

test('HTTP 非成功状态与空响应体提供可读错误', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('bad gateway', { status: 503, statusText: 'Service Unavailable' }));
  const send = () => createStudyChatTransport(() => {}).sendMessages({ chatId: 's', messageId: 'm', messages: [], trigger: 'submit-message', abortSignal: undefined });
  await assert.rejects(send(), /503 Service Unavailable - bad gateway/);
  mock.mock.mockImplementation(async () => new Response('<html>413 Request Entity Too Large nginx/1.18.0</html>', { status: 413, statusText: 'Request Entity Too Large' }));
  await assert.rejects(send(), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /原对话与附件已保留/);
    assert.doesNotMatch(err.message, /nginx|<html/i);
    return true;
  });
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: "平台额度已用完。可改用 BYOK 继续使用。" }), { status: 402, statusText: 'Payment Required' }));
  await assert.rejects(send(), /可改用 BYOK/);
  mock.mock.mockImplementation(async () => new Response(null));
  await assert.rejects(send(), /流读取失败/);
});
