import { afterEach, expect, it } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { pendingSyncJobs, registerSyncIntent, setJournalActive } from './journal';
import { __resetCloudSyncForTests, activateSyncIntent } from './engine';

afterEach(()=>{__resetCloudSyncForTests();activateStorageOwner(null);localStorage.clear();});
it('the upload intent survives an owner switch before the engine is activated',()=>{
  __resetCloudSyncForTests();activateStorageOwner('journal-a');
  localStorage.setItem('ss-sync-heads:journal-a',JSON.stringify({'document:one':3}));
  const intent=registerSyncIntent('document','one','upsert');
  activateStorageOwner('journal-b');
  activateSyncIntent(intent);
  expect(JSON.parse(localStorage.getItem('ss-sync-jobs:journal-a')!)).toEqual([{kind:'document',clientId:'one',op:'upsert',expectedRevision:3}]);
  expect(pendingSyncJobs.size).toBe(0);
});
it('registering a new intent retains other in-flight metadata without copying bodies',()=>{
  __resetCloudSyncForTests();activateStorageOwner('journal-a');
  const active=registerSyncIntent('document','active','upsert');
  pendingSyncJobs.delete('document:active');setJournalActive(active);
  registerSyncIntent('artifact','next','upsert');
  const rows=JSON.parse(localStorage.getItem('ss-sync-jobs:journal-a')!);
  expect(rows.map((row:{clientId:string})=>row.clientId)).toEqual(['active','next']);
  expect(JSON.stringify(rows)).not.toMatch(/markdown|html|images/);
});
