import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatHistoryOverlay from './ChatHistoryOverlay';

const historyState = {
  sessionsMeta: [
    { id: 'main-1', title: '细胞生物学复习', kind: 'main', updatedAt: 1_700_000_000_000, messageCount: 8 },
    { id: 'float-1', title: '解释线粒体', kind: 'floating', updatedAt: 1_700_000_100_000, messageCount: 3 },
    { id: 'note-1', title: '被覆上皮', kind: 'note', updatedAt: 1_700_000_200_000, messageCount: 2 },
  ],
  activeSessionId: 'main-1',
  deleteSession: vi.fn(),
};

vi.mock('@/lib/stores/chat/chatHistory', () => ({
  useChatHistory: Object.assign(
    (selector: (state: typeof historyState) => unknown) => selector(historyState),
    { getState: () => historyState },
  ),
}));
vi.mock('@/lib/stores/chat/floatingChats', () => ({
  useFloatingChats: { getState: () => ({ windows: [], closeWindow: vi.fn() }) },
}));
vi.mock('@/lib/stores/assets/imageGen', () => ({
  useImageGen: (selector: (state: Record<string, unknown>) => unknown) => selector({
    sessions: {}, bringToFront: vi.fn(), removeSession: vi.fn(),
  }),
}));
vi.mock('@/lib/keyboard/useOverlayRegistration', () => ({ useOverlayRegistration: vi.fn() }));

afterEach(cleanup);

describe('Chat history workspace', () => {
  it('uses isolated left navigation and switches only the right content list', () => {
    const onClose = vi.fn();
    const onSelectMain = vi.fn();
    const view = render(<ChatHistoryOverlay onClose={onClose} onSelectMain={onSelectMain} onRestoreFloating={vi.fn()} />);

    expect(view.getByTestId('chat-history-workspace').querySelector('.chat-history-sidebar')).not.toBeNull();
    expect(view.getByRole('heading', { name: '对话记录' })).toBeInTheDocument();
    expect(view.getByText('细胞生物学复习')).toBeInTheDocument();
    expect(view.queryByText('解释线粒体')).toBeNull();
    expect(view.queryByText('被覆上皮')).toBeNull();

    fireEvent.click(view.getByRole('button', { name: /划词/ }));
    expect(view.getByRole('heading', { name: '划词对话' })).toBeInTheDocument();
    expect(view.getByText('解释线粒体')).toBeInTheDocument();
    expect(view.queryByText('细胞生物学复习')).toBeNull();
    expect(view.queryByText('被覆上皮')).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '返回对话' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
