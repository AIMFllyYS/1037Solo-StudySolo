import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectFileEntry } from './types';
const fixture = vi.hoisted(() => ({ files: vi.fn(), context: vi.fn(), state: { order: [] as string[], byId: {} as Record<string, ProjectFileEntry> } }));
vi.mock('@/lib/files/client', () => ({ listCloudFiles: fixture.files, readCloudFileContext: fixture.context }));
vi.mock('@/lib/stores/projectFiles', () => {
  const store = {
    getState: () => ({ ...fixture.state,
      beginImport: (input: { projectId: string; name: string }) => { const id = Object.values(fixture.state.byId).find(row => row.name === input.name)?.id ?? 'local-file'; fixture.state.byId[id] = { ...input, id, kind: 'imported', status: 'parsing', slices: [], indexMarkdown: '', charCount: 0, createdAt: 1, updatedAt: 1 }; return id; },
      finishImport: (id: string, parsed: Partial<ProjectFileEntry>) => { fixture.state.byId[id] = { ...fixture.state.byId[id], ...parsed, status: 'indexed' }; },
      removeFile: (id: string) => { const next = { ...fixture.state.byId }; delete next[id]; fixture.state.byId = next; },
    }),
    setState: (update: (state: typeof fixture.state) => Partial<typeof fixture.state>) => { Object.assign(fixture.state, update(fixture.state)); },
  };
  return { useProjectFiles: store };
});
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { restoreProjectCloudFiles } from './cloudFiles';
const newer = { id: '11111111-1111-4111-8111-111111111111', name: 'public.txt', mime_type: 'text/plain', size_bytes: 10, state: 'ready', created_at: '2026-10-08T00:00:00Z' };
const older = { ...newer, id: '11111111-1111-4111-8111-111111111112', created_at: '2026-10-07T00:00:00Z' };
beforeEach(() => { fixture.state.byId = {}; fixture.context.mockReset().mockResolvedValue({ v: 1, text: '公开材料最新版' }); activateStorageOwner('10000000-0000-4000-8000-000000000001'); });
afterEach(() => activateStorageOwner(null));
it('restoring same-name immutable cloud versions never replaces the latest index with the oldest', async () => {
  fixture.files.mockResolvedValue([newer, older]);
  await restoreProjectCloudFiles('public-project');
  expect(fixture.context).toHaveBeenCalledOnce();
  expect(Object.values(fixture.state.byId)[0].cloudFileId).toBe(newer.id);
});
it('deleting the latest version is a project tombstone and does not resurrect an older version', async () => {
  fixture.files.mockResolvedValue([{ ...newer, state: 'deleted' }, older]);
  await restoreProjectCloudFiles('public-project');
  expect(fixture.context).not.toHaveBeenCalled();
  expect(fixture.state.byId).toEqual({});
});
