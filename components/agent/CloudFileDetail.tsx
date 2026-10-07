'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCloudFileLibrary } from '@/lib/files/library';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useChatUI } from '@/lib/stores/chatUI';
import { fileReference } from '@/lib/files/contract';
import { formatAssetSize, formatAssetTime } from '@/lib/agent/assetCatalog';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
export default function CloudFileDetail({ fileId }: { fileId: string }) {
  const library = useCloudFileLibrary(), router = useRouter();
  const [confirmationEpoch, setConfirmationEpoch] = useState<number | null>(null);
  const file = library.files.find(row => row.id === fileId);
  const busy = library.busyIds.includes(fileId), confirming = confirmationEpoch === getOwnerEpoch();
  const usable = file?.state === 'ready';
  return <section data-testid="cloud-file-detail" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
    <Link href="/agent/assets?tab=cloud" className="text-sm text-[var(--accent-ink)]">返回云端资产</Link>
    {library.phase === 'loading' ? <p role="status">正在读取云端资产…</p> : null}
    {library.error ? <p role="alert">{library.error}</p> : null}
    {!file && library.phase === 'ready' ? <p>文件不存在或不属于当前账号。</p> : null}
    {file ? <><h1 className="break-all text-lg font-semibold">{file.name}</h1><dl className="grid grid-cols-[auto_1fr] gap-2 text-sm"><dt>大小</dt><dd>{formatAssetSize(Number(file.size_bytes))}</dd><dt>类型</dt><dd className="break-all">{file.mime_type}</dd><dt>保存于</dt><dd>{formatAssetTime(Date.parse(file.created_at))}</dd><dt>云端引用</dt><dd className="break-all">{fileReference(file.id)}</dd><dt>状态</dt><dd>{file.state === 'ready' ? '原文件与处理上下文已保存' : file.state === 'deleted' ? '已软删除，不可下载或给 AI 读取' : '上传尚未确认'}</dd></dl>
      <div className="flex flex-wrap gap-3 text-sm">{usable ? <><a href={`/api/files/${file.id}`} download className="text-[var(--accent-ink)]">下载原文件</a><button type="button" onClick={() => { useChatUI.getState().setQuotedText(`引用云端文件「${file.name}」：\n${fileReference(file.id)}`); router.push('/agent'); }}>引用到对话</button></> : null}
      {file.state === 'pending' ? <button disabled={busy} onClick={() => { void library.mutate(file.id, 'complete'); }}>重试确认上传</button> : null}
      {file.state !== 'deleted' ? <button disabled={busy} onClick={() => setConfirmationEpoch(getOwnerEpoch())} className="text-[var(--md-sys-color-error)]">删除云端文件</button> : null}</div>
      <p className="text-xs text-[var(--ink-soft)]">AI 使用稳定引用和处理后的上下文，需要时按需读取全文或图片。删除会再次确认并执行软删除，底层原文件暂保留。</p>
    </> : null}
    {file && confirming ? <ConfirmDialog title="确认删除云端文件？" body={`「${file.name}」将从可用资产和 AI 文件读取中移除，云端原文件暂保留。`} cancelLabel="取消" confirmLabel={busy ? '正在删除…' : '确认删除'} onCancel={() => { if (!busy) setConfirmationEpoch(null); }} onConfirm={() => { void library.mutate(file.id, 'delete').then(ok => { if (ok) setConfirmationEpoch(null); }); }} /> : null}
  </section>;
}
