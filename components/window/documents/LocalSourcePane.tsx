'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, FileUp, HardDrive } from 'lucide-react';
import { readLocalSource, registerLocalFile } from '@/lib/local-files/client';
import { useImports } from '@/lib/stores/assets/imports';
import ActionButton from '@/components/ui/ActionButton';
import Badge from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/PageChrome';
import { PanelSkeleton } from '@/components/shared/LoadingStates';

/**
 * 本机文件阅读窗：只从本机读取，不上云。顶部是「仅本机」标识 + 翻页，正文是可读的纯文本；
 * 读取失败（文件被移动 / 权限变化）时给出「重新选择原文件」的恢复入口，而不是一行红字。
 */
export default function LocalSourcePane({ sourceId }: {
    sourceId: string;
}) {
    const record = useImports(state => state.byId[sourceId]);
    const [page, setPage] = useState(1), [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
    const key = `${sourceId}:${record?.sourceVersion}:${page}:${offset}:${reload}`;
    const [result, setResult] = useState<{
        key: string;
        pages: number;
        text: string;
        error: string;
        next: number | null;
    }>({ key: '', pages: 1, text: '', error: '', next: null });
    const loading = result.key !== key, error = loading ? '' : result.error;
    useEffect(() => {
        const abort = new AbortController();
        void (async () => {
            const catalog = await readLocalSource(sourceId, { operation: 'catalog' }, abort.signal) as {
                pages: number;
            };
            const value = await readLocalSource(sourceId, { operation: 'read', page, offset }, abort.signal) as {
                text: string;
                nextOffset: number | null;
            };
            if (!abort.signal.aborted)
                setResult({ key, pages: catalog.pages, text: value.text, error: '', next: value.nextOffset });
        })().catch(e => {
            if (!abort.signal.aborted)
                setResult({ key, pages: 1, text: '', error: e instanceof Error ? e.message : '读取失败', next: null });
        });
        return () => abort.abort();
    }, [sourceId, page, offset, key]);
    const reselect = <label className="inline-flex cursor-pointer">
        <span className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 text-[12.5px] font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)]"><FileUp size={14} aria-hidden />重新选择原文件</span>
        <input type="file" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            if (file)
                void registerLocalFile(file, record?.sessionId, sourceId).then(() => { setOffset(0); setPage(1); setReload(r => r + 1); }).catch(e => setResult({ ...result, key, error: e.message }));
        }}/>
    </label>;
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-col" data-testid="local-source-pane">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2">
            <Badge tone="neutral" icon={<HardDrive size={11} />}>仅本机</Badge>
            <span className="text-[12px] tabular-nums text-[var(--ink-soft)]">第 {page}/{result.pages} 页</span>
            <div className="ml-auto flex items-center gap-1.5">
                <ActionButton size="sm" variant="secondary" icon={<ChevronLeft size={13} />} disabled={loading || page <= 1} onClick={() => { setPage(p => p - 1); setOffset(0); }}>上一页</ActionButton>
                <ActionButton size="sm" variant="secondary" disabled={loading || page >= result.pages} onClick={() => { setPage(p => p + 1); setOffset(0); }}>下一页<ChevronRight size={13} aria-hidden /></ActionButton>
                {result.next !== null && !loading && <ActionButton size="sm" variant="ghost" onClick={() => setOffset(result.next!)}>继续读本页</ActionButton>}
            </div>
        </div>
        {loading ? <div className="min-h-0 flex-1"><PanelSkeleton variant="document" label="正在读取本地内容…" /></div>
            : error ? <div role="alert" className="min-h-0 flex-1"><EmptyState icon={AlertCircle} title={error} description="文件可能已被移动或权限已变化。" action={reselect} /></div>
                : <div className="min-h-0 flex-1 overflow-auto px-5 py-4"><div className="mx-auto max-w-[760px] whitespace-pre-wrap text-[13px] leading-[1.8] text-[var(--ink)]">{result.text || <span className="text-[var(--ink-faint)]">这一页没有可提取的文字。</span>}</div></div>}
    </div>;
}
