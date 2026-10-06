import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentTrace } from './AgentTrace';
import { ToolResultCards } from './toolCards/ToolResultCards';
import { buildTrace } from '@/lib/chat/buildTrace';
import type { ChatMessage, ChatMessagePart } from '@/lib/types/chat';
import type { ConnectorResult } from '@/lib/connectors/registry';
import type { SandboxOutput } from '@/lib/sandbox/types';

function Harness({ part }: { part: ChatMessagePart }) {
  const [message, setMessage] = useState<ChatMessage>({ id: 'fixture-message', role: 'assistant', timestamp: 1, parts: [part] });
  return <><AgentTrace trace={buildTrace(message)} toolContext={{ message, isStreaming: false, ctx: { isStreaming: false }, onToolOutputChange: (id, output) => setMessage(previous => ({ ...previous, parts: previous.parts.map(item => 'toolCallId' in item && item.toolCallId === id ? { ...item, output } as ChatMessagePart : item) })) }}/><ToolResultCards message={message} /></>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps a connector proposal, cancellation result and sources in the same native step', async () => {
  const output: ConnectorResult = { provider: 'todoist', operation: 'add_task', text: 'candidate', action: { id: 'fixture-action', provider: 'todoist', operation: 'add_task', status: 'proposed', arguments: { content: 'UI-DIALOGUE fixture' }, expiresAt: Date.now() + 60000 } };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(output.action)));
  const { container } = render(<Harness part={{ type: 'tool-learningConnectors', toolCallId: 'fixture-tool', input: { action: 'propose', provider: 'todoist', operation: 'add_task' }, state: 'output-available', output }}/>);
  expect(container.querySelectorAll('section[aria-label="学习服务结果"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: /等待/ }));
  fireEvent.click(screen.getByRole('button', { name: /学习服务.*等待/ }));
  await screen.findByRole('button', { name: '确认执行' });
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...output.action, status: 'cancelled' }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(container.querySelector('[data-trace-status="cancelled"]')).toBeTruthy());
  expect(container.querySelectorAll('section[aria-label="学习服务结果"]')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '确认执行' })).toBeNull();
  expect(container.querySelector('.agent-trace-complete-mark')).toBeNull();
});

it('polls command logs into the original native step and preserves failed exit state', async () => {
  window.history.replaceState(null, '', '/agent');
  const output: SandboxOutput = { conversationId: 'fixture-conversation', sessionId: 'fixture-session', commandId: 'fixture-command', state: 'running', text: 'running' };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ state: 'completed', stdout: 'public fixture log', stderr: 'command failed', exitCode: 2, text: 'finished' })));
  const { container } = render(<Harness part={{ type: 'tool-cloudSandbox', toolCallId: 'fixture-tool', input: { action: 'exec', command: 'fixture command' }, state: 'output-available', output }}/>);
  expect(container.querySelector('[data-testid="cloud-sandbox-detail"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /正在处理/ }));
  fireEvent.click(screen.getByRole('button', { name: /云端命令/ }));
  fireEvent.click(screen.getByRole('button', { name: '查看进度' }));
  await screen.findByText('public fixture log');
  expect(container.querySelector('[data-trace-status="error"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-testid="cloud-sandbox-detail"]')).toHaveLength(1);
  expect(container.querySelector('.agent-trace-complete-mark')).toBeNull();
});
