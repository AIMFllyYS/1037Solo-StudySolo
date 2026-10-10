import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import ChatSettings from '../ChatSettings';
import { useSettings } from '@/lib/stores/settings';

describe('ChatSettings custom model thinking levels', () => {
  beforeEach(() => {
    useSettings.setState({
      customApiGroups: [
        {
          id: 'or',
          name: 'OpenRouter',
          baseUrl: 'https://openrouter.example/v1',
          apiKey: 'sk-test',
          models: [],
        },
      ],
    });
  });
  afterEach(() => cleanup());

  it('lets each custom model pick thinking intensity levels and persists them', async () => {
    const { getByTestId, getByPlaceholderText, getAllByPlaceholderText, queryByTestId } = render(<ChatSettings />);
    await act(async () => {
      getByTestId('chat-settings-nav-models').click();
    });
    await act(async () => {
      getByTestId('custom-api-group-toggle-or').click();
    });
    await act(async () => {
      getByTestId('custom-api-add-model').click();
    });

    fireEvent.change(getByPlaceholderText('gpt-4o-mini'), { target: { value: 'gpt-think' } });
    const prices = getAllByPlaceholderText('0');
    fireEvent.change(prices[0], { target: { value: '1' } });
    fireEvent.change(prices[1], { target: { value: '2' } });

    expect(queryByTestId('custom-model-thinking-levels')).toBeNull();
    await act(async () => {
      getByTestId('custom-model-thinking-toggle').click();
    });
    expect(getByTestId('custom-model-thinking-levels')).toBeTruthy();

    await act(async () => {
      getByTestId('custom-model-thinking-level-medium').click();
    });
    await act(async () => {
      getByTestId('custom-model-thinking-required').click();
    });
    await act(async () => {
      getByTestId('custom-model-form-save').click();
    });

    const saved = useSettings.getState().customApiGroups[0].models[0];
    expect(saved.id).toBe('gpt-think');
    expect(saved.thinking).toBe(true);
    expect(saved.thinkingRequired).toBe(true);
    expect(saved.thinkingLevels).toEqual(['low', 'high', 'max']);
  });
});
