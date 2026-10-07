import { afterEach, expect, it, vi } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { useClassroomAssets } from './classroomAssets';
afterEach(() => { activateStorageOwner(null); localStorage.clear(); vi.unstubAllGlobals(); });
it('archived classrooms are excluded and cloud failure remains explicit', async () => {
  const owner = '10000000-0000-4000-8000-000000000001'; activateStorageOwner(owner);
  localStorage.setItem(`ss-class:v1:${owner}`, JSON.stringify({ sessions: { kept: { session: { id: 'kept', title: '公开课堂', updatedAt: '2026-10-08T00:00:00Z' } }, archived: { session: { id: 'archived', title: '已归档公开课堂', updatedAt: '2026-10-08T00:00:00Z', archived: true } } } }));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 503 })));
  await useClassroomAssets.getState().refresh();
  expect(useClassroomAssets.getState().rows.map(row => row.id)).toEqual(['kept']);
  expect(useClassroomAssets.getState().phase).toBe('error');
  expect(useClassroomAssets.getState().error).toMatch(/现有本机课堂记录已保留/);
});
