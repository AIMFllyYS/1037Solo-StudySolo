'use client';
import { create } from 'zustand';
import { getStorageOwner, getOwnerEpoch, onStorageOwnerChange } from '@/lib/storage/ownerScope';
import type { AssetOrigin } from './assetCatalog';
interface Row { id: string; title: string; updatedAt: string; origin: AssetOrigin; archived?: boolean }
interface Library { owner: string | null; rows: Row[]; phase: 'idle'|'loading'|'ready'|'error'; error: string | null; refresh: () => Promise<void> }
let flight: { epoch: number; promise: Promise<void> } | null = null;
export const useClassroomAssets = create<Library>(set => ({
  owner: getStorageOwner(), rows: [], phase: 'idle', error: null,
  refresh() {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    if (!owner) return Promise.resolve();
    if (flight?.epoch === epoch) return flight.promise;
    const cached: Row[] = [];
    try { const value = JSON.parse(localStorage.getItem(`ss-class:v1:${owner}`) || '{}'); for (const entry of Object.values(value.sessions || {})) { const row = (entry as { session?: Row })?.session; if (row && !row.archived && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.updatedAt === 'string') cached.push({ ...row, origin: 'local' }); } } catch {}
    set({ owner, phase: 'loading', error: null });
    const promise = fetch('/api/class/state', { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'session.list', expectedUserId: owner, input: {} }) }).then(async response => {
      if (!response.ok) throw new Error('课堂云端列表暂不可用，现有本机课堂记录已保留。');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.updatedAt !== 'string')) throw new Error('课堂列表格式不正确，未采用不完整数据。');
      const merged = new Map(cached.map(row => [row.id, row]));
      for (const row of rows as Row[]) merged.set(row.id, { ...row, origin: merged.has(row.id) ? 'both' : 'cloud' });
      if (getStorageOwner() === owner && getOwnerEpoch() === epoch) set({ rows: [...merged.values()], phase: 'ready', error: null });
    }).catch(error => { if (getStorageOwner() === owner && getOwnerEpoch() === epoch) set({ rows: cached, phase: 'error', error: error instanceof Error ? error.message : '课堂列表读取失败。' }); }).finally(() => { if (flight?.promise === promise) flight = null; });
    flight = { epoch, promise }; return promise;
  },
}));
onStorageOwnerChange((_, owner) => { flight = null; useClassroomAssets.setState({ owner, rows: [], phase: 'idle', error: null }); });
