import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildTrace } from '@/lib/chat/buildTrace';
import type { ChatMessage as ChatMessageType, ChatMessagePart } from '@/lib/types/chat';
import { AgentTrace, TRACE_COLLAPSE_MS } from './AgentTrace';
import ChatMessage from '../messages/ChatMessage';
import { ToolCallDashboard } from './ToolCallDashboard';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
const openMessageMenu = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motionElement = (tag: string) => React.forwardRef<HTMLElement, Record<string, unknown>>(function MotionMock(props, ref) {
    const { initial, animate, transition, ...rest } = props;
    void initial;
    void animate;
    const repeats = (transition as { repeat?: number } | undefined)?.repeat === Infinity;
    return React.createElement(tag, { ...rest, ref, 'data-motion-repeats': repeats ? 'true' : undefined });
  });
  return {
    motion: {
      span: motionElement('span'),
      div: motionElement('div'),
      ol: motionElement('ol'),
      li: motionElement('li'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => motionPreference.reduced,
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/hooks/useContextMenu', () => ({ openMessageMenu }));
vi.mock('@/components/layout/BrandLogo', () => ({
  default: () => <span role="img" aria-label="StudySolo" data-testid="brand-logo" />,
}));
vi.mock('@/components/chat/messages/MessageContent', () => ({
  MessageContent: ({ content, sessionId, messageId, repairModelId }: { content: string; sessionId?: string; messageId?: string; repairModelId?: string }) => (
    <div data-testid="message-content" data-session-id={sessionId} data-message-id={messageId} data-repair-model={repairModelId}>{content}</div>
  ),
}));
vi.mock('@/components/chat/products/ArtifactCard', () => ({
  default: ({ artifactId, title, prompt, modelId, autoStart, unsupportedReason }: { artifactId: string; title: string; prompt: string; modelId?: string; autoStart: boolean; unsupportedReason?: string }) => (
    <div data-testid="artifact-card" data-artifact-id={artifactId} data-model={modelId} data-prompt={prompt} data-auto-start={String(autoStart)} data-unsupported={unsupportedReason}>{title}</div>
  ),
}));
vi.mock('@/components/chat/products/ImageGenCard', () => ({
  default: ({ imageGenId, title, prompt, modelId, count, size }: { imageGenId: string; title: string; prompt: string; modelId?: string; count: number; size: string }) => (
    <div data-testid="image-gen-card" data-image-id={imageGenId} data-model={modelId} data-prompt={prompt} data-count={count} data-size={size}>{title}</div>
  ),
}));
vi.mock('@/components/chat/attachments/AttachmentThumbnails', () => ({
  default: ({ readonlyAttachments }: { readonlyAttachments: unknown[] }) => <div data-testid="attachments">{readonlyAttachments.length} 张附件</div>,
}));
vi.mock('@/components/chat/messages/FollowUpQuestions', () => ({
  FollowUpQuestions: ({ questions, onSelect }: { questions: string[]; onSelect: (q: string) => void }) => <div data-testid="followups">{questions.map((q) => <button key={q} onClick={() => onSelect(q)}>{q}</button>)}</div>,
}));
vi.mock('@/components/chat/attachments/ImageStrip', () => ({ ImageStrip: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/chat/messages/ChatImage', () => ({ ChatImage: ({ src, alt }: { src: string; alt: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} />
) }));

const tool: ChatMessagePart = { type: 'tool-searchNotes', toolCallId: 'notes', state: 'output-available', input: { query: '贝叶斯' }, output: { text: '检索完整返回', hits: [{ title: '贝叶斯公式', path: 'probability/1.4', snippet: '公式讲解' }] } };
const pendingTool: ChatMessagePart = { type: 'tool-getSection', toolCallId: 'section', state: 'input-available', input: { path: 'probability/1.4' } };
function message(parts: ChatMessagePart[], rest: Partial<ChatMessageType> = {}): ChatMessageType {
  return { id: 'assistant-1', role: 'assistant', timestamp: 1, parts, ...rest };
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-chat-layout-test]').forEach((style) => style.remove());
});
beforeEach(() => { motionPreference.reduced = false; openMessageMenu.mockClear(); });

function mountMessageLayoutStyles() {
  const proseStyles = readFileSync('app/styles/prose.css', 'utf8');
  const style = document.createElement('style');
  style.dataset.chatLayoutTest = 'true';
  // Exercise the production message/trace CSS without loading unrelated prose,
  // composer or browser-specific visualization rules into jsdom.
  style.textContent = proseStyles.slice(proseStyles.indexOf('.chat-message {'), proseStyles.indexOf('.followup-card {'));
  document.head.appendChild(style);
}

describe('ordered AgentTrace', () => {
  it('renders interleaved steps in parts order with an accessible disclosure and active pulse', () => {
    const trace = buildTrace(message([
      { type: 'reasoning', text: '先分析教材', state: 'done' },
      { type: 'text', text: '查阅教材', state: 'done' }, tool,
      { type: 'reasoning', text: '继续验证', state: 'done' }, pendingTool,
    ]), true);
    const { container } = render(<AgentTrace trace={trace} isStreaming />);
    const header = screen.getByRole('button', { name: '正在处理…' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(header.getAttribute('aria-controls')!)).toBeVisible();
    expect(Array.from(container.querySelectorAll('[data-trace-kind]'), (node) => node.getAttribute('data-trace-kind'))).toEqual(['reasoning', 'text', 'tool', 'reasoning', 'tool']);
    expect(container.querySelectorAll('[data-motion-repeats="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('输入参数')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /读取笔记章节 进行中/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-collapses on completion, preserves user choice during a stream and reopens for a new run', () => {
    expect(TRACE_COLLAPSE_MS).toBe(160);
    const active = message([{ type: 'reasoning', text: '思考中', state: 'streaming' }]);
    const { rerender } = render(<AgentTrace trace={buildTrace(active, true)} isStreaming />);
    fireEvent.click(screen.getByRole('button', { name: '正在处理…' }));
    expect(screen.getByRole('button', { name: '正在处理…' })).toHaveAttribute('aria-expanded', 'false');
    rerender(<AgentTrace trace={buildTrace(message([{ type: 'reasoning', text: '思考中继续补充', state: 'streaming' }]), true)} isStreaming />);
    expect(screen.getByRole('button', { name: '正在处理…' })).toHaveAttribute('aria-expanded', 'false');
    const completed = buildTrace(message([{ type: 'reasoning', text: '思考完成', state: 'done' }]));
    rerender(<AgentTrace trace={completed} durationMs={2400} />);
    expect(screen.getByRole('button', { name: '已处理 2 秒' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    rerender(<AgentTrace trace={buildTrace(active, true)} isStreaming />);
    expect(screen.getByRole('button', { name: '正在处理…' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('stopped historical calls never spin or claim success', () => {
    const msg = message([pendingTool]);
    const { container, rerender } = render(<AgentTrace trace={buildTrace(msg, true)} isStreaming />);
    rerender(<AgentTrace trace={buildTrace(msg)} />);
    const header = screen.getByRole('button', { name: '处理已停止' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header);
    expect(container.querySelector('[data-trace-status="interrupted"]')).toBeInTheDocument();
    expect(container.querySelector('[data-motion-repeats="true"]')).toBeNull();
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
    expect(screen.getByText('已停止，未收到完整结果')).toBeVisible();
  });

  it('stopping a reasoning-only reply shows stopped instead of a misleading completed-duration summary', () => {
    // consumeStudyStream preserves an unfinished part's streaming marker on
    // abort/EOF, while the hook independently turns the request isStreaming off.
    const msg = message([{ type: 'reasoning', text: '仍在推理中的部分内容', state: 'streaming' }], { metadata: { durationMs: 600 } });
    const { container, rerender } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} isStreaming />);
    expect(within(container.querySelector('.chat-message-header')!).getByRole('status')).toHaveTextContent('正在处理…');
    expect(screen.getByRole('button', { name: '处理过程' })).toHaveAttribute('aria-expanded', 'true');
    rerender(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} />);
    expect(within(container.querySelector('.chat-message-header')!).getByRole('status')).toHaveTextContent('处理已停止');
    const process = screen.getByRole('button', { name: '处理过程' });
    expect(process).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/已处理/)).not.toBeInTheDocument();
    fireEvent.click(process);
    expect(screen.getByRole('button', { name: /思考 已停止/ })).toBeVisible();
    expect(screen.getByText('仍在推理中的部分内容')).toBeVisible();
    expect(container.querySelector('[data-motion-repeats="true"]')).toBeNull();
  });

  it('keeps raw tool details opt-in and respects manual expansion as later steps stream', () => {
    const { rerender } = render(<AgentTrace trace={buildTrace(message([pendingTool]), true)} isStreaming />);
    const pending = screen.getByRole('button', { name: /读取笔记章节 进行中/ });
    expect(pending).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pending);
    expect(screen.getByText('输入参数')).toBeVisible();
    const done: ChatMessagePart = { type: 'tool-getSection', toolCallId: 'section', state: 'output-available', input: { path: 'probability/1.4' }, output: { text: '章节正文', found: true } };
    rerender(<AgentTrace trace={buildTrace(message([done, { type: 'reasoning', text: '最后分析', state: 'streaming' }]), true)} isStreaming />);
    const completed = screen.getByRole('button', { name: /读取笔记章节 已完成/ });
    expect(completed).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('章节正文')).toBeVisible();
    fireEvent.click(completed);
    expect(screen.queryByText('输入参数')).not.toBeInTheDocument();
  });

  it('keeps failures apparent in the collapsed header and exposes their error text on expansion', () => {
    const msg = message([{ type: 'tool-getSection', toolCallId: 'failed', state: 'output-error', input: undefined, rawInput: '{bad json', errorText: '无法读取章节，请确认路径' }]);
    render(<AgentTrace trace={buildTrace(msg)} />);
    fireEvent.click(screen.getByRole('button', { name: '处理结束，部分步骤未完成' }));
    expect(screen.getByText('无法读取章节，请确认路径')).toBeVisible();
    expect(screen.getByText('{bad json')).toBeVisible();
    expect(screen.getByText('调用失败')).toBeVisible();
  });

  it('supports keyboard-only expanding and closing of both disclosure levels', async () => {
    const user = userEvent.setup();
    render(<AgentTrace trace={buildTrace(message([{ type: 'reasoning', text: '完整思考内容', state: 'done' }]))} />);
    await user.tab();
    const header = screen.getByRole('button', { name: '处理完成' });
    expect(header).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    const step = screen.getByRole('button', { name: /思考 已完成/ });
    expect(step).toHaveFocus();
    await user.keyboard(' ');
    expect(step).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(step.getAttribute('aria-controls')!)).toBeVisible();
    await user.keyboard(' ');
    expect(step).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables repeating animation for reduced motion without hiding running state', () => {
    motionPreference.reduced = true;
    const { container } = render(<AgentTrace trace={buildTrace(message([pendingTool]), true)} isStreaming />);
    expect(container.querySelector('[data-motion-repeats="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: /读取笔记章节 进行中/ })).toBeVisible();
  });

  it('does not show a trace for ordinary text-only answers', () => {
    const { container } = render(<AgentTrace trace={buildTrace(message([{ type: 'text', text: '普通回答' }]))} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a compact thinking placeholder while streaming before any parts arrive', () => {
    const { getByTestId, queryByRole, rerender } = render(
      <AgentTrace trace={buildTrace(message([]), true)} isStreaming />,
    );
    expect(getByTestId('agent-trace-thinking')).toHaveTextContent('正在思考…');
    expect(queryByRole('button')).toBeNull();
    rerender(<AgentTrace trace={buildTrace(message([]))} />);
    expect(queryByRole('status')).toBeNull();
  });

  it('labels total processing duration without implying every second was reasoning', () => {
    const trace = buildTrace(message([tool]));
    const { rerender } = render(<AgentTrace trace={trace} durationMs={600} />);
    expect(screen.getByRole('button', { name: '已处理不到 1 秒' })).toBeVisible();
    rerender(<AgentTrace trace={trace} durationMs={125000} />);
    expect(screen.getByRole('button', { name: '已处理 2 分 5 秒' })).toBeVisible();
    expect(screen.queryByText(/已思考/)).not.toBeInTheDocument();
  });

  it('shows only recorded per-step duration and adds a completion check to the summary', () => {
    const trace = buildTrace({
      parts: [{ type: 'reasoning', text: '完成分析', state: 'done' }],
      metadata: { stepDurationsMs: { 'reasoning:0': 2_600 } },
    });
    const { container } = render(<AgentTrace trace={trace} durationMs={3_100} />);
    expect(container.querySelector('.agent-trace-complete-mark')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '已处理 3 秒' }));
    expect(screen.getByText('3 秒')).toHaveClass('agent-trace-step-duration');
  });

  it('uses original monochrome semantic glyphs and a flat, counter-free activity log', () => {
    const trace = buildTrace(message([
      { type: 'reasoning', text: '检查执行步骤', state: 'done' }, tool, pendingTool,
      { type: 'tool-renderInteractive', toolCallId: 'terminal', state: 'input-available', input: { title: '演示', prompt: '图示' } },
    ]), true);
    const { container } = render(<AgentTrace trace={trace} isStreaming />);
    expect(container.querySelector('svg[data-agent-icon="loop"]')).toHaveAttribute('width', '18');
    expect(container.querySelector('svg[data-agent-icon="search"]')).toHaveAttribute('width', '18');
    expect(container.querySelector('svg[data-agent-icon="file"]')).toHaveAttribute('width', '18');
    expect(container.querySelector('svg[data-agent-icon="terminal"]')).toHaveAttribute('width', '18');
    expect(container.querySelector('svg.lucide')).toBeNull();
    expect(container.querySelector('[class*="rounded-full"]')).toBeNull();
    expect(screen.queryByText(/个步骤/)).not.toBeInTheDocument();
    for (const status of screen.getAllByText('已完成')) expect(status).toHaveClass('sr-only');
  });

  it('keeps ordered activity steps flat without connector lines or invented tool parentage', () => {
    mountMessageLayoutStyles();
    const trace = buildTrace(message([
      { type: 'reasoning', text: '先分析内容', state: 'done' },
      { type: 'text', text: '接下来查阅教材', state: 'done' },
      tool,
      { type: 'tool-getSection', toolCallId: 'nested-detail', state: 'output-available', input: { path: 'course/1' }, output: { text: '章节结果', found: true } },
    ]));
    const { container } = render(<AgentTrace trace={trace} />);
    fireEvent.click(screen.getByRole('button', { name: '处理完成' }));
    const list = screen.getByRole('list', { name: '按执行顺序排列的步骤' });
    expect(getComputedStyle(list).paddingLeft).toBe('0px');
    expect(Array.from(list.children, (element) => element.getAttribute('data-trace-kind'))).toEqual(['reasoning', 'text', 'tool', 'tool']);
    expect(list.querySelectorAll(':scope > li')).toHaveLength(4);
    expect(list.querySelector('li li')).toBeNull();
    expect(getComputedStyle(list.querySelector('[data-trace-kind="reasoning"]')!).marginLeft).toBe('0px');
    for (const row of list.querySelectorAll(':scope > li')) {
      expect(getComputedStyle(row).marginLeft).toBe('0px');
    }
    const commentary = container.querySelector('.agent-trace-commentary')!;
    expect(getComputedStyle(commentary).paddingLeft).toBe('28px');
    expect(getComputedStyle(commentary).marginTop).toBe('0px');
    fireEvent.click(screen.getByRole('button', { name: /读取笔记章节 已完成/ }));
    const body = container.querySelector('[data-trace-id="tool:nested-detail"] .agent-trace-step-body')!;
    expect(getComputedStyle(body).paddingLeft).toBe('28px');
    const subdetails = body.querySelectorAll('.agent-trace-subdetail');
    expect(subdetails).toHaveLength(2);
    for (const detail of subdetails) expect(getComputedStyle(detail).paddingLeft).toBe('12px');
    expect(screen.getByText('章节结果')).toBeVisible();
  });
});

describe('ChatMessage trace migration', () => {
  it('aligns the user avatar and constrained wrapping bubble right while AI output stays left', () => {
    mountMessageLayoutStyles();
    const longQuestion = `请解释 ${'https://example.test/very-long-path/'.repeat(20)}`;
    const { container } = render(<>
      <ChatMessage message={message([{ type: 'text', text: longQuestion }], { role: 'user' })} onFollowUpSelect={vi.fn()} />
      <ChatMessage message={message([{ type: 'text', text: 'AI 回答' }], { metadata: { durationMs: 2_600 } })} onFollowUpSelect={vi.fn()} />
    </>);
    const userMessage = container.querySelector('[data-message-role="user"]')!;
    expect(userMessage).toHaveAttribute('data-message-id', 'assistant-1');
    const userHeader = userMessage.querySelector('.chat-message-header')!;
    const userContent = userMessage.querySelector('.chat-message-content')!;
    const userBubble = userMessage.querySelector('.chat-bubble-user')!;
    expect(getComputedStyle(userMessage).alignItems).toBe('flex-end');
    expect(getComputedStyle(userHeader).justifyContent).toBe('flex-end');
    expect(userHeader.querySelector('.chat-message-header-left')?.lastElementChild).toHaveAttribute('data-agent-icon', 'user');
    expect(getComputedStyle(userContent).maxWidth).toBe('min(88%, 42rem)');
    expect(getComputedStyle(userContent).alignItems).toBe('flex-end');
    expect(getComputedStyle(userBubble).maxWidth).toBe('100%');
    expect(getComputedStyle(userBubble).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(userBubble).textAlign).toBe('left');
    expect(userBubble).toHaveTextContent(longQuestion);
    const assistant = container.querySelector<HTMLElement>('[data-message-role="assistant"]')!;
    const assistantHeader = assistant.querySelector<HTMLElement>('.chat-message-header')!;
    expect(getComputedStyle(assistant).alignItems).toBe('flex-start');
    expect(getComputedStyle(assistantHeader).justifyContent).toBe('flex-start');
    expect(within(assistantHeader).getByRole('img', { name: 'StudySolo' })).toBeVisible();
    expect(within(assistantHeader).getByRole('status')).toHaveTextContent('已处理 3 秒');
    expect(within(assistantHeader).queryByText('AI 助教')).not.toBeInTheDocument();
    expect(assistantHeader.querySelector('.agent-trace-complete-mark')).toBeNull();
    expect(getComputedStyle(assistant.querySelector('.chat-message-content')!).alignItems).toBe('stretch');
    expect(getComputedStyle(assistant.querySelector('.chat-message-content')!).textAlign).toBe('left');
  });

  it('renders each answer segment once without duplicating them in the trace', () => {
    const msg = message([
      { type: 'step-start' },
      { type: 'reasoning', text: '推理内容', state: 'done' },
      { type: 'text', text: '我先查教材', state: 'done' },
      tool,
      { type: 'step-start' },
      { type: 'text', text: '面向用户的最终回答', state: 'done' },
    ]);
    const { container } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} sessionId="floating-session" repairModelId="chosen-model" />);
    expect(container.querySelector('[data-message-id="assistant-1"]')).toBeInTheDocument();
    expect(screen.getAllByText('面向用户的最终回答')).toHaveLength(1);
    expect(screen.getAllByText('我先查教材')).toHaveLength(1);
    expect(container.querySelector('.chat-message-header .agent-trace-complete-mark')).toBeNull();
    expect(container.querySelector('.agent-trace-complete-mark')).toBeInTheDocument();
    for (const header of screen.getAllByRole('button', { name: '处理过程' })) {
      fireEvent.click(header);
    }
    expect(screen.getAllByText('我先查教材')).toHaveLength(1);
    expect(screen.getAllByText('面向用户的最终回答')).toHaveLength(1);
    const bubbles = container.querySelectorAll('.chat-bubble-assistant');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveTextContent('我先查教材');
    expect(bubbles[0]).not.toHaveTextContent('面向用户的最终回答');
    expect(bubbles[1]).toHaveTextContent('面向用户的最终回答');
    expect(bubbles[1]).not.toHaveTextContent('我先查教材');
    expect(bubbles[0]).toHaveStyle({ background: 'transparent', border: 'none', padding: 0 });
    expect(within(bubbles[0] as HTMLElement).getByTestId('message-content')).toHaveAttribute('data-session-id', 'floating-session');
    expect(within(bubbles[1] as HTMLElement).getByTestId('message-content')).toHaveAttribute('data-repair-model', 'chosen-model');
    fireEvent.contextMenu(bubbles[1]);
    expect(openMessageMenu.mock.calls[0][1]).toBe('我先查教材\n\n面向用户的最终回答');
  });

  it('keeps typed search, artifact, image approval and source cards below the final answer', () => {
    const artifact: ChatMessagePart = { type: 'tool-renderInteractive', toolCallId: 'artifact', state: 'output-available', input: { title: '交互标题', prompt: '交互提示' }, output: { text: '创建交互任务', artifactId: 'art-1', title: '交互标题', prompt: '交互提示', modelId: 'artifact-model', unsupportedReason: '模型能力提示' } };
    const image: ChatMessagePart = { type: 'tool-generateImage', toolCallId: 'image', state: 'output-available', input: { title: '生图标题', prompt: '生图提示' }, output: { text: '待批准', imageGenId: 'img-1', title: '生图标题', prompt: '生图提示', size: '960x1280', count: 2, modelId: 'image-model' } };
    const msg = message([tool,
      { type: 'tool-webSearch', toolCallId: 'web', state: 'output-available', input: { query: '概率' }, output: { text: '网页资料', sources: [{ title: '大学课程资料', url: 'https://example.edu/course', snippet: '公开课程摘要' }], cacheHit: true } },
      { type: 'source-url', sourceId: 'source', title: '补充来源', url: 'https://example.edu/extra' },
      artifact, { ...artifact, toolCallId: 'duplicate-artifact' }, image,
      { type: 'text', text: '这是最终回答', state: 'done' },
    ]);
    const { container } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} isStreaming />);
    const answer = container.querySelector('.chat-bubble-assistant')!;
    for (const card of [screen.getByTestId('note-citation-card'), ...screen.getAllByTestId('web-source-fold'), screen.getByTestId('artifact-card'), screen.getByTestId('image-gen-card')]) {
      expect(answer.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByText(/联网来源 · 1 条/)).toBeVisible();
    expect(screen.queryByText(/参考来源/)).not.toBeInTheDocument();
    expect(screen.queryByText('补充来源')).not.toBeInTheDocument();
    expect(screen.queryByText('公开课程摘要')).not.toBeInTheDocument();
    expect(screen.getByText(/引用笔记 · 1 条/)).toBeVisible();
    expect(screen.queryByText('公式讲解')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('artifact-card')).toHaveLength(1);
    expect(screen.getByTestId('artifact-card')).toHaveAttribute('data-model', 'artifact-model');
    expect(screen.getByTestId('artifact-card')).toHaveAttribute('data-auto-start', 'true');
    expect(screen.getByTestId('artifact-card')).toHaveAttribute('data-unsupported', '模型能力提示');
    expect(screen.getByTestId('image-gen-card')).toHaveAttribute('data-model', 'image-model');
    expect(screen.getByTestId('image-gen-card')).toHaveAttribute('data-count', '2');
    expect(screen.getByTestId('image-gen-card')).toHaveAttribute('data-size', '960x1280');
  });

  it('preserves image search gallery, drag data and attribution after streaming', () => {
    const msg = message([{ type: 'tool-imageSearch', toolCallId: 'images', state: 'output-available', input: { query: '植物' }, output: { text: '找到图片', provider: 'unsplash', sources: [{ title: '一株植物', alt: '植物特写', url: 'https://images.example/plant.jpg', snippet: '', author: '摄影者', authorUrl: 'https://unsplash.com/@author' }] } }, { type: 'text', text: '图片说明' }]);
    const { rerender } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} isStreaming />);
    expect(screen.getByRole('img', { name: '植物特写' })).toBeInTheDocument();
    rerender(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} />);
    const image = screen.getByRole('img', { name: '植物特写' });
    expect(screen.getByRole('link', { name: '摄影者' })).toHaveAttribute('href', 'https://unsplash.com/@author');
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(image.closest('[draggable]')!, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/uri-list', 'https://images.example/plant.jpg');
    expect(dataTransfer.effectAllowed).toBe('copy');
  });

  it('preserves user attachments, text selection and copy context menu', () => {
    const msg = message([{ type: 'text', text: '请解释附件' }], { role: 'user', attachments: [{ type: 'image', mimeType: 'image/png', id: 'blob-id' }] });
    const { container } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} />);
    expect(screen.getByTestId('attachments')).toHaveTextContent('1 张附件');
    expect(screen.getByText('请解释附件')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Agent 处理过程' })).not.toBeInTheDocument();
    fireEvent.contextMenu(container.querySelector('.chat-bubble-user')!);
    expect(openMessageMenu.mock.calls[0][1]).toBe('请解释附件');
  });

  it('shows data-followup questions only when finished and invokes the original callback', async () => {
    const onSelect = vi.fn();
    const msg = message([{ type: 'text', text: '答案' }, { type: 'data-followup', data: { questions: ['为什么？'] } }]);
    const { rerender } = render(<ChatMessage message={msg} onFollowUpSelect={onSelect} isStreaming />);
    expect(screen.queryByTestId('followups')).not.toBeInTheDocument();
    rerender(<ChatMessage message={msg} onFollowUpSelect={onSelect} />);
    expect(screen.queryByTestId('followups')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('followups')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '为什么？' }));
    expect(onSelect).toHaveBeenCalledWith('为什么？');
    rerender(<ChatMessage message={{ ...msg, followUpQuestions: ['另一问题'] }} onFollowUpSelect={onSelect} />);
    expect(screen.queryByRole('button', { name: '为什么？' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '另一问题' })).toHaveLength(1);
  });

  it('uses answer FollowUp tags as data for the sourced follow-up channel', () => {
    const msg = message([{ type: 'text', text: '答案。\n<FollowUp>继续解释|换个例子</FollowUp>' }]);
    render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: '继续解释' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换个例子' })).toBeInTheDocument();
  });

  it('keeps searchNotes citations collapsed without dumping snippets into the chat', () => {
    render(<ChatMessage message={message([tool, { type: 'text', text: '最终回答' }])} onFollowUpSelect={vi.fn()} />);
    expect(screen.queryByText('公式讲解')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /引用笔记 · 1 条/ }));
    expect(screen.getByText('贝叶斯公式')).toBeVisible();
    expect(screen.getByText('probability/1.4')).toBeVisible();
    expect(screen.queryByText('公式讲解')).not.toBeInTheDocument();
  });

  it('does not promote intermediate text to the answer when a call fails without final output', () => {
    const msg = message([{ type: 'text', text: '准备查询' }, { type: 'tool-getSection', toolCallId: 'failed', state: 'output-error', input: {}, errorText: '查询失败' }]);
    const { container } = render(<ChatMessage message={msg} onFollowUpSelect={vi.fn()} />);
    expect(container.querySelector('.chat-bubble-assistant')).toBeNull();
    expect(within(container.querySelector('.chat-message-header')!).getByRole('status')).toHaveTextContent('处理结束，部分步骤未完成');
    fireEvent.click(screen.getByRole('button', { name: '处理过程' }));
    expect(screen.getAllByText('准备查询')).toHaveLength(1);
    expect(screen.getByText('查询失败')).toBeVisible();
  });

  it('keeps historical inline ToolCall markup compatible with the compact tool step', () => {
    render(<ToolCallDashboard toolCalls={[{ id: 'inline', name: 'getCurrentPage', status: 'success', arguments: { section: 'a' }, result: '已读取' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /阅读当前页面 已完成/ }));
    expect(screen.getByText('getCurrentPage()')).toBeVisible();
    expect(screen.getByText('已读取')).toBeVisible();
    expect(screen.getByText(/"section": "a"/)).toBeVisible();
  });
});
