'use client';
import { useState } from 'react';
import { useCloudAssetIndex } from '@/lib/assets/library';
import { assetApi } from '@/lib/assets/client';
import { refreshCloudSyncNow } from '@/lib/sync/schedule';
import { useFileLibrary } from '@/lib/files/library';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
export default function AssetTrashPanel() {
    const library = useCloudAssetIndex(), [target, setTarget] = useState<{
        id: string;
        epoch: number;
        expectedRevision?: number;
    } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <div className="flex flex-col gap-3 p-4"><h2 className="font-semibold">云端回收站</h2><p className="text-sm">软删除内容暂时保留，个人有效额度已释放。恢复前会重新检查额度。</p>{(error || library.error) && <p role="alert">{error || library.error}</p>}{library.loading && <p role="status">正在读取回收站…</p>}{library.trash.map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded border p-3"><span>{row.title}</span><button disabled={busy || row.metadata.originalMissing===true} onClick={() => setTarget({ id: row.id, epoch: getOwnerEpoch(), expectedRevision: Number(row.metadata.revision) })}>{row.metadata.originalMissing===true?'旧记录没有可恢复原稿':'恢复'}</button></div>)}{!library.loading && !library.error && !library.trash.length && <p>回收站为空。</p>}{target && <ConfirmDialog title="恢复云端资产？" body="恢复会重新占用个人空间。空间不足时内容仍留在回收站。" cancelLabel="取消" confirmLabel="恢复" onCancel={() => setTarget(null)} onConfirm={() => {
                if (target.epoch !== getOwnerEpoch()) {
                    setTarget(null);
                    return;
                }
                setBusy(true);
                void assetApi('', { method: 'POST', body: JSON.stringify({ operation: 'restore', assetId: target.id, expectedRevision: target.expectedRevision, confirmed: true }) }).then(async () => { await library.refresh(); await useFileLibrary.getState().refresh(); await refreshCloudSyncNow(); }).catch(e => setError(e.message)).finally(() => { setBusy(false); setTarget(null); });
            }}/>}</div>;
}
