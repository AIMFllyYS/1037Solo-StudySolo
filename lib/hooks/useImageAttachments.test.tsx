import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageAttachments } from './useImageAttachments';
import { useSettings } from './useSettings';
vi.mock('@/lib/files/client', () => ({ uploadCloudFile: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })) }));
vi.mock('@/lib/project/parse', () => ({ extractFileText: vi.fn(async () => '公开测试 PDF 正文') }));

beforeEach(() => {
  useSettings.setState({ selectedModelId: 'mimo-v2.5', customApiGroups: [] });
});

afterEach(() => {
  localStorage.clear();
});

describe('useImageAttachments documents', () => {
  it('limits one draft to nine attachments and permits another nine after sending/clearing', async () => {
    const { result } = renderHook(() => useImageAttachments());
    const files = Array.from({ length: 9 }, (_, i) => new File([`public ${i}`], `public-${i}.txt`, { type: 'text/plain' }));
    await act(async () => { await result.current.addFiles(files); });
    expect(result.current.attachments).toHaveLength(9);
    await act(async () => { await result.current.addFiles([new File(['overflow'], 'overflow.txt', { type: 'text/plain' })]); });
    expect(result.current.attachments).toHaveLength(9);
    expect(result.current.error).toMatch(/单次消息最多添加 9/);
    act(() => result.current.clear());
    await act(async () => { await result.current.addFiles(files); });
    expect(result.current.attachments).toHaveLength(9);
  });
  it('turns a paste longer than 1,000 characters into an in-composer TXT attachment', async () => {
    const pasted = '字'.repeat(1_001);
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useImageAttachments());

    act(() => {
      result.current.handlePaste({
        preventDefault,
        clipboardData: {
          items: [] as unknown as DataTransferItemList,
          getData: (type: string) => type === 'text/plain' ? pasted : '',
        },
      } as unknown as React.ClipboardEvent);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    const attachment = result.current.attachments[0];
    expect(attachment.type).toBe('document');
    if (attachment.type === 'document') {
      expect(attachment.name).toMatch(/^粘贴文本-.*\.txt$/);
      expect(attachment.text).toBe(pasted);
      expect(attachment.characterCount).toBe(1_001);
    }
    expect(result.current.info).toMatch(/已将 1,001 字粘贴内容转为 TXT 附件/);
  });

  it('keeps an exact 1,000-character paste in the textarea', () => {
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useImageAttachments());
    act(() => {
      result.current.handlePaste({
        preventDefault,
        clipboardData: { items: [] as unknown as DataTransferItemList, getData: () => '字'.repeat(1_000) },
      } as unknown as React.ClipboardEvent);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(0);
  });

  it('endDrag clears a stuck dashed-box drag state', () => {
    const { result } = renderHook(() => useImageAttachments());
    act(() => {
      result.current.handleDragEnter({ preventDefault() {} } as unknown as React.DragEvent);
    });
    expect(result.current.isDragging).toBe(true);
    act(() => {
      result.current.endDrag();
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('processes PDF attachments before producing a stable cloud reference', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useImageAttachments());

    await act(async () => {
      await result.current.addFiles([
        new File(['%PDF-1.7 local'], 'lecture.pdf', { type: 'application/pdf' }),
      ]);
    });

    expect(network).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(1);
    const attachment = result.current.attachments[0];
    expect(attachment.type).toBe('local-file');
    if (attachment.type === 'local-file') {
      expect(attachment.dataUrl).toMatch(/^(data:application\/pdf;base64,|blob:)/);
      expect(attachment.name).toBe('lecture.pdf');
    }
    expect(result.current.toChatFormat()?.[0]?.type).toBe('local-file');
  });
});
