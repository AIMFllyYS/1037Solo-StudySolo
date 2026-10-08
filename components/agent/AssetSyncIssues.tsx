'use client';
import { useState } from 'react';
import { useSyncItems } from '@/lib/sync/status';
import { isCloudSyncKind } from '@/lib/sync/types';
import { captureStorageOperation } from '@/lib/storage/ownerScope';
export default function AssetSyncIssues() {
    const states = useSyncItems(), [error, setError] = useState('');
    const deletions = Object.entries(states).filter(([, state]) => state.phase === 'conflict' && state.operation === 'delete');
    if (!deletions.length && !error)
        return null;
    return <div className="mb-3 space-y-2 rounded border p-3 text-sm">
    {error && <p role="alert">{error}</p>}
    {deletions.map(([key, state]) => <div key={key}><p>{state.message}</p><button className="underline" onClick={() => {
                const colon = key.indexOf(':'), kind = key.slice(0, colon), id = key.slice(colon + 1);
                if (!isCloudSyncKind(kind))
                    return;
                const operation = captureStorageOperation(key);
                void import('@/lib/sync/engine').then(mod => { if (operation.isCurrent())
                    return mod.cancelConflictingDelete(kind, id); }).catch(e => { if (operation.isCurrent())
                    setError(e.message); });
            }}>保留云端版本，取消本机删除</button></div>)}
  </div>;
}
