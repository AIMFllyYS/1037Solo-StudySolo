import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ extract: vi.fn(), upload: vi.fn(), remove: vi.fn(), record: vi.fn(), finish: vi.fn(), state: { byId: {} as Record<string, { id: string; projectId: string; name: string }> } }));
vi.mock('./parse', () => ({ extractFileText: fixture.extract }));
vi.mock('@/lib/files/client', () => ({ uploadCloudFile: fixture.upload, deleteCloudFile: fixture.remove }));
vi.mock('@/lib/stores/imports', () => ({ recordImport: fixture.record }));
vi.mock('@/lib/stores/projectFiles', () => ({ useProjectFiles: {
  getState: () => ({ byId: fixture.state.byId, beginImport: (input: { projectId: string; name: string }) => { fixture.state.byId.placeholder = { ...input, id: 'placeholder' }; return 'placeholder'; }, finishImport: fixture.finish, failImport: vi.fn() }),
  setState: vi.fn(),
} }));
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { importProjectFile } from './import';
beforeEach(() => { vi.clearAllMocks(); fixture.state.byId = {}; activateStorageOwner('10000000-0000-4000-8000-000000000001'); });
afterEach(() => activateStorageOwner(null));
it('switching accounts during file extraction prevents even the upload to the new account', async () => {
  fixture.extract.mockImplementation(async () => { activateStorageOwner('10000000-0000-4000-8000-000000000002'); return '旧账号公开测试正文'; });
  const result = await importProjectFile({ projectId: 'public-project', file: new File(['public'], 'public.txt', { type: 'text/plain' }) });
  expect(result.id).toBeNull(); expect(fixture.upload).not.toHaveBeenCalled(); expect(fixture.finish).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
});
it('a removed import placeholder cannot be recreated by a late successful upload', async () => {
  fixture.extract.mockResolvedValue('公开测试正文');
  fixture.upload.mockImplementation(async () => { fixture.state.byId = {}; return { id: '11111111-1111-4111-8111-111111111111' }; });
  fixture.remove.mockResolvedValue(undefined);
  const result = await importProjectFile({ projectId: 'public-project', file: new File(['public'], 'public.txt', { type: 'text/plain' }) });
  expect(result.id).toBeNull(); expect(fixture.remove).toHaveBeenCalledOnce(); expect(fixture.finish).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
});
