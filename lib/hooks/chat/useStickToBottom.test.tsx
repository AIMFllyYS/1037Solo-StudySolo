import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { fireEvent } from '@testing-library/react';
import { useStickToBottom } from '@/lib/hooks/chat/useStickToBottom';

describe('useStickToBottom', () => {
  const rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    rafQueue.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue[id - 1] = () => {};
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bindPlainEl(el: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
    const ref = createRef<HTMLElement | null>();
    Object.defineProperty(ref, 'current', { value: el, writable: true });
    return ref;
  }

  it('keeps scrollTop monotonically increasing across rAF ticks and lands on max scroll', () => {
    const el = {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    };
    const ref = bindPlainEl(el);

    renderHook(() => useStickToBottom(ref, true));

    const tops: number[] = [];
    act(() => {
      for (let i = 0; i < 5; i++) {
        el.scrollHeight = 200 + i * 40;
        const cb = rafQueue.shift();
        cb?.(i * 16);
        tops.push(el.scrollTop);
      }
    });

    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]);
    }
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
    expect(tops[tops.length - 1]).toBe(el.scrollHeight - el.clientHeight);
  });

  it('keeps pinning to the new max scroll when content shrinks', () => {
    const el = {
      scrollHeight: 500,
      clientHeight: 200,
      scrollTop: 300,
    };
    const ref = bindPlainEl(el);
    const { result } = renderHook(() => useStickToBottom(ref, true));

    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(el.scrollTop).toBe(300);

    el.scrollHeight = 220;
    el.scrollTop = 0;
    act(() => {
      result.current.onScroll();
      rafQueue.shift()?.(16);
    });
    expect(el.scrollTop).toBe(20);
    expect(result.current.wantStickRef.current).toBe(true);
    expect(result.current.isAtBottom).toBe(true);
  });

  it('does not treat a programmatic scrollTop drop as leaving the bottom', () => {
    const el = {
      scrollHeight: 800,
      clientHeight: 200,
      scrollTop: 600,
    };
    const ref = bindPlainEl(el);
    const { result } = renderHook(() => useStickToBottom(ref, true));

    el.scrollTop = 0;
    act(() => {
      result.current.onScroll();
      rafQueue.shift()?.(0);
    });

    expect(result.current.wantStickRef.current).toBe(true);
    expect(el.scrollTop).toBe(600);
  });

  it('stops following after a user wheel-up gesture', () => {
    const host = document.createElement('div');
    let scrollTop = 400;
    Object.defineProperties(host, {
      scrollHeight: { configurable: true, get: () => 600 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    document.body.appendChild(host);
    const ref = createRef<HTMLElement | null>();
    Object.defineProperty(ref, 'current', { value: host, writable: true });

    const { result } = renderHook(() => useStickToBottom(ref, true));

    act(() => {
      fireEvent.wheel(host, { deltaY: -40 });
    });
    expect(result.current.wantStickRef.current).toBe(false);

    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(scrollTop).toBe(400);

    document.body.removeChild(host);
  });
});
