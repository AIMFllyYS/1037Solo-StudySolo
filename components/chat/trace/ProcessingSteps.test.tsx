import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ProcessingSteps from './ProcessingSteps';
import type { ChatMessage } from '@/lib/types/chat';
import type { AgentTraceProps } from './AgentTrace';

vi.mock('@/components/chat/trace/AgentTrace', () => ({
  AgentTrace: ({ trace, isStreaming, durationMs }: AgentTraceProps) => trace.steps.length
    ? <div data-testid="trace" data-streaming={String(isStreaming)} data-duration={durationMs}>{trace.steps.map((step) => step.kind).join(',')}</div>
    : null,
}));

afterEach(cleanup);
const msg = (parts: ChatMessage['parts']): ChatMessage => ({ id: '1', role: 'assistant', timestamp: 1, parts });

describe('ProcessingSteps compatibility wrapper', () => {
  it('leaves a plain answer without a processing wrapper', () => {
    const { container } = render(<ProcessingSteps msg={msg([{ type: 'text', text: '正文' }])} />);
    expect(container.firstChild).toBeNull();
  });

  it('projects typed ordered parts without rebuilding the old grouped dashboard', () => {
    render(<ProcessingSteps msg={msg([
      { type: 'reasoning', text: '思考过程', state: 'done' },
      { type: 'text', text: '准备读取' },
      { type: 'tool-getCurrentPage', toolCallId: 't1', state: 'input-available', input: {} },
    ])} streaming />);
    expect(screen.getByTestId('trace')).toHaveTextContent('reasoning,text,tool');
    expect(screen.getByTestId('trace')).toHaveAttribute('data-streaming', 'true');
  });

  it('forwards persisted duration for the collapsed summary', () => {
    render(<ProcessingSteps msg={{ ...msg([{ type: 'reasoning', text: '完成', state: 'done' }]), metadata: { durationMs: 4500 } }} />);
    expect(screen.getByTestId('trace')).toHaveAttribute('data-duration', '4500');
    expect(screen.getByTestId('trace')).toHaveAttribute('data-streaming', 'false');
  });
});
