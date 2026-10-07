import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ load: vi.fn(), remove: vi.fn(), complete: vi.fn() }));
vi.mock('./client', () => ({ loadCloudFileLibrary: api.load, deleteCloudFile: api.remove, completePendingCloudFile: api.complete }));
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { useFileLibrary } from './library';
const owner = '10000000-0000-4000-8000-000000000001';
const file = { id: '11111111-1111-4111-8111-111111111111', name: 'public.txt', mime_type: 'text/plain', size_bytes: 10, project_id: null, state: 'pending' as const, created_at: '2026-10-08T00:00:00Z', deleted_at: null };
beforeEach(() => { vi.resetAllMocks(); activateStorageOwner(null); activateStorageOwner(owner); });
afterEach(() => activateStorageOwner(null));
it('multiple asset consumers share one in-flight request', async () => {
  api.load.mockResolvedValue({ files: [file], storage: null });
  await Promise.all([useFileLibrary.getState().refresh(), useFileLibrary.getState().refresh()]);
  expect(api.load).toHaveBeenCalledOnce();
  expect(useFileLibrary.getState().files).toHaveLength(1);
});
it('a late previous-owner list cannot populate a new account', async () => {
  let release: (value: unknown) => void = () => {};
  api.load.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const pending = useFileLibrary.getState().refresh();
  activateStorageOwner('10000000-0000-4000-8000-000000000002');
  release({ files: [file], storage: null }); await pending;
  expect(useFileLibrary.getState().files).toEqual([]);
  expect(useFileLibrary.getState().phase).toBe('idle');
});
it('confirmation is single-flight and an old-owner completion cannot refresh the new account', async () => {
  api.load.mockResolvedValue({ files: [file], storage: null }); await useFileLibrary.getState().refresh();
  let finish: () => void = () => {};
  api.complete.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const pending = useFileLibrary.getState().mutate(file.id, 'complete');
  expect(await useFileLibrary.getState().mutate(file.id, 'complete')).toBe(false);
  activateStorageOwner('10000000-0000-4000-8000-000000000002'); finish();
  expect(await pending).toBe(false);
  expect(api.complete).toHaveBeenCalledOnce(); expect(api.load).toHaveBeenCalledOnce();
  expect(useFileLibrary.getState().busyIds).toEqual([]);
});
it('an earlier refresh cannot resurrect a file after its successful soft deletion', async () => {
  useFileLibrary.setState({ files: [{ ...file, state: 'ready' }], phase: 'ready' });
  let release: (value: unknown) => void = () => {};
  api.load.mockReturnValueOnce(new Promise(resolve => { release = resolve; })).mockResolvedValue({ files: [], storage: null });
  const stale = useFileLibrary.getState().refresh();
  api.remove.mockResolvedValue(undefined);
  expect(await useFileLibrary.getState().mutate(file.id, 'delete')).toBe(true);
  release({ files: [{ ...file, state: 'ready' }], storage: null }); await stale;
  expect(useFileLibrary.getState().files).toEqual([]);
});
