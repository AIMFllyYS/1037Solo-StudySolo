import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput from './ChatInput';
import { useSettings } from '@/lib/stores/settings';
import { useAgentApproval } from '@/lib/stores/agentApprovalMode';

const callbacks = vi.hoisted(() => ({
  clearQuote: vi.fn(), clearAttachments: vi.fn(), paste: vi.fn(), drop: vi.fn(), addFiles: vi.fn(), remove: vi.fn(),
  quotedText: '' as string | null,
  attachment: false,
}));

vi.mock('@/components/chat/billing/TokenDashboard', () => ({ default: ({ floatingSessionId, modelId }: { floatingSessionId?: string; modelId?: string }) =>
  <button data-testid="context-dashboard" data-session-id={floatingSessionId} data-model-id={modelId}>上下文</button> }));
vi.mock('@/components/chat/composer/ModelMenu', () => ({ default: ({ value, onChange }: { value?: string; onChange?: (id: string) => void }) =>
  <button data-testid="model-selector" onClick={() => onChange?.('new-floating-model')}>{value ?? '全局模型'}</button> }));
vi.mock('@/components/chat/attachments/AttachmentThumbnails', () => ({ default: () => <div data-testid="attachment-preview">图片预览</div> }));
vi.mock('@/lib/stores/chat/chatUI', () => ({ useChatUI: () => ({ quotedText: callbacks.quotedText, clearQuotedText: callbacks.clearQuote }) }));
vi.mock('@/lib/hooks/files/useImageAttachments', () => ({ useImageAttachments: () => ({
  attachments: callbacks.attachment ? [{ id: 'image', preview: 'data:image/png;base64,eA==' }] : [],
  addFiles: callbacks.addFiles, remove: callbacks.remove, clear: callbacks.clearAttachments,
  toChatFormat: () => callbacks.attachment ? [{ type: 'image', mimeType: 'image/png', base64: 'data:image/png;base64,eA==' }] : [],
  handlePaste: callbacks.paste, handleDrop: callbacks.drop, handleDragOver: vi.fn(), handleDragEnter: vi.fn(), handleDragLeave: vi.fn(),
  isDragging: false, endDrag: vi.fn(), error: null,
}) }));

const context = { subjectId: 'physics', categoryId: 'textbook', itemId: '1', currentTopic: '力学' };
const props = { onSend: vi.fn(), onStop: vi.fn(), isLoading: false, chatContext: context };

beforeEach(() => {
  callbacks.quotedText = null;
  callbacks.attachment = false;
  vi.clearAllMocks();
  useSettings.setState({ selectedModelId: 'mimo-v2.5', customApiGroups: [], defaultThinking: false, defaultSearch: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('floating transparent composer', () => {
  it('keeps Ask/Full preferences selectable while sending is gated, in both toolbar presentations', () => {
    useAgentApproval.getState().setMode('ask');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 160, top: 500, bottom: 528, width: 140, height: 28, x: 20, y: 500, toJSON() {} });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(220);
    const { getByRole, getByTestId } = render(<ChatInput {...props} disabled showAgentModeMenu />);
    const mode = getByRole('button', { name: '执行模式' });
    expect(mode).toBeEnabled();
    expect(getByTestId('chat-input-more')).toBeEnabled();
    expect(getByRole('textbox')).toBeDisabled();
    fireEvent.click(mode);
    fireEvent.click(getByTestId('agent-mode-auto'));
    expect(useAgentApproval.getState().mode).toBe('auto');
    expect(getByRole('textbox')).toBeDisabled();
    fireEvent.click(getByTestId('chat-input-more'));
    fireEvent.click(getByTestId('agent-mode-ask'));
    expect(useAgentApproval.getState().mode).toBe('ask');
  });
  it('disables an unready idle composer without inventing a Stop action', () => {
    const { getByRole, queryByTitle } = render(
      <ChatInput {...props} disabled disabledReason="登录后即可使用 AI 对话" />,
    );
    expect(getByRole('textbox')).toBeDisabled();
    expect(queryByTitle('停止生成')).toBeNull();
  });

  it('keeps the real Stop action available when an access gate blocks new input', () => {
    const onStop = vi.fn();
    const view = render(<ChatInput {...props} onStop={onStop} />);
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'draft before auth expired' } });
    view.rerender(<ChatInput {...props} isLoading disabled disabledReason="登录后即可使用 AI 对话" onStop={onStop} />);
    const { getByRole, getByTitle } = view;
    expect(getByRole('textbox')).toBeDisabled();
    const stop = getByTitle('停止生成');
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('keeps all four controls before the textbox in DOM order, with measured notices/previews in the same dock', () => {
    callbacks.quotedText = '教材原文';
    callbacks.attachment = true;
    const onModelChange = vi.fn();
    const { container, getByRole, getByTestId } = render(<ChatInput {...props} modelId="mimo-v2.5"
      floatingSessionId="floating-session" onModelChange={onModelChange} notice={<div data-testid="notice">80% 上下文警告</div>} />);
    const dock = container.querySelector('.chat-input-container')!;
    const toolbar = dock.querySelector('.chat-input-toolbar')!;
    const row = dock.querySelector('.chat-input-row')!;
    expect(toolbar.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.contains(getByTestId('context-dashboard'))).toBe(true);
    expect(toolbar.contains(getByTestId('model-selector'))).toBe(true);
    expect(row.contains(getByRole('textbox'))).toBe(true);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('.html'));
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('.json'));
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('.tsx'));
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    expect(dock.contains(getByTestId('notice'))).toBe(true);
    expect(dock.contains(getByTestId('attachment-preview'))).toBe(true);
    expect(row.contains(getByTestId('attachment-preview'))).toBe(true);
    expect(getByTestId('notice').compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getByTestId('context-dashboard')).toHaveAttribute('data-session-id', 'floating-session');
    expect(getByTestId('context-dashboard')).toHaveAttribute('data-model-id', 'mimo-v2.5');
    fireEvent.click(getByTestId('model-selector'));
    expect(onModelChange).toHaveBeenCalledWith('new-floating-model');
  });

  it('reports dynamic dock height plus bottom breathing room for quotes, textarea growth and narrow toolbar wrapping', () => {
    let height = 96;
    let resize: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { x: 0, y: 0, top: 0, bottom: height, left: 0, right: 280, width: 280, height: this.classList.contains('chat-input-container') ? height : 0, toJSON: () => ({}) };
    });
    const originalGetStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = originalGetStyle(element);
      if (element.classList.contains('chat-input-container')) Object.defineProperty(style, 'bottom', { value: '10px' });
      return style;
    });
    const onInset = vi.fn();
    const { container, unmount } = render(<ChatInput {...props} onComposerInsetChange={onInset} />);
    expect(observe).toHaveBeenCalledWith(container.querySelector('.chat-input-container'));
    // 输入框也挂了一个 observer：左右栏宽度变化时要重新量行高（空态必须还是一行）
    expect(observe).toHaveBeenCalledWith(container.querySelector('textarea'));
    expect(onInset).toHaveBeenLastCalledWith(122);
    height = 212;
    act(() => resize?.([], {} as ResizeObserver));
    expect(onInset).toHaveBeenLastCalledWith(238);
    height = 248;
    fireEvent(window, new Event('resize'));
    expect(onInset).toHaveBeenLastCalledWith(274);
    unmount();
    // 容器 observer + 输入框 observer 各自断开
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(onInset).not.toHaveBeenCalledWith(0); // StrictMode cleanup 不让保留区塌陷。
  });

  it('keeps paste/drop, quote and image-only send behavior on the repositioned composer', () => {
    callbacks.quotedText = '引用段落';
    callbacks.attachment = true;
    const { container, getByRole, getByTitle } = render(<ChatInput {...props} />);
    fireEvent.paste(getByRole('textbox'));
    fireEvent.drop(container.querySelector('.chat-input-container')!);
    expect(callbacks.paste).toHaveBeenCalledOnce();
    expect(callbacks.drop).toHaveBeenCalledOnce();
    fireEvent.click(getByTitle('发送'));
    expect(props.onSend).toHaveBeenCalledWith('请阅读并分析附件', expect.objectContaining({ quotedText: '引用段落',
      attachments: [{ type: 'image', mimeType: 'image/png', base64: 'data:image/png;base64,eA==' }] }));
    expect(callbacks.clearQuote).toHaveBeenCalledOnce();
    expect(callbacks.clearAttachments).toHaveBeenCalledOnce();
  });

  it('CSS contract anchors a transparent dock and stages compact toolbar controls without clipping narrow surfaces', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles/prose.css'), 'utf8');
    // 只认「行首就是这条选择器」的基础规则：覆盖写法（如 .chat-panel--welcome .chat-input-container）
    // 或 @media 里的同名规则都可能排在前面，按子串取第一条会读到覆盖内容。
    const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)[ \\t]*${selector.replaceAll('.', '\\.')}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
    const dock = rule('.chat-input-container');
    expect(dock).toContain('position: absolute');
    expect(dock).toContain('background: transparent');
    expect(dock).toContain('border: none');
    expect(dock).toContain('box-shadow: none');
    expect(dock).toContain('safe-area-inset-bottom');
    expect(rule('.chat-input-toolbar')).toContain('flex-wrap: wrap');
    expect(rule('.chat-input-toolbar-group')).toContain('flex-wrap: wrap');
    expect(rule('.chat-input-toolbar-group')).toContain('min-width: 0');
    expect(rule('.chat-input-textarea')).toContain('min-width: 0');
    expect(rule('.chat-input-textarea')).toContain('min-height: 32px');
    expect(rule('.chat-input-textarea')).toContain('line-height: 20px');
    expect(rule('.chat-input-editor-row')).toContain('align-items: center');
    expect(rule('.chat-input-drop-overlay')).toContain('pointer-events: none');
    expect(css).toContain('@container chat-composer (max-width: 320px)');
    expect(css).toContain('@container chat-composer (max-width: 430px)');
    expect(rule('.chat-input-more')).toContain('opacity: 0');
    expect(css).toContain('opacity 100ms var(--ease-out)');
    expect(css).toContain('opacity 90ms var(--ease-out) 110ms');
    expect(rule('.chat-input-row')).toContain('backdrop-filter: blur(14px)');
  });

  it('shows the meter only for long text, keeps excess text, blocks send and opens an accessible warning', () => {
    const { getByRole } = render(<ChatInput {...props} />);
    const textbox = getByRole('textbox');
    expect(document.querySelector('.chat-input-count')).toBeNull();
    fireEvent.change(textbox, { target: { value: '字'.repeat(1_000) } });
    expect(document.querySelector('.chat-input-count')).toBeNull();
    fireEvent.change(textbox, { target: { value: '字'.repeat(1_001) } });
    expect(document.querySelector('.chat-input-count')).toHaveTextContent('1,001 / 50,000 字');
    expect(document.querySelector('.chat-input-row')).toHaveClass('chat-input-row-with-count');
    fireEvent.change(textbox, { target: { value: '字'.repeat(50_001) } });
    expect(textbox).toHaveValue('字'.repeat(50_001));
    expect(textbox).toHaveAttribute('aria-invalid', 'true');
    expect(getByRole('alertdialog')).toHaveTextContent('已超出 5 万字上限');
    expect(getByRole('button', { name: '发送' })).toBeDisabled();
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('counts supplementary Unicode characters as one visible character without showing a short-text meter', () => {
    const { getByRole } = render(<ChatInput {...props} />);
    fireEvent.change(getByRole('textbox'), { target: { value: '😀'.repeat(1_001) } });
    expect(document.querySelector('.chat-input-count')).toHaveTextContent('1,001 / 50,000 字');
  });
});
