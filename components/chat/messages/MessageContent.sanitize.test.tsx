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

describe('MessageContent HTML sanitization', () => {
  it('does not render script elements from markdown HTML', () => {
    const { container } = render(
      <MessageContent content="safe <script>ignored</script> text" />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toMatch(/safe/);
    expect(container.textContent).toMatch(/text/);
    expect(container.textContent).not.toMatch(/ignored/);
  });

  it('strips event handler attributes from raw HTML', () => {
    const { container } = render(
      <MessageContent content={'<p id="probe" onclick="1" onerror="1" onmouseover="1">safe</p>'} />,
    );

    const probe = container.querySelector('#probe');
    expect(probe).not.toBeNull();
    expect(probe?.getAttribute('onclick')).toBeNull();
    expect(probe?.getAttribute('onerror')).toBeNull();
    expect(probe?.getAttribute('onmouseover')).toBeNull();
    expect(probe?.textContent).toMatch(/safe/);
  });

  it('still renders definition directives', () => {
    render(<MessageContent content={':::definition{label=Term}\nhello body\n:::'} />);

    expect(screen.getByText(/定义/)).toBeInTheDocument();
    expect(screen.getByText(/hello body/)).toBeInTheDocument();
  });

  it('still renders KaTeX', () => {
    const { container } = render(<MessageContent content={'$E=mc^2$'} />);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('still renders ::figure', () => {
    render(<MessageContent content={'::figure{src=/x.png alt=demo caption=cap}'} />);
    expect(screen.getByAltText('demo')).toBeInTheDocument();
    expect(screen.getByText('cap')).toBeInTheDocument();
  });
});
