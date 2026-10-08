'use client';
import { useEffect, useState } from 'react';
import { assetApi } from '@/lib/assets/client';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
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
    return <div className="flex flex-col gap-2 p-3"><strong>产物未完成上传</strong>{error && <p role="alert">{error}</p>}<button disabled={busy} onClick={() => void refresh()}>刷新上传记录</button>{rows.map(row => <div key={row.id} className="flex justify-between gap-3"><span>{row.title}</span><button onClick={() => setTarget({ id: row.id, epoch: getOwnerEpoch() })}>取消上传预留</button></div>)}{target && <ConfirmDialog title="取消未完成上传？" body="释放本次未提交的上传预留，本机内容和已保存版本保留。" cancelLabel="保留" confirmLabel="取消上传" onCancel={() => setTarget(null)} onConfirm={() => {
                if (target.epoch !== getOwnerEpoch()) {
                    setTarget(null);
                    return;
                }
                setBusy(true);
                void assetApi('', { method: 'POST', body: JSON.stringify({ operation: 'cancel', assetId: target.id, confirmed: true }) }).then(refresh).catch(e => setError(e.message)).finally(() => { setBusy(false); setTarget(null); });
            }}/>}</div>;
}
