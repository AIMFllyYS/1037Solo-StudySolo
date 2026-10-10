import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArtifactCard from './ArtifactCard';
import { useArtifacts } from '@/lib/stores/assets/artifacts';
import { useWindowManager } from '@/lib/stores/workspace/windowManager';

vi.mock('@/components/chat/messages/MessageContent', () => ({
  MessageContent: ({ content }: { content: string }) => <div data-testid="message-content">{content}</div>,
}));

describe('ArtifactCard', () => {
  beforeEach(() => {
    useArtifacts.setState({ order: [], byId: {}, viewerId: null, _hasHydrated: true });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('collapses 生成依据 by default and streams a thinking block before HTML', async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    );

    render(<ArtifactCard artifactId="art_1" title="演示" prompt="概率分布滑块" autoStart />);

    expect(await screen.findByTestId('artifact-thinking-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('artifact-thinking-body')).toHaveTextContent('正在思考生成方案');
    expect(screen.getByTestId('artifact-prompt-toggle').querySelector('[data-agent-icon="quote"]')).not.toBeNull();
    expect(screen.getByTestId('artifact-thinking-toggle').querySelector('[data-agent-icon="loop"]')).not.toBeNull();
    expect(screen.queryByTestId('artifact-prompt-body')).toBeNull();

    await act(async () => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'artifact', id: 'art_1', status: 'start', title: '演示' })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'artifact', id: 'art_1', status: 'reasoning', delta: '先画坐标轴' })}\n\n`));
      // SSE delta 走 60ms 尾随节流：等定时器自然排空再断言。
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(await screen.findByTestId('artifact-thinking-body')).toHaveTextContent('先画坐标轴');

    const html = '<!DOCTYPE html><html><body>ok</body></html>';
    await act(async () => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'artifact', id: 'art_1', status: 'delta', delta: html })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'artifact', id: 'art_1', status: 'done', html })}\n\n`));
      controller.close();
    });

    await waitFor(() => {
      expect(screen.getByText('交互演示已就绪：演示')).toBeTruthy();
      expect(screen.getByTestId('artifact-open-demo')).toHaveTextContent('打开演示');
    });
    expect(useArtifacts.getState().byId.art_1?.html).toBe(html);
    expect(useArtifacts.getState().byId.art_1?.reasoning).toBe('先画坐标轴');
    fireEvent.click(screen.getByTestId('artifact-prompt-toggle'));
    expect(screen.getByTestId('artifact-prompt-body')).toHaveTextContent('概率分布滑块');
  });

  it('keeps 打开演示 and 思考过程 after remount (page refresh)', async () => {
    useArtifacts.setState({
      order: ['art_1'],
      byId: {
        art_1: {
          id: 'art_1',
          title: '细胞结构探索器',
          html: '<html><body>ok</body></html>',
          status: 'done',
          reasoning: '先画细胞膜，再标细胞器',
        },
      },
      viewerId: null,
      _hasHydrated: true,
    });

    render(<ArtifactCard artifactId="art_1" title="细胞结构探索器" prompt="画一个细胞" />);

    expect(screen.getByText('交互演示已就绪：细胞结构探索器')).toBeTruthy();
    const openDemo = screen.getByTestId('artifact-open-demo');
    expect(openDemo).toHaveTextContent('打开演示');
    expect(screen.getByTestId('artifact-card-header').contains(openDemo)).toBe(true);
    fireEvent.click(openDemo);
    expect(useWindowManager.getState().windows.some((w) => w.type === 'artifact-viewer')).toBe(true);
    expect(screen.getByTestId('artifact-thinking-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('artifact-thinking-toggle'));
    expect(screen.getByTestId('artifact-thinking-body')).toHaveTextContent('先画细胞膜，再标细胞器');
  });
});
