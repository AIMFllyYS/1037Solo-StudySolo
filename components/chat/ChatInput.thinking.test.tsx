import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import ChatInput from './ChatInput';
import { useSettings } from '@/lib/hooks/useSettings';

vi.mock('@/components/chat/TokenDashboard', () => ({
  default: () => <div data-testid="token-dashboard" />,
}));

vi.mock('@/components/chat/ModelMenu', () => ({
  default: () => <div data-testid="model-menu" />,
}));

vi.mock('@/lib/hooks/useChatUI', () => ({
  useChatUI: () => ({ quotedText: null, clearQuotedText: vi.fn() }),
}));

vi.mock('@/lib/hooks/useImageAttachments', () => ({
  useImageAttachments: () => ({
    attachments: [],
    addFiles: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    toChatFormat: () => [],
    handlePaste: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    isDragging: false,
    endDrag: vi.fn(),
    error: null,
  }),
}));

const chatContext = {
  subjectId: 'physics',
  categoryId: 'demo',
  itemId: '1',
  currentTopic: 'topic',
};

describe('ChatInput thinking menu', () => {
  beforeEach(() => {
    useSettings.setState({
      selectedModelId: 'Tongyi-MAI/Z-Image-Turbo',
      customApiGroups: [],
      defaultThinking: true,
      defaultThinkingEffort: 'medium',
    });
  });

  it('custom send/stop/attachment glyphs preserve keyboard actions and floating model thinking override', () => {
    useSettings.setState({ defaultThinking: true, defaultThinkingEffort: 'high' });
    const onSend = vi.fn();
    const onStop = vi.fn();
    const props = { onSend, onStop, isLoading: false, chatContext, modelId: 'mimo-v2.5', onModelChange: vi.fn() };
    const { container, getByTitle, getByRole, getByTestId, rerender } = render(<ChatInput {...props} />);
    expect(getByTitle('发送').querySelector('[data-agent-icon="arrow-up"]')).not.toBeNull();
    expect(getByTitle('添加计划、工具或技能').querySelector('[data-agent-icon="plus"]')).not.toBeNull();
    fireEvent.change(getByRole('textbox'), { target: { value: '解释这一页' } });
    fireEvent.keyDown(getByRole('textbox'), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('解释这一页', expect.objectContaining({ enableThinking: true, thinkingEffort: 'high' }));
    expect(useSettings.getState().selectedModelId).toBe('Tongyi-MAI/Z-Image-Turbo');
    rerender(<ChatInput {...props} isLoading />);
    expect(getByTitle('停止生成').querySelector('[data-agent-icon="stop"]')).not.toBeNull();
    fireEvent.click(getByTitle('停止生成'));
    expect(onStop).toHaveBeenCalledOnce();
    expect(container.querySelector('.lucide')).toBeNull();
  });

  it('sends effective thinkingEffort through onSend when thinking is enabled', async () => {
    useSettings.setState({
      selectedModelId: 'mimo-v2.5',
      customApiGroups: [],
      defaultThinking: true,
      defaultThinkingEffort: 'medium',
    });
    const onSend = vi.fn();
    const { container } = render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isLoading={false}
        chatContext={chatContext}
      />,
    );
    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input-textarea')!;
    fireEvent.change(textarea, { target: { value: 'hello' } });

    const sendBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.chat-input-send'))
      .find((b) => b.title === '发送' || b.title === '停止生成');
    expect(sendBtn).toBeDefined();
    await act(async () => { sendBtn!.click(); });
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('hello', expect.objectContaining({ enableThinking: true, thinkingEffort: 'medium' }));
  });

  it('keeps drafting while loading and sends queued messages in order after generation ends', async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { getByRole, getByTitle, rerender } = render(
      <ChatInput {...{ onSend, onStop, isLoading: true, chatContext }} />,
    );
    const textbox = getByRole('textbox');
    expect(textbox).not.toBeDisabled();
    expect(getByTitle('停止生成')).toBeVisible();

    fireEvent.change(textbox, { target: { value: '第一条' } });
    expect(getByTitle('发送').querySelector('[data-agent-icon="arrow-up"]')).not.toBeNull();
    fireEvent.click(getByTitle('发送'));
    fireEvent.change(textbox, { target: { value: '第二条' } });
    fireEvent.click(getByTitle('发送'));
    expect(onSend).not.toHaveBeenCalled();
    expect(getByRole('region', { name: '等待发送' })).toHaveTextContent('2 条');

    fireEvent.click(getByRole('button', { name: '编辑第 1 条排队内容' }));
    fireEvent.change(textbox, { target: { value: '第一条（已修改）' } });
    fireEvent.click(getByTitle('发送'));

    rerender(<ChatInput {...{ onSend, onStop, isLoading: false, chatContext }} />);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('第一条（已修改）', expect.any(Object)));
    // 模拟父级在发送第一条后进入下一轮生成，再由生成结束触发第二条。
    rerender(<ChatInput {...{ onSend, onStop, isLoading: true, chatContext }} />);
    expect(getByRole('region', { name: '等待发送' })).toHaveTextContent('第二条');
    rerender(<ChatInput {...{ onSend, onStop, isLoading: false, chatContext }} />);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('第二条', expect.any(Object)));
  });
});
