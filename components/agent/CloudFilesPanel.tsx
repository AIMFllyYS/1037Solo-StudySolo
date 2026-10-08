'use client';
import { useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import AgentAssetCard from './AgentAssetCard';
import { useCloudFileLibrary } from '@/lib/files/library';
import { cloudFileAsset, filterAssets, type AssetSort } from '@/lib/agent/assetCatalog';
import type { CloudFile } from '@/lib/files/contract';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
import PendingAssetUploads from './PendingAssetUploads';

export default function CloudFilesPanel({ query = '', sort = 'recent', view = 'list' }: { query?: string; sort?: AssetSort; view?: 'grid'|'list' }) {
  const library = useCloudFileLibrary();
  const [selected, setSelected] = useState<{ file: CloudFile; epoch: number } | null>(null);
  const [trash, setTrash] = useState(false);
  const files = library.files.filter(file => trash ? file.state === 'deleted' : file.state === 'ready' || file.state === 'pending');
  const items = filterAssets(files.map(cloudFileAsset), { query, sort });
  const selection = selected?.epoch === getOwnerEpoch() ? selected : null;
  const deleting = !!selection && library.busyIds.includes(selection.file.id);
  const remove = async () => { if (selection && await library.mutate(selection.file.id, 'delete')) setSelected(null); };
  const usage = library.storage;
  return <section data-testid="cloud-files-panel" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3 text-sm"><strong>云端文件</strong><span className="text-[var(--ink-soft)]">每次最多 9 个附件 · 每个文件含照片最多 25MB</span><button type="button" disabled={library.phase === 'loading'} onClick={() => { void library.refresh(); }}>刷新</button><button type="button" onClick={() => setTrash(value => !value)}>{trash ? '查看使用中的文件' : '查看已软删除文件'}</button></div>
    <p className="text-xs text-[var(--ink-soft)]">原文件与处理结果使用同一账号的个人额度。确认软删除后，文件不再供下载或 AI 读取；云端原文件暂保留。</p>
    {usage ? <p className="text-sm">个人云存储：已用 {(Number(usage.used_bytes) / 1024 / 1024).toFixed(1)} MB · 上传预留 {(Number(usage.reserved_bytes) / 1024 / 1024).toFixed(1)} MB · 上限 {(Number(usage.capacity_bytes) / 1024 / 1024).toFixed(1)} MB</p> : <p className="text-xs text-[var(--ink-soft)]">{library.owner ? '个人额度暂未取得，上传时仍由服务端核验。' : '请先登录，查看个人云端文件。'}</p>}
    {library.phase === 'loading' ? <p role="status">正在读取云端文件…</p> : null}
    {library.error ? <p role="alert" className="text-sm text-[var(--md-sys-color-error)]">{library.error}</p> : null}
    {library.phase === 'ready' && !items.length ? <p className="text-sm">{query ? '没有匹配的云端文件。' : trash ? '没有已软删除的文件。' : '暂无云端文件。'}</p> : null}
    <div className={view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3' : 'flex flex-col gap-2'}>{items.map(item => {
      const file = files.find(file => file.id === item.meta?.cloudFileId)!;
      const busy = library.busyIds.includes(file.id);
      return <div key={file.id} className="min-w-0">
        {trash ? <div className="rounded-lg border border-[var(--line-soft)] p-3 text-sm"><span className="break-all">{file.name}</span><span className="ml-2 text-xs text-[var(--ink-soft)]">已软删除 · 原文件暂保留</span></div> : <AgentAssetCard item={item} view={view} />}
        {!trash ? <div className="flex flex-wrap items-center justify-end gap-3 px-3 py-2 text-xs">
          {file.state === 'ready' ? <><Link href={`/agent/assets/file/cloud-${file.id}`} className="text-[var(--accent-ink)]">详情 / 引用</Link><a href={`/api/files/${file.id}`} download className="text-[var(--accent-ink)]">下载原文件</a></> : <button type="button" disabled={busy} onClick={() => { void library.mutate(file.id, 'complete'); }}>{busy ? '正在确认…' : '重试确认上传'}</button>}
          <button type="button" disabled={busy} onClick={() => setSelected({ file, epoch: getOwnerEpoch() })} className="text-[var(--md-sys-color-error)]">{file.state === 'pending' ? '取消未完成上传' : '删除'}</button>
        </div> : null}
      </div>;
    })}</div>
    {selection ? <ConfirmDialog title="确认删除云端文件？" body={`「${selection.file.name}」将从可用资产与 AI 文件上下文移除。此操作为软删除，云端暂时保留原文件。`} cancelLabel="取消" confirmLabel={deleting ? '正在删除…' : '确认删除'} onCancel={() => { if (!deleting) setSelected(null); }} onConfirm={() => { void remove(); }} /> : null}
    <PendingAssetUploads />
  </section>;
}
