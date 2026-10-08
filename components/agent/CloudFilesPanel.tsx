'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArchiveRestore, Cloud, CloudOff, FileX2, RefreshCw } from 'lucide-react';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import ActionButton, { actionClass } from '@/components/ui/ActionButton';
import Badge from '@/components/ui/Badge';
import { EmptyState, InlineNotice } from '@/components/ui/PageChrome';
import AgentAssetCard from './AgentAssetCard';
import { useCloudFileLibrary } from '@/lib/files/library';
import { cloudFileAsset, filterAssets, formatAssetSize, type AssetSort } from '@/lib/agent/assetCatalog';
import type { CloudFile } from '@/lib/files/contract';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';
import PendingAssetUploads from './PendingAssetUploads';

const size = (bytes: number) => formatAssetSize(bytes) ?? '0 MB';

/** 个人云存储用量条：已用 + 上传预留叠在同一根条上，数字落在条的下方。 */
function StorageMeter({ used, reserved, capacity }: { used: number; reserved: number; capacity: number }) {
  const total = capacity > 0 ? Math.min(100, ((used + reserved) / capacity) * 100) : 0;
  const usedPct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5" data-testid="cloud-storage-meter">
      <div
        role="meter"
        aria-label="个人云存储用量"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={used + reserved}
        className="relative h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent-weak)]" style={{ width: `${total}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${usedPct}%` }} />
      </div>
      <p className="text-[12px] tabular-nums text-[var(--ink-soft)]">
        已用 {size(used)} · 上传预留 {size(reserved)} · 上限 {size(capacity)}
      </p>
    </div>
  );
}

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

  const actions = (file: CloudFile) => {
    const busy = library.busyIds.includes(file.id);
    return <div className="flex flex-wrap items-center justify-end gap-1 px-1 pt-1.5">
      {file.state === 'ready'
        ? <>
          <Link href={`/agent/assets/file/cloud-${file.id}`} className={actionClass('ghost', 'sm')}>详情 / 引用</Link>
          <a href={`/api/files/${file.id}`} download className={actionClass('ghost', 'sm')}>下载原文件</a>
        </>
        : <ActionButton variant="secondary" size="sm" disabled={busy} onClick={() => { void library.mutate(file.id, 'complete'); }}>{busy ? '正在确认…' : '重试确认上传'}</ActionButton>}
      <ActionButton variant="danger" size="sm" disabled={busy} onClick={() => setSelected({ file, epoch: getOwnerEpoch() })}>{file.state === 'pending' ? '取消未完成上传' : '删除'}</ActionButton>
    </div>;
  };

  return <section data-testid="cloud-files-panel" className="flex flex-col gap-4">
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]"><Cloud size={18} strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-[var(--ink)]">云端文件</h2>
          <p className="text-[12px] text-[var(--ink-faint)]">每次最多 9 个附件 · 每个文件含照片最多 25MB</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ActionButton variant="ghost" disabled={library.phase === 'loading'} icon={<RefreshCw size={13} className={library.phase === 'loading' ? 'animate-spin' : undefined} />} onClick={() => { void library.refresh(); }}>刷新</ActionButton>
          <ActionButton variant="secondary" icon={trash ? <Cloud size={13} /> : <ArchiveRestore size={13} />} onClick={() => setTrash(value => !value)}>{trash ? '查看使用中的文件' : '查看已软删除文件'}</ActionButton>
        </div>
      </div>
      {usage
        ? <StorageMeter used={Number(usage.used_bytes)} reserved={Number(usage.reserved_bytes)} capacity={Number(usage.capacity_bytes)} />
        : <p className="text-[12px] text-[var(--ink-soft)]">{library.owner ? '个人额度暂未取得，上传时仍由服务端核验。' : '请先登录，查看个人云端文件。'}</p>}
      <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)]">原文件与处理结果使用同一账号的个人额度。确认软删除后，文件不再供下载或 AI 读取；云端原文件暂保留。</p>
    </div>

    {library.phase === 'loading' ? <InlineNotice tone="info">正在读取云端文件…</InlineNotice> : null}
    {library.error ? <InlineNotice tone="danger">{library.error}</InlineNotice> : null}
    {library.phase === 'ready' && !items.length
      ? <EmptyState icon={trash ? FileX2 : CloudOff} title={query ? '没有匹配的云端文件。' : trash ? '没有已软删除的文件。' : '暂无云端文件。'} description={query || trash ? undefined : '在对话里添加附件后，原文件与处理结果会保存到这里。'} />
      : null}

    <div className={view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4' : 'flex flex-col gap-1'}>{items.map(item => {
      const file = files.find(file => file.id === item.meta?.cloudFileId)!;
      return <div key={file.id} className="min-w-0">
        {trash
          ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 py-2.5 text-[13px]"><span className="min-w-0 flex-1 break-all text-[var(--ink)]">{file.name}</span><Badge tone="neutral">已软删除 · 原文件暂保留</Badge></div>
          : view === 'list'
            ? <div className="flex items-center gap-1 rounded-xl transition-colors hover:bg-[var(--bg-muted)]"><div className="min-w-0 flex-1"><AgentAssetCard item={item} view={view} /></div>{actions(file)}</div>
            : <><AgentAssetCard item={item} view={view} />{actions(file)}</>}
      </div>;
    })}</div>
    {selection ? <ConfirmDialog title="确认删除云端文件？" body={`「${selection.file.name}」将从可用资产与 AI 文件上下文移除。此操作为软删除，云端暂时保留原文件。`} cancelLabel="取消" confirmLabel={deleting ? '正在删除…' : '确认删除'} onCancel={() => { if (!deleting) setSelected(null); }} onConfirm={() => { void remove(); }} /> : null}
    <PendingAssetUploads />
  </section>;
}
