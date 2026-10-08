'use client';
import { useEffect, useState } from 'react';
import { readLocalSource, registerLocalFile } from '@/lib/local-files/client';
import { useImports } from '@/lib/stores/imports';
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
    return <div className="flex h-full flex-col gap-3 p-4"><div className="flex flex-wrap items-center gap-2 text-sm"><span>仅本机 · 第 {page}/{result.pages} 页</span><button disabled={loading || page <= 1} onClick={() => { setPage(p => p - 1); setOffset(0); }}>上一页</button><button disabled={loading || page >= result.pages} onClick={() => { setPage(p => p + 1); setOffset(0); }}>下一页</button>{result.next !== null && !loading && <button onClick={() => setOffset(result.next!)}>继续读本页</button>}</div>{loading && <p role="status">正在读取本地内容…</p>}{error ? <div role="alert"><p>{error}</p><label className="cursor-pointer underline">重新选择原文件<input type="file" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (file)
                    void registerLocalFile(file, record?.sessionId, sourceId).then(() => { setOffset(0); setPage(1); setReload(r => r + 1); }).catch(e => setResult({ ...result, key, error: e.message }));
            }}/></label></div> : <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-sm">{loading ? '' : result.text || '这一页没有可提取的文字。'}</pre>}</div>;
}
