import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import ThinkingMenuButton from './ThinkingMenu';

describe('ThinkingMenuButton', () => {
  it('renders "深度思考" when disabled and no effort suffix', () => {
    const { getByTestId } = render(
      <ThinkingMenuButton
        enabled={false}
        effort="medium"
        onChange={vi.fn()}
        supported
      />,
    );
    const btn = getByTestId('thinking-menu-button');
    expect(btn.getAttribute('data-enabled')).toBe('0');
    expect(btn.textContent).toContain('深度思考');
    expect(btn.textContent).not.toContain('·');
  });

  it('renders "深度思考·High" when enabled with high effort', () => {
    const { getByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="high"
        onChange={vi.fn()}
        supported
      />,
    );
    const btn = getByTestId('thinking-menu-button');
    expect(btn.getAttribute('data-enabled')).toBe('1');
    expect(btn.getAttribute('data-effort')).toBe('high');
    expect(btn.textContent).toContain('深度思考·High');
    expect(btn.querySelector('[data-agent-icon="loop"]')).not.toBeNull();
    expect(btn.querySelector('[data-agent-icon="loop"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(btn).toHaveClass('chat-input-toggle-thinking-active');
    expect(btn.querySelector('.lucide')).toBeNull();
  });

  it('opens menu on click and shows Off + 4 effort options', async () => {
    const { getByTestId, queryByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="medium"
        onChange={vi.fn()}
        supported
      />,
    );
    await act(async () => {
      getByTestId('thinking-menu-button').click();
    });
    expect(queryByTestId('thinking-menu-option-off')).not.toBeNull();
    expect(queryByTestId('thinking-menu-option-low')).not.toBeNull();
    expect(queryByTestId('thinking-menu-option-medium')).not.toBeNull();
    expect(queryByTestId('thinking-menu-option-high')).not.toBeNull();
    expect(queryByTestId('thinking-menu-option-max')).not.toBeNull();
    expect(getByTestId('thinking-menu-option-off')).toHaveAttribute('aria-checked', 'false');
    expect(getByTestId('thinking-menu-option-medium').querySelector('[data-agent-icon="check"]')).not.toBeNull();
  });

  it('hides Off and unsupported levels when allowOff is false and levels are limited', async () => {
    const { getByTestId, queryByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="high"
        onChange={vi.fn()}
        supported
        allowOff={false}
        levels={['low', 'high', 'max']}
      />,
    );
    await act(async () => {
      getByTestId('thinking-menu-button').click();
    });
    expect(queryByTestId('thinking-menu-option-off')).toBeNull();
    expect(queryByTestId('thinking-menu-option-medium')).toBeNull();
    expect(queryByTestId('thinking-menu-option-high')).not.toBeNull();
  });

  it('picking a level enables thinking and closes menu', async () => {
    const onChange = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <ThinkingMenuButton
        enabled={false}
        effort="medium"
        onChange={onChange}
        supported
      />,
    );
    await act(async () => {
      getByTestId('thinking-menu-button').click();
    });
    await act(async () => {
      getByTestId('thinking-menu-option-high').click();
    });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, effort: 'high' });
    expect(queryByTestId('thinking-menu-option-high')).toBeNull();
  });

  it('picking Off disables thinking without changing effort', async () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="max"
        onChange={onChange}
        supported
      />,
    );
    await act(async () => {
      getByTestId('thinking-menu-button').click();
    });
    await act(async () => {
      getByTestId('thinking-menu-option-off').click();
    });
    expect(onChange).toHaveBeenCalledWith({ enabled: false, effort: 'max' });
  });

  it('is disabled when supported is false', () => {
    const { getByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="medium"
        onChange={vi.fn()}
        supported={false}
      />,
    );
    const btn = getByTestId('thinking-menu-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('data-enabled')).toBe('0');
  });

  it('is disabled when disabled prop is true', () => {
    const { getByTestId } = render(
      <ThinkingMenuButton
        enabled
        effort="medium"
        onChange={vi.fn()}
        supported
        disabled
      />,
    );
    const btn = getByTestId('thinking-menu-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
