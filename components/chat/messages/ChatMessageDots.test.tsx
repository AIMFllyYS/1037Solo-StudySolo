import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatMessageDots, {
  USER_DOT_LIMIT,
  activeUserDotIndex,
  visibleUserDots,
  type UserDotEntry,
} from './ChatMessageDots';

function entries(count: number): UserDotEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i * 2,
    id: `u-${i}`,
    preview: `提问 ${i + 1}`,
  }));
}

describe('visibleUserDots', () => {
  it('keeps every user turn when the rail is short', () => {
    const items = visibleUserDots(entries(4), 2);
    expect(items.map((item) => item.type)).toEqual(['dot', 'dot', 'dot', 'dot']);
    expect(items).toHaveLength(4);
  });

  it('collapses overflow turns into hoverable ranges', () => {
    const items = visibleUserDots(entries(20), 0);
    expect(items.length).toBeLessThan(20);
    expect(items[0]).toMatchObject({ type: 'dot', turn: 1 });
    expect(items[items.length - 1]).toMatchObject({ type: 'dot', turn: 20 });
    expect(items.some((item) => item.type === 'range')).toBe(true);
    const dots = items.filter((item) => item.type === 'dot');
    expect(dots.length).toBeLessThanOrEqual(USER_DOT_LIMIT);
  });
});

describe('activeUserDotIndex', () => {
  it('pins to the latest user message at or above the first visible row', () => {
    const list = entries(4);
    expect(activeUserDotIndex(list, 0)).toBe(0);
    expect(activeUserDotIndex(list, 3)).toBe(2);
    expect(activeUserDotIndex(list, 50)).toBe(6);
  });
});

describe('ChatMessageDots', () => {
  it('jumps to the chosen user index and marks the current turn', () => {
    const onJump = vi.fn();
    render(<ChatMessageDots entries={entries(3)} firstVisibleIndex={2} onJump={onJump} />);
    const dots = screen.getAllByTestId('chat-message-dot');
    expect(dots).toHaveLength(3);
    expect(dots[1]).toHaveAttribute('aria-current', 'true');
    expect(dots[1]).toHaveTextContent('第 2 次提问 · 当前');
    expect(dots[1]).toHaveTextContent('提问 2');
    fireEvent.click(dots[0]);
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('expands a collapsed range on hover', () => {
    render(<ChatMessageDots entries={entries(20)} firstVisibleIndex={0} onJump={vi.fn()} />);
    expect(screen.getAllByTestId('chat-message-dot').length).toBeLessThan(20);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /次提问$/ }).closest('.chat-message-dots-cluster')
      ?? screen.getByRole('button', { name: /–/ }).parentElement!);
    expect(screen.getAllByTestId('chat-message-dot').length).toBeGreaterThan(USER_DOT_LIMIT - 4);
  });
});
