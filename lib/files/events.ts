import { getStorageOwner } from '@/lib/storage/ownerScope';
const EVENT = 'studysolo:cloud-file-change';
export interface CloudFileChange { owner: string | null; id: string; action: 'pending' | 'ready' | 'delete' }
export function notifyCloudFileChange(id: string, action: CloudFileChange['action']) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: { owner: getStorageOwner(), id, action } })); }
export function subscribeCloudFileChanges(listener: (change: CloudFileChange) => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<CloudFileChange>).detail);
  window.addEventListener(EVENT, handler); return () => window.removeEventListener(EVENT, handler);
}
