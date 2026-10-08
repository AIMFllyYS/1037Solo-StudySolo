'use client';
import { useEffect, useState } from 'react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import { assetApi } from '@/lib/assets/client';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import ActionButton from '@/components/ui/ActionButton';
import { InlineNotice } from '@/components/ui/PageChrome';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';

/** 产物上传到一半被中断时留下的预留：这里可以刷新、可以取消预留。没有未完成上传时整块不出现。 */
export default function PendingAssetUploads() {
    const [rows, setRows] = useState<{
        id: string;
        title: string;
    }[]>([]), [error, setError] = useState(''), [target, setTarget] = useState<{
        id: string;
        epoch: number;
    } | null>(null), [busy, setBusy] = useState(false);
    const refresh = async () => {
        try {
            const result = await assetApi('?pending=1');
            setRows(result.uploads);
            setError('');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '上传记录读取失败。');
        }
    };
    useEffect(() => {
        let active = true;
        void assetApi('?pending=1').then(result => {
            if (active)
                setRows(result.uploads);
        }).catch(error => {
            if (active)
                setError(error.message);
        });
        return () => { active = false; };
    }, []);
    if (!rows.length && !error)
        return null;
    return <section className="flex flex-col gap-2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4" data-testid="pending-asset-uploads">
        <div className="flex items-center gap-2">
            <CloudUpload size={15} aria-hidden className="text-[var(--ink-faint)]" />
            <h3 className="text-[13px] font-semibold text-[var(--ink)]">产物未完成上传</h3>
            <ActionButton className="ml-auto" size="sm" variant="ghost" disabled={busy} icon={<RefreshCw size={12} />} onClick={() => void refresh()}>刷新上传记录</ActionButton>
        </div>
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        <ul className="flex flex-col gap-1">
            {rows.map(row => <li key={row.id} className="flex items-center gap-3 rounded-lg px-1 py-1">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]" title={row.title}>{row.title}</span>
                <ActionButton size="sm" variant="danger" onClick={() => setTarget({ id: row.id, epoch: getOwnerEpoch() })}>取消上传预留</ActionButton>
            </li>)}
        </ul>
        {target && <ConfirmDialog title="取消未完成上传？" body="释放本次未提交的上传预留，本机内容和已保存版本保留。" cancelLabel="保留" confirmLabel="取消上传" onCancel={() => setTarget(null)} onConfirm={() => {
                if (target.epoch !== getOwnerEpoch()) {
                    setTarget(null);
                    return;
                }
                setBusy(true);
                void assetApi('', { method: 'POST', body: JSON.stringify({ operation: 'cancel', assetId: target.id, confirmed: true }) }).then(refresh).catch(e => setError(e.message)).finally(() => { setBusy(false); setTarget(null); });
            }}/>}
    </section>;
}
