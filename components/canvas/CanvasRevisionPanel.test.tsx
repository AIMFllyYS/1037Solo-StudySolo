import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasRevisionPanel } from './CanvasRevisionPanel';

const settings = {
  selectedModelId: 'mimo-v2.5',
  customApiGroups: [{ id: 'local', name: 'Local', baseUrl: 'http://example.test', apiKey: 'secret', models: [] }],
};

vi.mock('@/lib/stores/settings', () => ({
  useSettings: {
    getState: () => settings,
  },
}));

describe('CanvasRevisionPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits the current canvas block to the unified revision API and accepts the returned block', async () => {
    const nextBlock = { kind: 'molecule' as const, source: 'CCO' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ block: nextBlock, diagnostics: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRevisionAccepted = vi.fn();

    render(
      <CanvasRevisionPanel
        block={{ kind: 'raw-svg', source: '<svg />' }}
        topic="organic chemistry"
        onCancel={vi.fn()}
        onRevisionAccepted={onRevisionAccepted}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'turn this into ethanol' } });
    fireEvent.click(screen.getByRole('button', { name: /update canvas/i }));

    await waitFor(() => expect(onRevisionAccepted).toHaveBeenCalledWith(nextBlock));
    expect(fetchMock).toHaveBeenCalledWith('/api/canvas-revise', expect.objectContaining({ method: 'POST' }));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request).toMatchObject({
      block: { kind: 'raw-svg', source: '<svg />' },
      instruction: 'turn this into ethanol',
      topic: 'organic chemistry',
      modelId: 'mimo-v2.5',
      customApiGroups: [],
    });
  });

  it('shows a strict error and does not accept a block when revision fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Model did not return a complete canvas block.' }),
    }));
    const onRevisionAccepted = vi.fn();

    render(
      <CanvasRevisionPanel
        block={{ kind: 'plot', fn: 'phi(x)', attrs: {} }}
        onCancel={vi.fn()}
        onRevisionAccepted={onRevisionAccepted}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'make it interactive' } });
    fireEvent.click(screen.getByRole('button', { name: /update canvas/i }));

    expect(await screen.findByText(/Model did not return a complete canvas block/i)).toBeInTheDocument();
    expect(onRevisionAccepted).not.toHaveBeenCalled();
  });
});
