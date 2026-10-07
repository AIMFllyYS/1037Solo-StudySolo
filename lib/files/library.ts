'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from '@/lib/storage/ownerScope';
import { loadCloudFileLibrary, deleteCloudFile, completePendingCloudFile, type CloudStorageUsage } from './client';
import type { CloudFile } from './contract';
import { subscribeCloudFileChanges } from './events';

interface FileLibrary {
  owner: string | null;
  files: CloudFile[];
  storage: CloudStorageUsage | null;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  busyIds: string[];
  refresh: () => Promise<void>;
  mutate: (id: string, action: 'delete' | 'complete') => Promise<boolean>;
}
let flight: { epoch: number; promise: Promise<void> } | null = null;
let revision = 0;
export const useFileLibrary = create<FileLibrary>((set, get) => ({
  owner: getStorageOwner(), files: [], storage: null, phase: 'idle', error: null, busyIds: [],
  refresh() {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    const startedRevision = revision;
    if (!owner) return Promise.resolve();
    if (flight?.epoch === epoch) return flight.promise;
    set({ owner, phase: 'loading', error: null });
    const promise = loadCloudFileLibrary().then(result => {
      if (getStorageOwner() === owner && getOwnerEpoch() === epoch && startedRevision === revision) set({ files: result.files, storage: result.storage, phase: 'ready', error: null });
    }).catch(error => {
      if (getStorageOwner() === owner && getOwnerEpoch() === epoch && startedRevision === revision) set({ phase: 'error', error: error instanceof Error ? error.message : '云端文件暂不可用，请重试。' });
    }).finally(() => { if (flight?.promise === promise) flight = null; });
    flight = { epoch, promise }; return promise;
  },
  async mutate(id, action) {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    if (!owner || get().busyIds.includes(id) || !get().files.some(file => file.id === id && file.state !== 'deleted')) return false;
    set(state => ({ busyIds: [...state.busyIds, id], error: null }));
    try {
      if (action === 'delete') await deleteCloudFile(id); else await completePendingCloudFile(id);
      if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return false;
      revision++; flight = null;
      // A successful delete must disappear immediately, even if a subsequent refresh fails.
      if (action === 'delete') set(state => ({ files: state.files.map(file => file.id === id ? { ...file, state: 'deleted', deleted_at: new Date().toISOString() } : file) }));
      await get().refresh(); return true;
    } catch (error) {
      if (getStorageOwner() === owner && getOwnerEpoch() === epoch) set({ error: error instanceof Error ? error.message : '文件操作失败，请重试。' });
      return false;
    } finally {
      if (getStorageOwner() === owner && getOwnerEpoch() === epoch) set(state => ({ busyIds: state.busyIds.filter(item => item !== id) }));
    }
  },
}));
onStorageOwnerChange((_, owner) => { revision++; flight = null; useFileLibrary.setState({ owner, files: [], storage: null, phase: 'idle', error: null, busyIds: [] }); });
subscribeCloudFileChanges(change => {
  if (change.owner !== getStorageOwner()) return;
  revision++; flight = null;
  useFileLibrary.setState(state => ({ phase: 'idle', storage: null, files: change.action === 'delete' ? state.files.map(file => file.id === change.id ? { ...file, state: 'deleted', deleted_at: new Date().toISOString() } : file) : state.files }));
});
export function useCloudFileLibrary() {
  const library = useFileLibrary();
  const { owner, phase, refresh } = library;
  useEffect(() => { if (owner && phase === 'idle') void refresh(); }, [owner, phase, refresh]);
  return library;
}
