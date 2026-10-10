'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useNoteCitations, NOTE_CITATION_WINDOW_ID } from '@/lib/stores/learning/noteCitations';
import { useWindowManager } from '@/lib/stores/workspace/windowManager';
import ManagedWindow from '@/components/window/ManagedWindow';
import NoteRenderer from '@/components/notes/NoteRenderer';
import PlainTextReader from '@/components/notes/PlainTextReader';
import { noteBreadcrumb, noteHref, parseNotePath } from '@/lib/content/notePath';
import type { SearchHit } from '@/lib/ai/agent/toolTypes';
import { useT } from '@/lib/i18n/index';

type LoadState = 'idle' | 'loading' | 'done' | 'missing' | 'error';
type SectionFormat = 'markdown' | 'text' | 'html';
interface CachedSection { content: string; format: SectionFormat }

export default function NoteCitationViewer() {
  const hits = useNoteCitations((s) => s.hits);
  const activePath = useNoteCitations((s) => s.activePath);
  if (!activePath || hits.length === 0) return null;
  return <NoteCitationViewerWindow hits={hits} activePath={activePath} />;
}

function NoteCitationViewerWindow({ hits, activePath }: { hits: SearchHit[]; activePath: string }) {
  const setActivePath = useNoteCitations((s) => s.setActivePath);
  const closeViewer = useNoteCitations((s) => s.closeViewer);
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === NOTE_CITATION_WINDOW_ID));
  const cacheRef = useRef<Map<string, CachedSection>>(new Map());
  const t = useT();
  const [status, setStatus] = useState<LoadState>('idle');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<SectionFormat>('markdown');
  const [error, setError] = useState<string | null>(null);

  const active = hits.find((hit) => hit.path === activePath) ?? hits[0];
  const parsed = active ? parseNotePath(active.path) : null;

  useEffect(() => {
    if (!active) return;
    const cached = cacheRef.current.get(active.path);
    if (cached) {
      setContent(cached.content);
      setFormat(cached.format);
      setStatus('done');
      setError(null);
      return;
    }
    setContent('');
    const loc = parseNotePath(active.path);
    if (!loc) {
      setContent(active.snippet || '');
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
        const fmt: SectionFormat =
          data.format === 'text' || data.format === 'html' ? data.format : 'markdown';
        if (text.trim()) {
          cacheRef.current.set(active.path, { content: text, format: fmt });
          setContent(text);
          setFormat(fmt);
          setStatus('done');
        } else {
          setContent(active.snippet || '');
          setFormat('markdown');
          setStatus('missing');
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setContent(active.snippet || '');
        setFormat('markdown');
        setStatus('error');
        setError(err instanceof Error ? err.message : t('window.source.readNoteFailed'));
      });
    return () => controller.abort();
  }, [active, t]);

  if (!managed || !active) return null;

  const heading = parsed ? noteBreadcrumb(parsed, active.title) : active.title;

  return (
    <ManagedWindow
      windowId={NOTE_CITATION_WINDOW_ID}
      title={heading}
      icon={<BookOpen size={15} />}
      onClose={closeViewer}
      fullscreenTarget="notes"
      minSize={{ minW: 480, minH: 360 }}
      className="note-citation-window"
      overlayId="note-citation-viewer"
      externalLink={
        parsed
          ? { onOpen: () => { window.open(noteHref(parsed), '_blank', 'noopener'); } }
          : false
      }
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      unmountWhenMinimized
    >
      <div className="note-citation-layout">
        <nav className="note-citation-sidebar" aria-label={t('window.source.citationList')}>
          {hits.map((hit, index) => {
            const selected = hit.path === active.path;
            return (
              <button
                key={`${hit.path}:${index}`}
                type="button"
                data-no-drag
                className={`note-citation-nav-item${selected ? ' is-active' : ''}`}
                onClick={() => setActivePath(hit.path)}
              >
                <span className="note-citation-nav-title">{hit.title}</span>
                <span className="note-citation-nav-path">{hit.path}</span>
              </button>
            );
          })}
        </nav>
        <div className="note-citation-body">
          {active.snippet ? (
            <div className="note-citation-snippet">
              <div className="note-citation-snippet-label">{t('window.source.snippet')}</div>
              <p>{active.snippet}</p>
            </div>
          ) : null}
          {status === 'loading' ? (
            <p className="note-citation-status">{t('window.source.readingNote')}</p>
          ) : null}
          {status === 'error' ? (
            <p className="note-citation-status is-error">{error || t('window.state.readFailed')}</p>
          ) : null}
          {status === 'missing' ? (
            <p className="note-citation-status">{t('window.source.missingFullText')}</p>
          ) : null}
          {content ? (
            format === 'html' ? (
              // 课堂静态笔记：禁脚本/同源，仅放行新窗口外链。
              <iframe
                srcDoc={content}
                sandbox="allow-popups"
                className="h-full min-h-[320px] w-full flex-1 border-0"
                title={heading}
              />
            ) : format === 'text' ? (
              <div className="note-citation-prose overflow-auto p-3">
                <PlainTextReader content={content} />
              </div>
            ) : (
              <div className="prose-notes note-citation-prose">
                <NoteRenderer content={content} />
              </div>
            )
          ) : null}
        </div>
      </div>
    </ManagedWindow>
  );
}
