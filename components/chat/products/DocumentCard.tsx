'use client';

import { captureStorageOperation } from '@/lib/storage/ownerScope';

import React, { useEffect, useRef, useState } from 'react';
import { useDocuments, getDocumentMarkdown, acquireDocumentBodyLease, hydrateDocumentBody } from '@/lib/stores/assets/documents';
import { useSettings } from '@/lib/stores/settings';
import { getModelInfoWithCustom, selectCustomApiGroupsForRequest } from '@/lib/ai/models';
import { parseSseJsonEvents } from '@/lib/utils/sseEvents';
import { useT, type Translate } from '@/lib/i18n/index';
import type { DocumentApiEvent, DocumentSpec, DocumentSection } from '@/lib/documents/types';
import { assembleDocumentMarkdown } from '@/lib/documents/types';
import {
  countDoneSections,
  currentWritingSection,
  documentCardHeading,
  documentProgressRatio,
  formatSectionProgress,
} from '@/lib/documents/progress';
import { MessageContent } from '@/components/chat/messages/MessageContent';
import { UsageProgressBar } from '@/components/chat/billing/UsageProgressBar';
import { useProcessingDisclosure } from '@/lib/hooks/chat/useProcessingDisclosure';
import {
  AgentAlertIcon,
  AgentArrowUpRightIcon,
  AgentCheckIcon,
  AgentChevronIcon,
  AgentDocumentIcon,
  AgentFileIcon,
  AgentLoopIcon,
  AgentQuoteIcon,
} from '@/components/icons/AgentIcons';

interface DocumentCardProps {
  documentId: string;
  spec: DocumentSpec;
  modelId?: string;
  unsupportedReason?: string;
  autoStart?: boolean;
  /** Agent 中间栏不画卡，但仍要跑分节生成，入口在右上参考列。 */
  silent?: boolean;
}

export default function DocumentCard({ documentId, spec, modelId, unsupportedReason, autoStart = false, silent = false }: DocumentCardProps) {
  useEffect(() => {
    const release = acquireDocumentBodyLease(documentId);
    void hydrateDocumentBody(documentId);
    return release;
  }, [documentId]);
  const doc = useDocuments((s) => s.byId[documentId]);
  const { create, openViewer, setSections, setSectionStatus, setSectionMarkdown, setStatus } = useDocuments();
  const [reasoning, setReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [previewPinned, setPreviewPinned] = useState<boolean | null>(null);
  const [sawStreamPreview, setSawStreamPreview] = useState(false);
  const startedRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const writingRowRef = useRef<HTMLLIElement>(null);
  // 只取首帧 autoStart：主聊天结束导致 autoStart 翻转时，不中断正在生成的文档。
  const [shouldAutoGen] = useState(autoStart);
  const t = useT();

  useEffect(() => {
    if (startedRef.current) return;
    if (!shouldAutoGen) return;
    const existing = useDocuments.getState().byId[documentId];
    if (existing?.status === 'done' || existing?.status === 'error') return;
    startedRef.current = true;
    if (!existing) create(documentId, spec, modelId);

    const settings = useSettings.getState();
    const docModelId = modelId || settings.selectedModelId;
    const docModelInfo = getModelInfoWithCustom(docModelId, settings.customApiGroups);
    if (docModelInfo?.type === 'image') {
      /* eslint-disable react-hooks/set-state-in-effect */
      setStatus(documentId, 'error', unsupportedReason || t('window.document.imageModelUnsupportedRetry'));
      setError(unsupportedReason || t('window.document.imageModelUnsupported'));
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const customApiGroups = selectCustomApiGroupsForRequest(settings.customApiGroups, docModelId);

    setGenerating(true);

    // 不在 cleanup 里 abort：create() 会写入 store，若 effect 依赖 doc 会 setup→cleanup→setup，
    // 把首个请求掐掉且 startedRef 已置位，进度永远停在 0/N（与 ArtifactCard 同一类坑）。
    const operation = captureStorageOperation(documentId);
    const assertCurrent = () => { operation.signal.throwIfAborted(); if (!operation.isCurrent() || !useDocuments.getState().byId[documentId]) throw new DOMException('账号已切换或文档已移除', 'AbortError'); };
    const run = async () => {
      try {
        setStatus(documentId, 'outlining');

        const outlineRes = await fetch('/api/document', {
          method: 'POST',
          signal: operation.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: documentId,
            spec,
            modelId: docModelId,
            phase: 'outline',
            customApiGroups,
          }),
        });
        assertCurrent();
        if (!outlineRes.ok) throw new Error(t('window.document.outlineRequestFailed', { status: outlineRes.status }));
        const outline = await consumeOutline(outlineRes, documentId, t, (delta) => {
          assertCurrent(); setReasoning((prev) => prev + delta);
        }, assertCurrent);
        assertCurrent();
        if (!outline.length) throw new Error(t('window.document.outlineEmpty'));

        setSections(documentId, outline.map((o) => ({ ...o, status: 'pending' })));
        setStatus(documentId, 'writing');

        for (let i = 0; i < outline.length; i++) {
          assertCurrent();
          const previousMarkdown = getDocumentMarkdown(documentId) || '';
          const sectionRes = await fetch('/api/document', {
            method: 'POST',
          signal: operation.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: documentId,
              spec,
              modelId: docModelId,
              phase: 'section',
              outline,
              sectionIndex: i,
              previousMarkdown,
              customApiGroups,
            }),
          });
          assertCurrent();
          if (!sectionRes.ok) throw new Error(t('window.document.sectionRequestFailed', { index: i + 1, status: sectionRes.status }));
          await consumeSection(
            sectionRes,
            documentId,
            i,
            setSectionStatus,
            setSectionMarkdown,
            t,
            (delta) => { assertCurrent(); setReasoning((prev) => prev + delta); },
            assertCurrent,
          );
        }

        assertCurrent();
        setStatus(documentId, 'done');
      } catch (err) {
        if (!operation.isCurrent() || (err as Error)?.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : t('window.document.generateFailed');
        setStatus(documentId, 'error', message);
        setError(message);
      } finally {
        if (operation.isCurrent()) setGenerating(false);
      }
    };

    void run();
  }, [documentId, spec, modelId, shouldAutoGen, create, setSections, setSectionStatus, setSectionMarkdown, setStatus, unsupportedReason, t]);

  const inFlight = generating;
  const done = doc?.status === 'done';
  const errored = Boolean(doc?.status === 'error' || error);
  const sections = doc?.sections ?? [];
  const doneCount = countDoneSections(sections);
  const writing = currentWritingSection(sections);
  const progressText = formatSectionProgress(doneCount, sections.length);
  const previewMarkdown = doc ? assembleDocumentMarkdown(doc).trim() : '';
  const hasPreview = previewMarkdown.length > 0 && previewMarkdown !== `# ${spec.title.trim()}`;
  const thinkingActive = inFlight;
  const [showThinking, setShowThinking] = useProcessingDisclosure(thinkingActive);
  const showThinkingSection = thinkingActive || reasoning.length > 0;
  const heading = documentCardHeading({
    title: spec.title,
    inFlight,
    done,
    errored,
    status: doc?.status,
    sectionCount: sections.length,
  });
  const onContainer = 'var(--md-sys-color-on-primary-container)';
  const canOpen = Boolean(doc) && !errored;
  if (inFlight && hasPreview && !sawStreamPreview) setSawStreamPreview(true);
  const showPreview = previewPinned ?? sawStreamPreview;

  useEffect(() => {
    if (showPreview && previewRef.current) previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [previewMarkdown, showPreview]);

  useEffect(() => {
    writingRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [writing?.title]);

  if (silent) return null;

  if (unsupportedReason) {
    return (
      <div className="my-3 rounded-2xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] p-3 text-[13px] text-[var(--md-sys-color-on-error-container)]">
        <div className="flex items-center gap-2 font-semibold">
          <AgentAlertIcon size={16} />
          {t('window.document.unsupportedTitle')}
        </div>
        <div className="mt-1 opacity-90">{unsupportedReason}</div>
      </div>
    );
  }

  return (
    <div
      className="artifact-card document-card my-2 overflow-hidden rounded-xl border"
      data-testid="document-card"
      style={{
        borderColor: errored ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)',
        background: 'var(--md-sys-color-primary-container)',
      }}
    >
      <div className="artifact-card-header" data-testid="document-card-header">
        <div className="artifact-card-heading">
          {inFlight ? (
            <AgentLoopIcon size={15} className="animate-pulse motion-reduce:animate-none shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
          ) : errored ? (
            <AgentAlertIcon size={15} className="shrink-0" style={{ color: 'var(--md-sys-color-error)' }} />
          ) : (
            <AgentDocumentIcon size={15} className="shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
          )}
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: onContainer }}>
            {heading}
          </span>
        </div>
        {canOpen ? (
          <button
            type="button"
            data-testid="document-open"
            onClick={() => openViewer(documentId)}
            className="artifact-open-demo press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)' }}
          >
            <AgentArrowUpRightIcon size={14} />
            {t('window.document.viewDocument')}
          </button>
        ) : null}
      </div>

      {spec.brief ? (
        <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent)' }}>
          <button
            type="button"
            data-testid="document-prompt-toggle"
            aria-expanded={showPrompt}
            onClick={() => setShowPrompt((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11.5px] font-medium"
            style={{ color: onContainer, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentQuoteIcon size={13} className="shrink-0" />
            {t('window.document.basis')}
            <AgentChevronIcon size={13} style={{ transform: showPrompt ? 'rotate(180deg)' : undefined }} />
          </button>
          {showPrompt ? (
            <div
              data-testid="document-prompt-body"
              className="chat-prose px-3 pb-2 text-[11px]"
              style={{
                color: 'var(--md-sys-color-on-surface-variant)',
                background: 'color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent)',
              }}
            >
              <MessageContent content={spec.brief} enableVisualizations={false} preserveLineBreaks />
            </div>
          ) : null}
        </div>
      ) : null}

      {showThinkingSection ? (
        <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent)' }}>
          <button
            type="button"
            data-testid="document-thinking-toggle"
            aria-expanded={showThinking}
            onClick={() => setShowThinking((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11.5px] font-medium"
            style={{ color: onContainer, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentLoopIcon
              size={13}
              className={thinkingActive ? 'animate-pulse motion-reduce:animate-none' : undefined}
            />
            {thinkingActive ? t('window.document.thinking') : t('window.document.thinkingProcess')}
            <AgentChevronIcon size={13} style={{ transform: showThinking ? 'rotate(180deg)' : undefined }} />
          </button>
          {showThinking ? (
            <div
              data-testid="document-thinking-body"
              className="chat-prose max-h-48 overflow-auto px-3 pb-2 text-[11px] leading-relaxed"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              {reasoning
                ? <MessageContent content={reasoning} enableVisualizations={false} preserveLineBreaks />
                : t('window.document.planningWriting')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="px-3 py-2"
        data-testid="document-progress"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent)' }}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11.5px]" style={{ color: onContainer }}>
          <span>
            {inFlight && !sections.length
              ? t('window.document.planningSections')
              : writing
                ? t('window.document.writingSection', { title: writing.title })
                : done
                  ? t('window.document.sectionsDone')
                  : t('window.document.sectionProgress')}
          </span>
          {progressText ? (
            <span className="font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{progressText}</span>
          ) : null}
        </div>
        <UsageProgressBar
          ratio={documentProgressRatio(doneCount, sections.length)}
          ariaLabel={t('window.document.sectionProgress')}
          tone="completion"
          height={4}
          valueNow={doneCount}
          valueMax={sections.length || 1}
        />
      </div>

      {sections.length > 0 ? (
        <ol className="document-section-list hide-scrollbar" data-testid="document-section-list">
          {sections.map((section, index) => {
            const writingThis = section.status === 'streaming';
            const stateLabel =
              section.status === 'done' ? t('window.document.statusDone')
                : section.status === 'streaming' ? t('window.document.statusWriting')
                  : section.status === 'error' ? t('window.common.failed')
                    : t('window.document.statusWaiting');
            return (
              <li
                key={`${index}-${section.title}`}
                ref={writingThis ? writingRowRef : undefined}
                className="document-section-row"
                data-document-section={section.status}
                style={{
                  color: writingThis ? onContainer : 'var(--md-sys-color-on-surface-variant)',
                  opacity: section.status === 'pending' ? 0.72 : 1,
                }}
              >
                <span className="document-section-index">{index + 1}</span>
                {section.status === 'done' ? (
                  <AgentCheckIcon size={12} className="shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
                ) : writingThis ? (
                  <AgentLoopIcon size={12} className="animate-pulse motion-reduce:animate-none shrink-0" />
                ) : (
                  <span className="shrink-0" aria-hidden="true" style={{ width: 12, textAlign: 'center' }}>·</span>
                )}
                <span className="document-section-title">{section.title}</span>
                <span className="document-section-state">{stateLabel}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {hasPreview ? (
        <div style={{ borderTop: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent)' }}>
          <button
            type="button"
            data-testid="document-preview-toggle"
            aria-expanded={showPreview}
            onClick={() => setPreviewPinned(!(previewPinned ?? sawStreamPreview))}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11.5px] font-medium"
            style={{ color: onContainer, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentFileIcon size={13} />
            {showPreview ? t('window.document.hideBody') : t('window.document.viewBody')}
            <AgentChevronIcon size={13} style={{ transform: showPreview ? 'rotate(180deg)' : undefined }} />
          </button>
          {showPreview ? (
            <div
              ref={previewRef}
              data-testid="document-preview-body"
              className="chat-prose hide-scrollbar max-h-[40vh] overflow-auto px-3 pb-2 text-[12px] leading-relaxed"
              style={{
                background: 'var(--md-sys-color-surface-container-lowest)',
                color: 'var(--md-sys-color-on-surface)',
              }}
            >
              <MessageContent content={previewMarkdown} enableVisualizations={false} />
            </div>
          ) : null}
        </div>
      ) : null}

      {errored ? (
        <div className="px-3 pb-3 text-[12px]" style={{ color: 'var(--md-sys-color-error)' }}>
          {doc?.error || error || t('window.document.errorHint')}
        </div>
      ) : null}
    </div>
  );
}

async function consumeOutline(
  response: Response,
  documentId: string,
  t: Translate,
  onReasoningDelta: (delta: string) => void,
  assertCurrent: () => void,
): Promise<Pick<DocumentSection, 'title' | 'brief'>[]> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(t('window.document.streamReadFailed'));
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let outline: Pick<DocumentSection, 'title' | 'brief'>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    assertCurrent();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseJsonEvents<DocumentApiEvent>(buffer);
    buffer = parsed.remaining;
    for (const event of parsed.events) {
      if (event.type === 'ping') continue;
      if (event.type !== 'document' || event.id !== documentId) continue;
      if (event.status === 'reasoning') onReasoningDelta(event.delta || '');
      if (event.status === 'outline') outline = event.outline || [];
      if (event.status === 'error') throw new Error(event.message || t('window.document.outlineFailed'));
    }
  }
  return outline;
}

async function consumeSection(
  response: Response,
  documentId: string,
  index: number,
  setSectionStatus: (id: string, index: number, status: DocumentSection['status'], error?: string) => void,
  setSectionMarkdown: (id: string, index: number, markdown: string) => void,
  t: Translate,
  onReasoningDelta: (delta: string) => void,
  assertCurrent: () => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(t('window.document.streamReadFailed'));
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let markdown = '';

  setSectionStatus(documentId, index, 'streaming');

  while (true) {
    const { done, value } = await reader.read();
    assertCurrent();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseJsonEvents<DocumentApiEvent>(buffer);
    buffer = parsed.remaining;
    for (const event of parsed.events) {
      if (event.type === 'ping') continue;
      if (event.type !== 'document' || event.id !== documentId) continue;
      if (event.status === 'reasoning') onReasoningDelta(event.delta || '');
      if (event.status === 'delta') {
        const d = event.delta || '';
        markdown += d;
        setSectionMarkdown(documentId, index, markdown);
      }
      if (event.status === 'section-done') {
        const m = event.markdown;
        if (m) setSectionMarkdown(documentId, index, m);
        setSectionStatus(documentId, index, 'done');
        return;
      }
      if (event.status === 'error') {
        setSectionStatus(documentId, index, 'error', event.message || t('window.document.sectionFailed'));
        throw new Error(event.message || t('window.document.sectionFailed'));
      }
    }
  }
  throw new Error('章节生成中断，未完成稿已保留在本机。');
}
