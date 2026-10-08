import { getStorageOwner, getOwnerEpoch } from '@/lib/storage/ownerScope';
import type { CloudSyncKind } from './types';

export type SyncJob = { op: 'upsert' | 'tombstone'; kind: CloudSyncKind; clientId: string; ownerId: string | null; epoch: number; mutationId?: string; expectedRevision?: number; fingerprint?: string };
export const pendingSyncJobs = new Map<string, SyncJob>();
let active: SyncJob | null = null;
export function setJournalActive(job: SyncJob | null): void { active = job; }
export function persistSyncJournal(ownerId: string | null): void {
  if (!ownerId || typeof localStorage === 'undefined') return;
  const rows = [...(active?.ownerId === ownerId ? [active] : []), ...pendingSyncJobs.values()]
    .filter(job => job.ownerId === ownerId)
    .map(({kind,clientId,op,mutationId,expectedRevision,fingerprint})=>({kind,clientId,op,mutationId,expectedRevision,fingerprint}));
  try { localStorage.setItem(`ss-sync-jobs:${ownerId}`, JSON.stringify(rows)); } catch { /* runtime queue remains; body is kept independently */ }
}
/** Register before lazy loading the engine: an immediate account switch must not lose the intent. */
export function registerSyncIntent(kind: CloudSyncKind, clientId: string, op: SyncJob['op']): SyncJob {
  const ownerId = getStorageOwner(), epoch = getOwnerEpoch();
  let expectedRevision: number | undefined;
  if (ownerId && typeof localStorage !== 'undefined') try {
    const value = JSON.parse(localStorage.getItem(`ss-sync-heads:${ownerId}`) ?? '{}')[`${kind}:${clientId}`];
    if (Number.isSafeInteger(value) && value >= 0) expectedRevision = value;
  } catch {}
  const job: SyncJob = {kind,clientId,op,ownerId,epoch,expectedRevision};
  pendingSyncJobs.set(`${kind}:${clientId}`,job);
  persistSyncJournal(ownerId);
  return job;
}
