import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FileTreeItem from './FileTreeItem';
import { NOTEBOOK_FILE_MIME } from '@/lib/chat/composerIntent';

vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(() => cleanup());

describe('FileTreeItem notebook drag', () => {
  it('long-press drag serializes the detailed notebook path', () => {
    const { getByRole } = render(
      <FileTreeItem
        item={{ id: '1.4', title: '古典概型与几何概型', type: 'section' }}
        depth={1}
        nsKey="probability/detail/1.4"
        subjectId="probability"
        categoryId="detail"
        isExpanded={false}
        isSelected={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const row = getByRole('button');
    expect(row).toHaveAttribute('draggable', 'true');
    const store: Record<string, string> = {};
    fireEvent.dragStart(row, {
      dataTransfer: {
        setData: (type: string, value: string) => { store[type] = value; },
        effectAllowed: 'none',
      },
    });
    expect(store[NOTEBOOK_FILE_MIME]).toContain('probability/detail/1.4');
    expect(store[NOTEBOOK_FILE_MIME]).toContain('古典概型');
    expect(store['text/plain']).toContain('probability/detail/1.4');
  });
});
