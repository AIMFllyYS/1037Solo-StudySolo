'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSearch, MessageSquareQuote, RefreshCw, Trash2 } from 'lucide-react';
import { useCloudFileLibrary } from '@/lib/files/library';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import ActionButton, { actionClass } from '@/components/ui/ActionButton';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import { EmptyState, InlineNotice, PageShell } from '@/components/ui/PageChrome';
import FileTypeIcon, { resolveFileGlyphKind } from '@/components/icons/file-types/FileTypeIcon';
import { useChatUI } from '@/lib/stores/chatUI';
import { fileReference } from '@/lib/files/contract';
import { formatAssetSize, formatAssetTime } from '@/lib/agent/assetCatalog';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';

const STATE_VIEW: Record<'ready' | 'deleted' | 'pending', { tone: BadgeTone; label: string; note: string }> = {
  ready: { tone: 'accent', label: '可用', note: '原文件与处理上下文已保存' },
  deleted: { tone: 'neutral', label: '已软删除', note: '已软删除，不可下载或给 AI 读取' },
  pending: { tone: 'warn', label: '待确认', note: '上传尚未确认' },
};

export default function CloudFileDetail({ fileId }: { fileId: string }) {
  const library = useCloudFileLibrary(), router = useRouter();
  const [confirmationEpoch, setConfirmationEpoch] = useState<number | null>(null);
  const file = library.files.find(row => row.id === fileId);
  const busy = library.busyIds.includes(fileId), confirming = confirmationEpoch === getOwnerEpoch();
  const usable = file?.state === 'ready';
  const view = file ? STATE_VIEW[file.state as keyof typeof STATE_VIEW] ?? STATE_VIEW.pending : null;
  return <PageShell data-testid="cloud-file-detail">
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line-soft)] px-5 py-3">
      <Link href="/agent/assets?tab=cloud" className={actionClass('secondary', 'md')}><ArrowLeft size={14} />返回云端资产</Link>
      <span className="text-[11.5px] text-[var(--ink-faint)]">我的资产 / 云端文件</span>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-5 py-6">
        {library.phase === 'loading' ? <InlineNotice tone="info">正在读取云端资产…</InlineNotice> : null}
        {library.error ? <InlineNotice tone="danger">{library.error}</InlineNotice> : null}
        {!file && library.phase === 'ready' ? <EmptyState icon={FileSearch} title="文件不存在或不属于当前账号。" /> : null}
        {file && view ? <>
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
              <FileTypeIcon kind={resolveFileGlyphKind({ mimeType: file.mime_type, name: file.name })} mimeType={file.mime_type} name={file.name} size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="break-all text-[17px] font-semibold leading-snug text-[var(--ink)]">{file.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2"><Badge tone={view.tone} dot>{view.label}</Badge><span className="text-[12px] text-[var(--ink-faint)]">{view.note}</span></div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {usable ? <>
              <a href={`/api/files/${file.id}`} download className={actionClass('secondary', 'md')}><Download size={14} />下载原文件</a>
              <ActionButton icon={<MessageSquareQuote size={14} />} onClick={() => { useChatUI.getState().setQuotedText(`引用云端文件「${file.name}」：\n${fileReference(file.id)}`); router.push('/agent'); }}>引用到对话</ActionButton>
            </> : null}
            {file.state === 'pending' ? <ActionButton variant="primary" disabled={busy} icon={<RefreshCw size={14} />} onClick={() => { void library.mutate(file.id, 'complete'); }}>重试确认上传</ActionButton> : null}
            {file.state !== 'deleted' ? <ActionButton variant="danger" disabled={busy} icon={<Trash2 size={14} />} onClick={() => setConfirmationEpoch(getOwnerEpoch())}>删除云端文件</ActionButton> : null}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 text-[12.5px]">
            <dt className="text-[var(--ink-faint)]">大小</dt><dd className="text-[var(--ink)]">{formatAssetSize(Number(file.size_bytes)) ?? '—'}</dd>
            <dt className="text-[var(--ink-faint)]">类型</dt><dd className="break-all text-[var(--ink)]">{file.mime_type}</dd>
            <dt className="text-[var(--ink-faint)]">保存于</dt><dd className="text-[var(--ink)]">{formatAssetTime(Date.parse(file.created_at))}</dd>
            <dt className="text-[var(--ink-faint)]">云端引用</dt><dd className="break-all font-mono text-[11.5px] text-[var(--ink-soft)]">{fileReference(file.id)}</dd>
          </dl>
          <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)]">AI 使用稳定引用和处理后的上下文，需要时按需读取全文或图片。删除会再次确认并执行软删除，底层原文件暂保留。</p>
        </> : null}
      </div>
    </div>
    {file && confirming ? <ConfirmDialog title="确认删除云端文件？" body={`「${file.name}」将从可用资产和 AI 文件读取中移除，云端原文件暂保留。`} cancelLabel="取消" confirmLabel={busy ? '正在删除…' : '确认删除'} onCancel={() => { if (!busy) setConfirmationEpoch(null); }} onConfirm={() => { void library.mutate(file.id, 'delete').then(ok => { if (ok) setConfirmationEpoch(null); }); }} /> : null}
  </PageShell>;
}
