import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoHideChatHeader } from '@/lib/hooks/chat/useAutoHideChatHeader';

describe('useAutoHideChatHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('无用户消息时不启用 auto-hide', () => {
    const { result } = renderHook(() => useAutoHideChatHeader(false, false));
    expect(result.current.autoHideEnabled).toBe(false);
    expect(result.current.headerVisible).toBe(true);
    expect(result.current.headerCollapsed).toBe(false);
  });

  it('有用户消息时默认收起', () => {
    const { result } = renderHook(() => useAutoHideChatHeader(true, false));
    expect(result.current.autoHideEnabled).toBe(true);
    expect(result.current.headerVisible).toBe(false);
    expect(result.current.headerCollapsed).toBe(true);
  });

  it('pointer 进入 header 后展开，离开后延迟收起', () => {
    const { result } = renderHook(() => useAutoHideChatHeader(true, false));

    act(() => result.current.onHeaderEnter());
    expect(result.current.headerVisible).toBe(true);
    expect(result.current.headerCollapsed).toBe(false);

    act(() => result.current.onHeaderLeave());
    expect(result.current.headerVisible).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(result.current.headerVisible).toBe(false);
  });

  it('pinned 时强制展开', () => {
    const { result } = renderHook(() => useAutoHideChatHeader(true, true));
    expect(result.current.headerVisible).toBe(true);
    expect(result.current.headerCollapsed).toBe(false);

    act(() => result.current.onHeaderLeave());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.headerVisible).toBe(true);
  });
});
