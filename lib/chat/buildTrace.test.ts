import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrace, buildToolTraceStep, getTraceToolOutput, getTraceToolStatus, type TraceToolPart } from './buildTrace.ts';
import { getAnswerText, migrateLegacyMessage } from './messageParts.ts';
import type { ChatMessagePart } from '@/lib/types/chat';

const search: TraceToolPart = {
  type: 'tool-searchNotes', toolCallId: 'search-1', state: 'output-available',
  input: { query: '条件概率' }, output: { text: '相关笔记', hits: [{ title: '条件概率', path: 'p/1', snippet: '教材摘要' }] },
};
const section: TraceToolPart = {
  type: 'tool-getSection', toolCallId: 'section-1', state: 'output-available',
  input: { path: 'p/1' }, output: { text: '教材正文', found: true },
};

test('domain output facts distinguish command and external action lifecycle states', () => {
  const cloud = (output: unknown) => ({ type: 'tool-cloudSandbox', toolCallId: 'fixture', state: 'output-available', input: { action: 'status' }, output }) as TraceToolPart;
  const connector = (output: unknown) => ({ type: 'tool-learningConnectors', toolCallId: 'fixture', state: 'output-available', input: { action: 'status' }, output }) as TraceToolPart;
  for (const state of ['running', 'starting', 'creating', 'closing']) assert.equal(getTraceToolStatus(cloud({ state }), false), 'running');
  for (const state of ['completed', 'active', 'closed']) assert.equal(getTraceToolStatus(cloud({ state }), false), 'complete');
  assert.equal(getTraceToolStatus(cloud({ state: 'completed', exitCode: 2 }), false), 'error');
  assert.equal(getTraceToolStatus(cloud({ error: 'MFA_REQUIRED' }), false), 'error');
  assert.equal(getTraceToolStatus(cloud({ state: 'uncertain', error: 'SANDBOX_RETRY_UNCERTAIN' }), false), 'unknown');
  assert.equal(getTraceToolStatus(cloud({ state: 'unexpected' }), false), 'unknown');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'proposed', expiresAt: Date.now() + 60000 } }), false), 'waiting');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'proposed', expiresAt: 1 } }), false), 'error');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'executing' } }), false), 'running');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'cancelled' } }), false), 'cancelled');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'succeeded', result: { error: 'REMOTE_FAILED' } } }), false), 'error');
  assert.equal(getTraceToolStatus(connector({ action: { status: 'future-state' } }), false), 'unknown');
  assert.equal(getTraceToolStatus(connector({ data: ['public result'] }), false), 'complete');
});

test('buildTrace interleaves answers by step-start and matches getAnswerText', () => {
  const parts: ChatMessagePart[] = [
    { type: 'reasoning', text: '分析问题', state: 'done' },
    { type: 'text', text: '先查阅教材。', state: 'done' },
    search,
    { type: 'step-start' },
    { type: 'reasoning', text: '结合教材继续分析', state: 'done' },
    { type: 'text', text: '读取该节正文。', state: 'done' },
    section,
    { type: 'step-start' },
    { type: 'text', text: '最终回答第一段', state: 'done' },
    { type: 'text', text: '最终回答第二段', state: 'done' },
  ];
  const trace = buildTrace({ parts });
  assert.deepEqual(trace.steps.map((step) => [step.kind, step.partIndex]), [
    ['reasoning', 0], ['tool', 2], ['reasoning', 4], ['tool', 6],
  ]);
  assert.deepEqual(trace.blocks.map((block) => block.kind === 'answer' ? ['answer', block.text] : ['trace', block.steps.map((step) => step.kind)]), [
    ['trace', ['reasoning']],
    ['answer', '先查阅教材。'],
    ['trace', ['tool', 'reasoning']],
    ['answer', '读取该节正文。'],
    ['trace', ['tool']],
    ['answer', '最终回答第一段\n\n最终回答第二段'],
  ]);
  assert.equal(trace.answerText, getAnswerText({ parts }));
  assert.equal(trace.answerText, '先查阅教材。\n\n读取该节正文。\n\n最终回答第一段\n\n最终回答第二段');
  assert.equal(trace.toolCount, 2);
  assert.equal(trace.steps.some((step) => step.kind !== 'tool' && step.text.includes('最终回答')), false);
});

test('without step-start, text before the last tool stays in the two-bucket trace', () => {
  const parts: ChatMessagePart[] = [
    { type: 'reasoning', text: '分析问题', state: 'done' },
    { type: 'text', text: '先查阅教材。', state: 'done' },
    search,
    { type: 'text', text: '最终回答', state: 'done' },
  ];
  const trace = buildTrace({ parts });
  assert.deepEqual(trace.steps.map((step) => step.kind), ['reasoning', 'text', 'tool']);
  assert.equal(trace.answerText, getAnswerText({ parts }));
  assert.equal(trace.answerText, '最终回答');
  assert.deepEqual(trace.blocks.map((block) => block.kind), ['trace', 'answer']);
});

test('without tools all text is the answer, never a second trace copy', () => {
  const trace = buildTrace({ parts: [
    { type: 'reasoning', text: '先分析', state: 'done' },
    { type: 'text', text: '答案 A' }, { type: 'text', text: '答案 B' },
  ] });
  assert.deepEqual(trace.steps.map((step) => step.kind), ['reasoning']);
  assert.equal(trace.answerText, '答案 A\n\n答案 B');
  assert.equal(buildTrace({ parts: [{ type: 'text', text: '普通回复' }] }).steps.length, 0);
});

test('streamed text moves into the trace once a later tool is appended, without duplication', () => {
  const parts: ChatMessagePart[] = [{ type: 'text', text: '先查笔记', state: 'done' }];
  assert.equal(buildTrace({ parts }, true).answerText, '先查笔记');
  const next = buildTrace({ parts: [...parts, { type: 'tool-searchNotes', toolCallId: 'search-1', state: 'input-streaming', input: { query: '条件' } }] }, true);
  assert.equal(next.answerText, '');
  assert.equal(next.steps[0].summary, '先查笔记');
  assert.equal(next.steps[1].status, 'running');
  const finished = buildTrace({ parts: [...parts, search, { type: 'text', text: '查阅完成' }] });
  assert.equal(finished.steps[1].id, next.steps[1].id);
  assert.equal(finished.steps[1].status, 'complete');
  assert.equal(finished.answerText, '查阅完成');
});

test('an unfinished historical tool is interrupted instead of spinning forever', () => {
  const part: TraceToolPart = { type: 'tool-getSection', toolCallId: 't', state: 'input-available', input: { path: 'p/1' } };
  assert.equal(buildToolTraceStep(part, 0, true).status, 'running');
  const stopped = buildTrace({ parts: [part] }, false);
  assert.equal(stopped.steps[0].status, 'interrupted');
  assert.equal(stopped.interruptedCount, 1);
  assert.equal(stopped.answerText, '');
});

test('reasoning placeholders stay visible while running and interrupted reasoning does not remain active', () => {
  const parts: ChatMessagePart[] = [{ type: 'reasoning', text: '', state: 'streaming' }];
  assert.equal(buildTrace({ parts }, true).steps[0].status, 'running');
  assert.equal(buildTrace({ parts }, false).steps[0].status, 'interrupted');
  assert.equal(buildTrace({ parts: [{ type: 'reasoning', text: '   ', state: 'done' }] }).steps.length, 0);
});

test('tool errors, denied calls and preliminary outputs are not reported as completed', () => {
  const error: TraceToolPart = { type: 'tool-getSection', toolCallId: 'error', state: 'output-error', input: undefined, rawInput: '{bad', errorText: '参数格式错误' };
  const denied: TraceToolPart = { type: 'dynamic-tool', toolName: 'external', toolCallId: 'denied', state: 'output-denied', input: {}, approval: { id: 'a', approved: false, reason: '用户未批准' } };
  const partial: TraceToolPart = { ...section, state: 'output-available', input: { path: 'p/1' }, output: { text: '尚未完成', found: true }, preliminary: true };
  const trace = buildTrace({ parts: [error, denied, partial] });
  assert.equal(trace.errorCount, 2);
  assert.equal(trace.interruptedCount, 1);
  assert.equal(getTraceToolOutput(error), '参数格式错误');
  assert.equal(getTraceToolOutput(denied), '用户未批准');
  assert.equal(buildToolTraceStep(partial, 0, true).status, 'running');
});

test('pending approval is distinct from a stopped call', () => {
  const part: TraceToolPart = { type: 'dynamic-tool', toolName: 'external', toolCallId: 'a', state: 'approval-requested', input: {}, approval: { id: 'approval' } };
  const trace = buildTrace({ parts: [part] });
  assert.equal(trace.waitingCount, 1);
  assert.equal(trace.steps[0].status, 'waiting');
  assert.equal(trace.interruptedCount, 0);
});

test('metadata, sources and step boundaries do not become spurious trace rows', () => {
  const parts: ChatMessagePart[] = [
    { type: 'step-start' }, { type: 'data-info', data: { message: '切换端点' } },
    { type: 'data-followup', data: { questions: ['追问'] } },
    { type: 'source-url', sourceId: 's', title: '来源', url: 'https://example.com' },
    { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,YQ==' },
    { type: 'text', text: '最终回答' },
  ];
  const trace = buildTrace({ parts });
  assert.equal(trace.steps.length, 0);
  assert.equal(trace.answerText, '最终回答');
});

test('custom endpoint think markup is separated from the answer, including an unfinished stream', () => {
  const thinkParts: ChatMessagePart[] = [{ type: 'text', text: '<think>兼容端点的思考</think>回答', state: 'done' }];
  const complete = buildTrace({ parts: thinkParts });
  assert.equal(complete.steps[0].summary, '兼容端点的思考');
  assert.equal(complete.answerText, '回答');
  assert.equal(complete.answerText, getAnswerText({ parts: thinkParts }));
  const partial = buildTrace({ parts: [{ type: 'text', text: '<think>未完成思考', state: 'streaming' }] }, true);
  assert.equal(partial.steps[0].status, 'running');
  assert.equal(partial.answerText, '');
  assert.equal(buildTrace({ parts: [{ type: 'text', text: '<think>已停止思考', state: 'streaming' }] }).answerText, '');
  assert.equal(getAnswerText({ parts: [{ type: 'text', text: '<think>已停止思考', state: 'streaming' }] }), '');
});

test('summaries use result counts, cached sources and skill metadata', () => {
  assert.equal(buildToolTraceStep(search, 0).summary, '找到 1 条笔记');
  assert.equal(buildToolTraceStep({ type: 'tool-webSearch', toolCallId: 'web', state: 'output-available', input: { query: 'q' }, output: { text: 'full text', sources: [{ title: 'S', url: 'https://example.com', snippet: 's' }], cacheHit: true } }, 0).summary, '1 条来源 · 缓存命中');
  assert.equal(buildToolTraceStep({ type: 'tool-useSkill', toolCallId: 'skill', state: 'output-available', input: { name: '复习' }, output: { text: '加载完成', skill: '复习', found: true } }, 0).summary, '已调用技能：复习');
  assert.equal(buildToolTraceStep({ ...section, state: 'output-available', input: {}, output: { text: '已加载', found: true, deduped: true } }, 0).summary, '已在上下文中，复用已加载内容');
});

test('legacy migration and unknown historical tool names retain a readable trace', () => {
  const message = migrateLegacyMessage({ id: 'legacy', role: 'assistant', content: '旧回答', reasoningContent: '旧思考', timestamp: 1, toolCalls: [{ id: 'old', name: 'oldCustomTool', arguments: {}, status: 'success', result: '旧结果' }] });
  const trace = buildTrace(message);
  assert.deepEqual(trace.steps.map((step) => step.kind), ['reasoning', 'tool']);
  assert.equal(trace.steps[1].title, 'oldCustomTool');
  assert.equal(trace.answerText, '旧回答');
});

test('projection never mutates the message or its parts', () => {
  const parts = Object.freeze([Object.freeze({ type: 'text' as const, text: 'intermediate' }), Object.freeze(search)]);
  const before = JSON.stringify(parts);
  buildTrace({ parts: parts as unknown as ChatMessagePart[] }, true);
  assert.equal(JSON.stringify(parts), before);
});
