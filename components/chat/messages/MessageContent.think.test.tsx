import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageContent } from './MessageContent';

vi.mock('@/components/chat/messages/ChatMessageVisualizations', () => ({
  ChatMessageVisualizations: () => <div data-testid="viz" />,
}));

vi.mock('@/components/chat/trace/ToolCallDashboard', () => ({
  ToolCallDashboard: () => <div data-testid="tool-call-dashboard" />,
}));

vi.mock('@/components/shared/CodeBlock', () => ({
  default: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));

vi.mock('@/components/canvas/index', () => ({
  RawSvgViewer: ({ svg }: { svg: string }) => (
    <div data-testid="raw-svg-viewer" dangerouslySetInnerHTML={{ __html: svg }} />
  ),
}));

vi.mock('@/lib/utils/sanitizeSvg', () => ({
  sanitizeSvg: (svg: string) => svg,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MessageContent pseudo thinking tags', () => {
  it('does not pass think tags to rehype raw rendering', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<MessageContent content="body <think>hidden reasoning</think> answer" />);

    expect(screen.getByText(/body/)).toBeInTheDocument();
    expect(screen.getByText(/answer/)).toBeInTheDocument();
    expect(screen.queryByText(/hidden reasoning/)).not.toBeInTheDocument();
    const warningText = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join('\n');
    expect(warningText).not.toMatch(/unrecognized tag|think/i);
  });
});
