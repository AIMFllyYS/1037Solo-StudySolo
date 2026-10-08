'use client';
import { useState } from 'react';
import { useSyncItems } from '@/lib/sync/status';
import { isCloudSyncKind } from '@/lib/sync/types';
import { captureStorageOperation } from '@/lib/storage/ownerScope';
import ActionButton from '@/components/ui/ActionButton';
import { InlineNotice } from '@/components/ui/PageChrome';

/** 本机删除与云端版本冲突时的处理入口：一条冲突一个提示条，动作直接放在条上。 */
export default function AssetSyncIssues() {
    const states = useSyncItems(), [error, setError] = useState('');
    const deletions = Object.entries(states).filter(([, state]) => state.phase === 'conflict' && state.operation === 'delete');
    if (!deletions.length && !error)
        return null;
    const keepCloudVersion = (key: string) => {
        const colon = key.indexOf(':'), kind = key.slice(0, colon), id = key.slice(colon + 1);
        if (!isCloudSyncKind(kind))
            return;
        const operation = captureStorageOperation(key);
        void import('@/lib/sync/engine')
            .then(mod => { if (operation.isCurrent())
            return mod.cancelConflictingDelete(kind, id); })
            .catch(e => { if (operation.isCurrent())
            setError(e.message); });
    };
    return <div className="flex flex-col gap-2" data-testid="asset-sync-issues">
    {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    {deletions.map(([key, state]) => <InlineNotice key={key} tone="warn" actions={<ActionButton size="sm" variant="secondary" onClick={() => keepCloudVersion(key)}>保留云端版本，取消本机删除</ActionButton>}>{state.message}</InlineNotice>)}
  </div>;
}
