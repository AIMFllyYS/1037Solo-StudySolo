import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStreamingText } from './useStreamingText';
afterEach(() => vi.useRealTimers());
it('bounds long text updates, flushes exact content on stop, and resets for replacement text', () => {
  vi.useFakeTimers();
  const base = 'x'.repeat(9000);
  const { result, rerender } = renderHook(({ text, active }) => useStreamingText(text, active), { initialProps: { text: base, active: true } });
  rerender({ text: base + 'tail', active: true });
  expect(result.current).toBe(base);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toBe(base + 'tail');
  rerender({ text: base + 'tail stop', active: false });
  expect(result.current).toBe(base + 'tail stop');
  rerender({ text: 'new', active: true });
  expect(result.current).toBe('new');
});

it('coalesces short token deltas to a frame and never loses the final text', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ text, active }) => useStreamingText(text, active), { initialProps: { text: 'a', active: true } });
  for (let index = 0; index < 100; index++) rerender({ text: 'a' + 'x'.repeat(index + 1), active: true });
  expect(result.current).toBe('a');
  act(() => vi.advanceTimersByTime(16));
  expect(result.current).toBe('a' + 'x'.repeat(100));
  rerender({ text: 'a' + 'x'.repeat(100) + ' done', active: false });
  expect(result.current).toBe('a' + 'x'.repeat(100) + ' done');
});
