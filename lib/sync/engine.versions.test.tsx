import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { __resetCloudSyncForTests, __setCloudSyncStoresForTests, __setSyncClientForTests, __setCloudSyncDebounceForTests, enqueueUpsert, flushCloudSyncForTests, pullAndPushAll, type CloudSyncStores } from './engine';
import { createMemorySyncClient } from './client';
import { setCloudSyncEnabled } from './schedule';
import { getSyncItemStatus } from './status';
import type { Artifact } from '@/lib/stores/assets/artifacts';
afterEach(() => { __resetCloudSyncForTests(); activateStorageOwner(null); vi.unstubAllGlobals(); localStorage.clear(); });
it('a dirty skipped pull keeps the common revision and preserves both conflicting HTML bodies', async () => {
    __resetCloudSyncForTests();
    activateStorageOwner('10000000-0000-4000-8000-000000000001');
    const base: Artifact = { id: 'one', title: 'demo', html: 'base', status: 'done' };
    const artifacts = new Map<string, Artifact>();
    const stores = new Proxy({
        listArtifactIds: () => [...artifacts.keys()], getArtifact: (id: string) => artifacts.get(id) ?? null,
        applyArtifact: (row: Artifact) => { artifacts.set(row.id, row); }, forgetArtifact: (id: string) => { artifacts.delete(id); },
    }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key).startsWith('list') ? () => [] : () => null }) as unknown as CloudSyncStores;
    const api = createMemorySyncClient();
    api.rows.set('artifact:one', { kind: 'artifact', client_id: 'one', payload: base, deleted: false, revision: 1, updated_at: '2026-10-01T00:00:00Z' });
    __setCloudSyncStoresForTests(stores);
    __setSyncClientForTests(api);
    await pullAndPushAll();
    artifacts.set('one', { ...base, html: 'local change' });
    const originalGet = api.get;
    api.get = async () => ({ data: null, error: { message: 'offline', status: 503 } });
    setCloudSyncEnabled(true);
    __setCloudSyncDebounceForTests(0);
    enqueueUpsert('artifact', 'one');
    await flushCloudSyncForTests();
    api.rows.set('artifact:one', { kind: 'artifact', client_id: 'one', payload: { ...base, html: 'remote change' }, deleted: false, revision: 2, updated_at: '2026-10-02T00:00:00Z' });
    await pullAndPushAll();
    expect(artifacts.get('one')?.html).toBe('local change');
    expect(JSON.parse(localStorage.getItem('ss-sync-heads:10000000-0000-4000-8000-000000000001')!)['artifact:one']).toBe(1);
    api.get = originalGet;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ payload: base })));
    await flushCloudSyncForTests();
    expect(getSyncItemStatus('artifact:one')?.phase).toBe('conflict');
    expect(artifacts.get('one')?.html).toBe('remote change');
    expect([...artifacts.values()].find(row => row.id.startsWith('conflict-'))?.html).toBe('local change');
    expect(api.upserts.some(row => row.client_id === 'one')).toBe(false);
});


it('offline deletion cannot delete an unseen remote revision and can retain that cloud version', async()=>{
 __resetCloudSyncForTests();activateStorageOwner('10000000-0000-4000-8000-000000000002');
 const artifacts=new Map<string,Artifact>();const base:Artifact={id:'delete-one',title:'demo',html:'base',status:'done'};
 const stores=new Proxy({listArtifactIds:()=>[...artifacts.keys()],getArtifact:(id:string)=>artifacts.get(id)??null,applyArtifact:(row:Artifact)=>{artifacts.set(row.id,row);},forgetArtifact:(id:string)=>{artifacts.delete(id);}},{get:(target,key)=>key in target?target[key as keyof typeof target]:String(key).startsWith('list')?()=>[]:()=>null}) as unknown as CloudSyncStores;
 const api=createMemorySyncClient();api.rows.set('artifact:delete-one',{kind:'artifact',client_id:'delete-one',payload:base,deleted:false,revision:1,updated_at:'2026-10-01T00:00:00Z'});
 __setCloudSyncStoresForTests(stores);__setSyncClientForTests(api);await pullAndPushAll();
 artifacts.delete('delete-one');api.rows.set('artifact:delete-one',{kind:'artifact',client_id:'delete-one',payload:{...base,html:'unseen cloud edit'},deleted:false,revision:2,updated_at:'2026-10-02T00:00:00Z'});
 const {enqueueTombstone,cancelConflictingDelete}=await import('./engine');__setCloudSyncDebounceForTests(0);enqueueTombstone('artifact','delete-one');await flushCloudSyncForTests();
 expect(getSyncItemStatus('artifact:delete-one')?.phase).toBe('conflict');expect(api.rows.get('artifact:delete-one')?.deleted).toBe(false);
 await cancelConflictingDelete('artifact','delete-one');expect(artifacts.get('delete-one')?.html).toBe('unseen cloud edit');expect(getSyncItemStatus('artifact:delete-one')?.phase).toBe('synced');
});
