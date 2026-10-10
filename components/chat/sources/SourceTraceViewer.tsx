'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BookOpen, Globe } from 'lucide-react';
import EmbedFallback from '@/components/browser/EmbedFallback';
import WebviewSite from '@/components/browser/WebviewSite';
import ManagedWindow from '@/components/window/ManagedWindow';
import DocumentWorkspace, { type DocumentOutlineGroup } from '@/components/window/DocumentWorkspace';
import NoteRenderer from '@/components/notes/NoteRenderer';
import PlainTextReader from '@/components/notes/PlainTextReader';
import { SOURCE_TRACE_WINDOW_ID, sourceItemKey } from '@/lib/chat/sources/openSourceTrace';
import type { SourceRound, TraceSource } from '@/lib/chat/sources/traceSources';
import { getToolPresentation } from '@/lib/ai/agent/tools/presentations';
import { noteBreadcrumb, noteHref, parseNotePath } from '@/lib/content/notePath';
import { useEmbeddable } from '@/lib/hooks/files/useEmbeddable';
import { useWindowManager } from '@/lib/stores/workspace/windowManager';
import { safeHttpUrl } from '@/components/browser/safeUrl';
import { useT } from '@/lib/i18n/index';

type LoadState = 'idle' | 'loading' | 'done' | 'missing' | 'error';
type SectionFormat = 'markdown' | 'text' | 'html';

/** 目录里的一条来源。group 只在窗口带 rounds 时出现（同组连续项共用一条标题）。 */
interface TraceOutlineEntry {
  key: string;
  source: TraceSource;
  group?: DocumentOutlineGroup;
}

export default function SourceTraceViewer() {
  const windows = useWindowManager((s) => s.windows);
  const ids = windows.filter((win) => win.type === 'source-trace-viewer').map((win) => win.id);
  if (ids.length === 0) return null;
  return (
    <>
      {ids.map((id) => (
        <SourceTraceWindow key={id} windowId={id} />
      ))}
    </>
  );
}

function SourceTraceWindow({ windowId }: { windowId: string }) {
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === windowId));
  const closeWindow = useWindowManager((s) => s.closeWindow);
  const updateWindow = useWindowManager((s) => s.updateWindow);
  const handleClose = useCallback(() => closeWindow(windowId), [closeWindow, windowId]);
  const t = useT();

  const sources = useMemo(() => {
    const raw = (managed?.data as { sources?: TraceSource[] } | undefined)?.sources;
    return Array.isArray(raw) ? raw : [];
  }, [managed?.data]);
  const rounds = useMemo(() => {
    const raw = (managed?.data as { rounds?: SourceRound[] } | undefined)?.rounds;
    return Array.isArray(raw) ? raw : [];
  }, [managed?.data]);

  // 目录项：带 rounds 时按检索轮次铺（每组首条挂分组标题），否则维持旧的「一条来源一项」。
  const entries = useMemo<TraceOutlineEntry[]>(() => {
    if (!rounds.length) {
      return sources.map((source, index) => ({ key: sourceItemKey(source, index), source }));
    }
    const items: TraceOutlineEntry[] = [];
    let index = 0;
    for (const round of rounds) {
      // 组标题用工具既有的展示名（TOOL_PRESENTATION），不新增文案；round.label 留给调用方覆盖。
      const presentation = getToolPresentation(round.tool);
      const label = round.label || (presentation ? t(presentation.labelKey) : undefined) || round.tool;
      for (const source of round.sources) {
        items.push({
          key: sourceItemKey(source, index),
          source,
          group: { id: round.id, label, meta: round.query || undefined },
        });
        index += 1;
      }
    }
    return items;
  }, [rounds, sources, t]);

  // 索引仍按扁平列表数：entries 与窗口 data 的 sources 同序，点选键因此与旧版一致。
  const activeKey = (managed?.data as { activeKey?: string } | undefined)?.activeKey ?? (entries[0] ? entries[0].key : '');
  const activeIndex = Math.max(0, entries.findIndex((entry) => entry.key === activeKey));
  const activeEntry = entries[activeIndex] ?? entries[0];
  const active = activeEntry?.source ?? sources[0];
  // 选中键一律回落到真实存在的目录项：data 里的 activeKey 可能是上一次的残留。
  const activeEntryKey = activeEntry?.key ?? activeKey;

  if (!managed) return null;

  return (
    <ManagedWindow
      windowId={windowId}
      title={managed.title}
      icon={active?.kind === 'web' ? <Globe size={15} /> : <BookOpen size={15} />}
      onClose={handleClose}
      fullscreenTarget="notes"
      minSize={{ minW: 520, minH: 360 }}
      className="source-trace-window"
      overlayId={windowId === SOURCE_TRACE_WINDOW_ID ? 'source-trace-viewer' : `source-trace-${windowId}`}
      externalLink={
        active?.kind === 'web' && safeHttpUrl(active.url)
          ? { onOpen: () => window.open(safeHttpUrl(active.url), '_blank', 'noopener,noreferrer'), label: t('window.source.openOriginal') }
          : active?.kind === 'note'
            ? (() => {
                const parsed = parseNotePath(active.path);
                return parsed ? { onOpen: () => { window.open(noteHref(parsed), '_blank', 'noopener'); } } : false;
              })()
            : false
      }
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      {entries.length === 0 ? (
        <p className="source-trace-empty">{t('agent.sources.empty')}</p>
      ) : (
        <DocumentWorkspace
          layoutKey="source-trace"
          outlineLabel={t('window.source.outline')}
          outline={entries.map((entry) => ({
            id: entry.key,
            kindLabel: entry.source.kind === 'note' ? t('window.source.kindNote') : t('window.source.kindWeb'),
            title: entry.source.title,
            meta: entry.source.kind === 'note' ? entry.source.path : entry.source.url || t('window.source.noLink'),
            metaWrap: entry.source.kind === 'web',
            group: entry.group,
          }))}
          activeId={activeEntryKey}
          onSelect={(id) =>
            // rounds 必须一起写回：updateWindow 是整块替换 data，漏了它点一次来源分组就没了。
            updateWindow(windowId, {
              data: rounds.length ? { sources, rounds, activeKey: id } : { sources, activeKey: id },
            })
          }
        >
          {active.kind === 'note' ? <NoteSourceStage source={active} /> : <WebSourceStage source={active} />}
        </DocumentWorkspace>
      )}
    </ManagedWindow>
  );
}

function NoteSourceStage({ source }: { source: Extract<TraceSource, { kind: 'note' }> }) {
  const cacheRef = useRef<Map<string, { content: string; format: SectionFormat }>>(new Map());
  const t = useT();
  const [status, setStatus] = useState<LoadState>('idle');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<SectionFormat>('markdown');
  const [error, setError] = useState<string | null>(null);
  const parsed = parseNotePath(source.path);
  const heading = parsed ? noteBreadcrumb(parsed, source.title) : source.title;

  useEffect(() => {
    const loc = parseNotePath(source.path);
    const cached = cacheRef.current.get(source.path);
    if (cached) {
      setContent(cached.content);
      setFormat(cached.format);
      setStatus('done');
      setError(null);
      return;
    }
    if (!loc) {
      setContent(source.snippet || '');
      setFormat('markdown');
      setStatus('missing');
      setError(t('window.source.parseNotePathFailed'));
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    const params = new URLSearchParams({
      subjectId: loc.subjectId,
      categoryId: loc.categoryId,
      itemId: loc.itemId,
    });
    fetch(`/api/section?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(t('window.source.readFailedWithStatus', { status: res.status }));
        return res.json() as Promise<{ content?: string | null; format?: SectionFormat | null }>;
      })
      .then((data) => {
        const text = typeof data.content === 'string' ? data.content : '';
        const fmt: SectionFormat = data.format === 'text' || data.format === 'html' ? data.format : 'markdown';
        if (text.trim()) {
          cacheRef.current.set(source.path, { content: text, format: fmt });
          setContent(text);
          setFormat(fmt);
          setStatus('done');
        } else {
          setContent(source.snippet || '');
          setFormat('markdown');
          setStatus('missing');
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setContent(source.snippet || '');
        setFormat('markdown');
        setStatus('error');
        setError(err instanceof Error ? err.message : t('window.source.readNoteFailed'));
      });
    return () => controller.abort();
  }, [source.path, source.snippet, source.title, t]);

  return (
    <div className="note-citation-body h-full overflow-auto bg-[var(--bg-panel)] p-4">
      {source.snippet ? (
        <div className="note-citation-snippet">
          <div className="note-citation-snippet-label">{t('window.source.snippet')}</div>
          <p>{source.snippet}</p>
        </div>
      ) : null}
      {status === 'loading' ? <p className="note-citation-status">{t('window.source.readingNote')}</p> : null}
      {status === 'error' ? <p className="note-citation-status is-error">{error || t('window.state.readFailed')}</p> : null}
      {status === 'missing' ? <p className="note-citation-status">{t('window.source.missingFullText')}</p> : null}
      {content ? (
        format === 'html' ? (
          <iframe srcDoc={content} sandbox="allow-popups" className="h-full min-h-[320px] w-full flex-1 border-0" title={heading} />
        ) : format === 'text' ? (
          <PlainTextReader content={content} />
        ) : (
          <div className="prose-notes note-citation-prose">
            <NoteRenderer content={content} />
          </div>
        )
      ) : null}
    </div>
  );
}

function WebSourceAddressBar({ url }: { url: string }) {
  const t = useT();
  const safeUrl = safeHttpUrl(url);
  return (
    <div className="web-source-address-bar" data-testid="web-source-address">
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="web-source-address-link"
          title={url}
        >
          {url}
        </a>
      ) : (
        <span className="web-source-address-missing">{t('window.source.missingLink')}</span>
      )}
    </div>
  );
}

function WebSourceStage({ source }: { source: Extract<TraceSource, { kind: 'web' }> }) {
  const isDesktop = useSyncExternalStore(
    () => () => {},
    () => !!(window as unknown as { desktop?: { isElectron?: boolean } }).desktop?.isElectron,
    () => false,
  );
  // 来源 url 出自检索/工具结果，非 http(s) 的 scheme（javascript:/data:/file:）
  // 不允许进 iframe src / 地址栏链接 / webview。
  const safeUrl = safeHttpUrl(source.url);
  const { blocked, reason, forceEmbed } = useEmbeddable(isDesktop ? null : safeUrl || null);
  const [loadFailed, setLoadFailed] = useState(false);
  const t = useT();
  const showFallback = !safeUrl || (!isDesktop && (blocked || loadFailed));
  const address = <WebSourceAddressBar url={source.url} />;

  if (showFallback) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg-panel)]">
        {address}
        <div className="note-citation-snippet m-4">
          <div className="note-citation-snippet-label">{t('window.source.summary')}</div>
          <p className="text-[13px] font-semibold text-[var(--ink)]">{source.title}</p>
          {source.snippet ? <p className="mt-2 text-[13px] leading-6 text-[var(--ink)]">{source.snippet}</p> : null}
        </div>
        <details className="mx-4 mb-3 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-[var(--ink-soft)]">{t('window.source.rawJson')}</summary>
          <pre className="mt-2 overflow-auto text-[11px] leading-5 text-[var(--ink)]">{JSON.stringify(source, null, 2)}</pre>
        </details>
        {safeUrl ? (
          <div className="min-h-48 flex-1">
            <EmbedFallback url={safeUrl} reason={reason || (loadFailed ? t('window.state.pageLoadFailed') : undefined)} onForce={() => { setLoadFailed(false); forceEmbed(); }} />
          </div>
        ) : null}
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {address}
        <div className="min-h-0 flex-1">
          <WebviewSite url={safeUrl} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {address}
      <iframe
        key={safeUrl}
        src={safeUrl}
        title={source.title}
        className="h-full min-h-0 w-full flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads allow-modals"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-read; clipboard-write"
        referrerPolicy="no-referrer-when-downgrade"
        onError={() => setLoadFailed(true)}
        onLoad={(event) => {
          try {
            const doc = event.currentTarget.contentDocument;
            if (doc && (doc.URL === 'about:blank' || !doc.body?.childElementCount)) setLoadFailed(true);
          } catch {
            /* cross-origin: treated as rendered */
          }
        }}
      />
    </div>
  );
}
