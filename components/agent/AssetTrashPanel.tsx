'use client';
import { useState } from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useCloudAssetIndex } from '@/lib/assets/library';
import { assetApi } from '@/lib/assets/client';
import { refreshCloudSyncNow } from '@/lib/sync/schedule';
import { useFileLibrary } from '@/lib/files/library';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import ActionButton from '@/components/ui/ActionButton';
import { EmptyState, InlineNotice } from '@/components/ui/PageChrome';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';

/** 云端回收站：软删除内容暂时保留，个人有效额度已释放；恢复前重新检查额度。 */
export default function AssetTrashPanel() {
    const library = useCloudAssetIndex(), [target, setTarget] = useState<{
        id: string;
        epoch: number;
        expectedRevision?: number;
    } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <section className="flex flex-col gap-3" data-testid="asset-trash-panel">
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]"><Trash2 size={18} strokeWidth={1.75} /></span>
            <div className="min-w-0">
                <h2 className="text-[13.5px] font-semibold text-[var(--ink)]">云端回收站</h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-faint)]">软删除内容暂时保留，个人有效额度已释放。恢复前会重新检查额度。</p>
            </div>
        </div>
        {(error || library.error) && <InlineNotice tone="danger">{error || library.error}</InlineNotice>}
        {library.loading && <InlineNotice tone="info">正在读取回收站…</InlineNotice>}
        <ul className="flex flex-col gap-1.5">
            {library.trash.map(row => {
                const missing = row.metadata.originalMissing === true;
                return <li key={row.id} className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]" title={row.title}>{row.title}</span>
                    <ActionButton size="sm" variant="secondary" icon={<ArchiveRestore size={13} />} disabled={busy || missing} onClick={() => setTarget({ id: row.id, epoch: getOwnerEpoch(), expectedRevision: Number(row.metadata.revision) })}>{missing ? '旧记录没有可恢复原稿' : '恢复'}</ActionButton>
                </li>;
            })}
        </ul>
        {!library.loading && !library.error && !library.trash.length && <EmptyState icon={Trash2} title="回收站为空。" />}
        {target && <ConfirmDialog title="恢复云端资产？" body="恢复会重新占用个人空间。空间不足时内容仍留在回收站。" cancelLabel="取消" confirmLabel="恢复" onCancel={() => setTarget(null)} onConfirm={() => {
                if (target.epoch !== getOwnerEpoch()) {
                    setTarget(null);
                    return;
                }
                setBusy(true);
                void assetApi('', { method: 'POST', body: JSON.stringify({ operation: 'restore', assetId: target.id, expectedRevision: target.expectedRevision, confirmed: true }) }).then(async () => { await library.refresh(); await useFileLibrary.getState().refresh(); await refreshCloudSyncNow(); }).catch(e => setError(e.message)).finally(() => { setBusy(false); setTarget(null); });
            }}/>}
    </section>;
}
