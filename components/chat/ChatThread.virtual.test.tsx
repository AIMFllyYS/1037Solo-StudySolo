import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { ChatMessage } from '@/lib/types/chat';

const scrollDriver = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  lastOptions: null as Record<string, unknown> | null,
  interceptScroll: false,
  order: [] as string[],
}));

vi.mock('@tanstack/react-virtual', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-virtual')>('@tanstack/react-virtual');
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
      scrollDriver.lastOptions = options as unknown as Record<string, unknown>;
      const virtualizer = actual.useVirtualizer(options);
      if (scrollDriver.interceptScroll) {
        virtualizer.scrollToIndex = ((index: number, options?: Record<string, unknown>) => {
          scrollDriver.order.push('scroll');
          scrollDriver.scrollToIndex(index, options);
        }) as typeof virtualizer.scrollToIndex;
      }
      return virtualizer;
    },
  };
});

vi.mock('@/lib/hooks/useStickToBottom', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks/useStickToBottom')>('@/lib/hooks/useStickToBottom');
  return {
    ...actual,
    useStickToBottom: (...args: Parameters<typeof actual.useStickToBottom>) => {
      const result = actual.useStickToBottom(...args);
      return {
        ...result,
        setWantStick: (value: boolean) => {
          scrollDriver.order.push(`stick:${value}`);
          result.setWantStick(value);
        },
      };
    },
  };
});

import ChatThread from './ChatThread';

function makeMessages(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [{ type: 'text', text: `Message ${i}` }],
    timestamp: i,
  })) as ChatMessage[];
}

describe('ChatThread virtualizer', () => {
  beforeEach(() => {
    scrollDriver.interceptScroll = false;
    scrollDriver.scrollToIndex.mockClear();
  });

  it('reserves dynamic bottom space for a floating composer without changing message content', () => {
    const { container, rerender } = render(<ChatThread messages={makeMessages(2)} isLoading={false} error={null}
      onClearError={() => {}} onFollowUpClick={() => {}} bottomInset={180} />);
    const viewport = container.querySelector('.chat-messages') as HTMLElement;
    expect(viewport.style.paddingBottom).toBe('180px');
    expect(viewport.style.scrollPaddingBottom).toBe('');
    expect(viewport.style.overflowAnchor).toBe('none');
    rerender(<ChatThread messages={makeMessages(2)} isLoading={false} error={null}
      onClearError={() => {}} onFollowUpClick={() => {}} bottomInset={240} />);
    expect(viewport.style.paddingBottom).toBe('240px');
    expect(viewport.style.scrollPaddingBottom).toBe('');
    expect(container.querySelectorAll('.chat-message').length).toBe(2);
  });

  it('announces transient connection info separately from error messages', () => {
    const clear = vi.fn();
    const { getByRole, queryByText } = render(<ChatThread messages={[]} isLoading={false} error={null}
      onClearError={() => {}} onFollowUpClick={() => {}} info="已切换到备用 API" onClearInfo={clear} />);
    expect(getByRole('status').textContent).toContain('已切换到备用 API');
    expect(getByRole('status').querySelector('[data-agent-icon="info"]')).not.toBeNull();
    expect(queryByText('接口错误')).toBeNull();
    fireEvent.click(getByRole('button', { name: '关闭连接提示' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('uses a motion-safe monochrome loop for history hydration without changing its status text', () => {
    const { container, getByText } = render(<ChatThread messages={[]} isLoading={false} error={null}
      onClearError={() => {}} onFollowUpClick={() => {}} hydrated={false} />);
    expect(getByText('正在加载历史记录...')).toBeTruthy();
    const icon = container.querySelector('[data-agent-icon="loop"]');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('class')).toContain('motion-reduce:animate-none');
    expect(container.querySelector('.lucide')).toBeNull();
  });

  it('honors an account gate before rendering any hydrated transcript rows', () => {
    const { container, getByTestId, queryByText } = render(
      <ChatThread
        messages={makeMessages(2)}
        isLoading={false}
        error={null}
        onClearError={() => {}}
        onFollowUpClick={() => {}}
        hydrated
        accessGateContent={<div data-testid="account-gate">Sign in required</div>}
      />,
    );
    expect(getByTestId('account-gate')).toBeInTheDocument();
    expect(container.querySelectorAll('.chat-message')).toHaveLength(0);
    expect(queryByText('Message 0')).toBeNull();
  });

  it('announces a handled request failure as an alert with an accessible dismiss action', () => {
    const clear = vi.fn();
    const { getByRole } = render(<ChatThread messages={[]} isLoading={false} error="请求连接失败，请重试。"
      onClearError={clear} onFollowUpClick={() => {}} />);
    const alert = getByRole('alert');
    expect(alert).toHaveTextContent('请求连接失败，请重试。');
    expect(alert.querySelector('[data-agent-icon="alert"]')).not.toBeNull();
    fireEvent.click(getByRole('button', { name: '关闭错误提示' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('allocates virtual scroll height for large histories', () => {
    const { container } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={makeMessages(200)}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
        />
      </div>,
    );
    const spacer = container.querySelector('.chat-messages > div[style*="position: relative"]') as HTMLElement | null;
    expect(spacer).toBeTruthy();
    const h = parseInt(spacer!.style.height, 10);
    expect(h).toBeGreaterThan(5000);
  });

  it('keeps rendered message DOM bounded for large histories', () => {
    const { container } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={makeMessages(200)}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
        />
      </div>,
    );

    const renderedMessages = container.querySelectorAll('.chat-message');
    expect(renderedMessages.length).toBeGreaterThan(0);
    expect(renderedMessages.length).toBeLessThan(60);
  });

  it('filters system and unexpected legacy roles before virtualizing', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'visible user' }], timestamp: 1 },
      { id: 's1', role: 'system', parts: [{ type: 'text', text: 'hidden system payload' }], timestamp: 2 },
      // Runtime guard for unmigrated input; tool is no longer a UIMessage role.
      // @ts-expect-error intentionally invalid legacy role
      { id: 't1', role: 'tool', parts: [{ type: 'text', text: 'hidden tool payload' }], timestamp: 2 },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'visible assistant' }], timestamp: 3 },
    ];

    const { queryByText, getByText } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={messages}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
        />
      </div>,
    );

    expect(getByText('visible user')).toBeTruthy();
    expect(getByText('visible assistant')).toBeTruthy();
    expect(queryByText('hidden tool payload')).toBeNull();
    expect(queryByText('hidden system payload')).toBeNull();
  });

  it('shows the thread loading line only before the assistant row exists', () => {
    const userOnly: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'visible user' }], timestamp: 1 },
    ];
    const withAssistant: ChatMessage[] = [
      ...userOnly,
      { id: 'a1', role: 'assistant', parts: [], timestamp: 2 },
    ];
    const { getByText, getByTestId, queryByTestId, rerender } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={userOnly}
          isLoading
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
        />
      </div>,
    );
    expect(getByTestId('chat-thread-loading')).toHaveTextContent('AI 正在思考中...');
    rerender(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={withAssistant}
          isLoading
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
        />
      </div>,
    );
    expect(queryByTestId('chat-thread-loading')).toBeNull();
    expect(getByText('正在思考…')).toBeTruthy();
  });

  it('pins to bottom when composer inset grows while sticking', () => {
    const { container, rerender } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={makeMessages(4)}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
          bottomInset={80}
        />
      </div>,
    );
    const viewport = container.querySelector('.chat-messages') as HTMLElement;
    let scrollTop = 50;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Number(value);
      },
    });
    rerender(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={makeMessages(4)}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
          bottomInset={180}
        />
      </div>,
    );
    expect(scrollTop).toBe(200);
    expect(viewport.style.paddingBottom).toBe('180px');
  });

  it('assigns the external scrollContainerRef to the real scroll viewport', () => {
    const scrollRef = React.createRef<HTMLDivElement>();

    render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread
          messages={makeMessages(5)}
          isLoading={false}
          error={null}
          onClearError={() => {}}
          onFollowUpClick={() => {}}
          hydrated
          scrollContainerRef={scrollRef}
        />
      </div>,
    );

    expect(scrollRef.current).toBeTruthy();
    expect(scrollRef.current?.classList.contains('chat-messages')).toBe(true);
  });
});

describe('ChatThread scroll driver', () => {
  const base = {
    error: null as string | null,
    onClearError: () => {},
    onFollowUpClick: () => {},
    hydrated: true,
  };

  beforeEach(() => {
    scrollDriver.scrollToIndex.mockClear();
    scrollDriver.lastOptions = null;
    scrollDriver.interceptScroll = true;
  });

  it('does not register a streaming scrollToIndex effect', () => {
    const { rerender } = render(
      <ChatThread messages={[makeMessages(2)[0], { ...makeMessages(2)[1], parts: [{ type: 'text', text: 'a' }] }]} isLoading {...base} />,
    );
    expect(scrollDriver.scrollToIndex).not.toHaveBeenCalled();
    rerender(<ChatThread messages={[makeMessages(2)[0], { ...makeMessages(2)[1], parts: [{ type: 'text', text: 'ab' }] }]} isLoading {...base} />);
    rerender(<ChatThread messages={[makeMessages(2)[0], { ...makeMessages(2)[1], parts: [{ type: 'text', text: 'abc' }] }]} isLoading {...base} />);
    rerender(<ChatThread messages={[makeMessages(2)[0], { ...makeMessages(2)[1], parts: [{ type: 'text', text: 'abcd' }] }]} isLoading {...base} />);
    expect(scrollDriver.scrollToIndex).not.toHaveBeenCalled();
  });

  it('aligns to bottom exactly once when streaming ends', () => {
    const messages = makeMessages(2);
    const { rerender } = render(<ChatThread messages={messages} isLoading {...base} />);
    expect(scrollDriver.scrollToIndex).not.toHaveBeenCalled();
    rerender(<ChatThread messages={messages} isLoading={false} {...base} />);
    expect(scrollDriver.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(scrollDriver.scrollToIndex.mock.calls[0][1]).not.toEqual(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('does not pass scrollPaddingEnd to the virtualizer', () => {
    render(<ChatThread messages={makeMessages(2)} isLoading={false} bottomInset={180} {...base} />);
    expect(scrollDriver.lastOptions).not.toHaveProperty('scrollPaddingEnd');
  });

  it('keeps the compact 72px estimate for the first streamed assistant row', () => {
    const messages = [
      makeMessages(2)[0],
      { ...makeMessages(2)[1], parts: [] },
    ];
    render(<ChatThread messages={messages} isLoading {...base} />);
    const estimate = scrollDriver.lastOptions?.estimateSize as (index: number) => number;
    expect(estimate(1)).toBe(72);
  });
});

describe('ChatThread message dots', () => {
  const base = {
    error: null as string | null,
    onClearError: () => {},
    onFollowUpClick: () => {},
    hydrated: true,
  };

  beforeEach(() => {
    scrollDriver.interceptScroll = true;
    scrollDriver.scrollToIndex.mockClear();
    scrollDriver.order = [];
  });

  it('anchors user messages with data-message-id and a matching dot', () => {
    const { container, getByTestId } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread messages={makeMessages(4)} isLoading={false} {...base} />
      </div>,
    );
    expect(container.querySelector('[data-message-id="m-0"]')).toBeTruthy();
    expect(getByTestId('chat-message-dots').querySelectorAll('[data-testid="chat-message-dot"]')).toHaveLength(2);
  });

  it('clears stick then scrolls the virtualizer to the user index', () => {
    const { getAllByTestId } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread messages={makeMessages(6)} isLoading={false} {...base} />
      </div>,
    );
    scrollDriver.order = [];
    fireEvent.click(getAllByTestId('chat-message-dot')[0]);
    expect(scrollDriver.order[0]).toBe('stick:false');
    expect(scrollDriver.order[1]).toBe('scroll');
    expect(scrollDriver.scrollToIndex).toHaveBeenCalledWith(0, { align: 'start' });
  });

  it('collapses a long user-message rail instead of drawing every turn', () => {
    const { getByTestId } = render(
      <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
        <ChatThread messages={makeMessages(40)} isLoading={false} {...base} />
      </div>,
    );
    const rail = getByTestId('chat-message-dots');
    expect(rail.querySelectorAll('[data-testid="chat-message-dot"]').length).toBeLessThan(20);
    expect(rail.querySelector('.chat-message-dots-range')).toBeTruthy();
  });
});

describe('ChatThread message dots measured jump', () => {
  const base = {
    error: null as string | null,
    onClearError: () => {},
    onFollowUpClick: () => {},
    hydrated: true,
  };
  const ROW_PX = 220;
  const VIEW_PX = 480;
  const TARGET_INDEX = 10;

  beforeEach(() => {
    scrollDriver.interceptScroll = false;
    scrollDriver.scrollToIndex.mockClear();
  });

  it('lands a middle-turn dot on the measured row when only the tail is mounted', async () => {
    const proto = HTMLElement.prototype;
    const prevOffset = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
    const prevClient = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    const prevScrollHeight = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const prevScrollTo = proto.scrollTo;

    const rowHeight = (el: HTMLElement) => {
      if (el.classList?.contains('chat-messages')) return VIEW_PX;
      if (el.hasAttribute('data-index')) return ROW_PX;
      return 0;
    };

    Object.defineProperty(proto, 'offsetHeight', {
      configurable: true,
      get() { return rowHeight(this as HTMLElement); },
    });
    Object.defineProperty(proto, 'clientHeight', {
      configurable: true,
      get() { return rowHeight(this as HTMLElement); },
    });
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get() {
        const el = this as HTMLElement;
        if (el.classList?.contains('chat-messages')) {
          const spacer = el.querySelector(':scope > div') as HTMLElement | null;
          const parsed = spacer ? parseInt(spacer.style.height, 10) : 0;
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return rowHeight(el);
      },
    });
    proto.scrollTo = function (arg?: ScrollToOptions | number, y?: number) {
      if (typeof arg === 'number') {
        this.scrollLeft = arg;
        if (typeof y === 'number') this.scrollTop = y;
      } else if (arg && typeof arg === 'object') {
        if (arg.left != null) this.scrollLeft = arg.left;
        if (arg.top != null) this.scrollTop = arg.top;
      }
      this.dispatchEvent(new Event('scroll'));
    };

    const restore = () => {
      if (prevOffset) Object.defineProperty(proto, 'offsetHeight', prevOffset);
      else delete (proto as { offsetHeight?: number }).offsetHeight;
      if (prevClient) Object.defineProperty(proto, 'clientHeight', prevClient);
      else delete (proto as { clientHeight?: number }).clientHeight;
      if (prevScrollHeight) Object.defineProperty(proto, 'scrollHeight', prevScrollHeight);
      else delete (proto as { scrollHeight?: number }).scrollHeight;
      proto.scrollTo = prevScrollTo;
    };

    try {
      const { container, getAllByTestId } = render(
        <div style={{ height: VIEW_PX, display: 'flex', flexDirection: 'column' }}>
          <ChatThread messages={makeMessages(24)} isLoading={false} {...base} />
        </div>,
      );
      const viewport = container.querySelector('.chat-messages') as HTMLElement;
      expect(viewport).toBeTruthy();

      await act(async () => {
        for (let i = 0; i < 4; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

      const spacer = viewport.querySelector(':scope > div') as HTMLElement;
      const total = parseInt(spacer.style.height, 10);
      expect(total).toBeGreaterThan(VIEW_PX);
      await act(async () => {
        viewport.scrollTop = total - VIEW_PX;
        fireEvent.scroll(viewport);
        for (let i = 0; i < 6; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

      expect(container.querySelector('[data-message-id="m-23"]')).toBeTruthy();
      expect(container.querySelector(`[data-message-id="m-${TARGET_INDEX}"]`)).toBeNull();

      const targetDot = getAllByTestId('chat-message-dot').find(
        (dot) => dot.getAttribute('data-message-index') === String(TARGET_INDEX),
      );
      expect(targetDot).toBeTruthy();
      fireEvent.click(targetDot!);

      await act(async () => {
        for (let i = 0; i < 10; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

      const target = container.querySelector(`[data-message-id="m-${TARGET_INDEX}"]`) as HTMLElement | null;
      expect(target).toBeTruthy();
      const row = target!.closest('[data-index]') as HTMLElement;
      expect(row).toBeTruthy();
      const start = Number(/translateY\(([-\d.]+)px\)/.exec(row.style.transform)?.[1]);
      expect(Number.isFinite(start)).toBe(true);
      expect(start).toBeGreaterThan(TARGET_INDEX * 72 + 40);
      expect(Math.abs(start - TARGET_INDEX * ROW_PX)).toBeLessThan(ROW_PX / 2);
      expect(viewport.scrollTop).toBeGreaterThanOrEqual(start - 2);
      expect(viewport.scrollTop).toBeLessThan(start + VIEW_PX);
      expect(Math.abs(viewport.scrollTop - start)).toBeLessThan(8);
    } finally {
      restore();
    }
  });
});
