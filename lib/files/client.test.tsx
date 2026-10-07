import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { loadCloudFileLibrary, readCloudFileContext } from './client';
const owner = '10000000-0000-4000-8000-000000000001';
beforeEach(() => activateStorageOwner(owner));
afterEach(() => { activateStorageOwner(null); vi.unstubAllGlobals(); });
it('malformed file states cannot appear as an empty or successfully loaded library', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ files: [{ state: 'unexpected' }], nextCursor: null, storage: null })));
  await expect(loadCloudFileLibrary()).rejects.toThrow('未采用不完整数据');
});
it('repeated pagination cursors are rejected instead of looping indefinitely', async () => {
  const cursor = '11111111-1111-4111-8111-111111111111';
  const fetch = vi.fn(async () => Response.json({ files: [], nextCursor: cursor, storage: null })); vi.stubGlobal('fetch', fetch);
  await expect(loadCloudFileLibrary()).rejects.toThrow('重复游标'); expect(fetch).toHaveBeenCalledTimes(2);
});
it('requests bind expected owner and discard a context returned after account switching', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
    expect(new Headers(init?.headers).get('x-study-file-owner')).toBe(owner);
    activateStorageOwner('10000000-0000-4000-8000-000000000002');
    return Response.json({ processed: { v: 1, text: '旧账号公开测试材料' } });
  }));
  await expect(readCloudFileContext('11111111-1111-4111-8111-111111111111')).rejects.toThrow('账号已切换');
});
