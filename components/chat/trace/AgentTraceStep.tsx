'use client';

import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { useUiReducedMotion } from '@/lib/hooks/useUiReducedMotion';
import { AgentAlertIcon, AgentChevronIcon, AgentPauseIcon } from '@/components/icons/AgentIcons';
import type { TraceStatus } from '@/lib/chat/buildTrace';
import { useProcessingDisclosure } from '@/lib/hooks/useProcessingDisclosure';
import { useT, type I18nKey } from '@/lib/i18n/index';

export interface AgentTraceStepProps {
  id: string;
  kind: 'reasoning' | 'text' | 'tool';
  title: string;
  summary: string;
  status: TraceStatus;
  durationMs?: number;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Narrative can unfold live; tool details remain opt-in to keep the log compact. */
  expandWhileRunning?: boolean;
}

const STATUS_KEYS: Record<TraceStatus, I18nKey> = {
  running: 'trace.step.status.running',
  complete: 'trace.step.status.complete',
  error: 'trace.step.status.error',
  interrupted: 'trace.step.status.interrupted',
  waiting: 'trace.step.status.waiting',
  unknown: 'trace.tool.learningConnectors.uncertain',
  cancelled: 'trace.tool.learningConnectors.cancelled',
};

/** Flat activity row: one semantic glyph, one line of text, details on demand. */
export const AgentTraceStep = React.memo(function AgentTraceStep({ id, kind, title, summary, status, durationMs, icon, children, expandWhileRunning = false }: AgentTraceStepProps) {
  const t = useT();
  const contentId = useId();
  const reducedMotion = useUiReducedMotion();
  const active = status === 'running';
  const [expanded, setExpanded] = useProcessingDisclosure(active && expandWhileRunning, status === 'error');
  const isError = status === 'error';
  const exceptional = isError || status === 'interrupted' || status === 'waiting' || status === 'unknown' || status === 'cancelled';
  const durationLabel = durationMs == null || !Number.isFinite(durationMs) || durationMs < 0
    ? null
    : durationMs < 1000
      ? t('trace.step.underOneSecond')
      : t('trace.step.seconds', { seconds: Math.round(durationMs / 1000) });

  return (
    <li className="agent-trace-step" data-trace-id={id} data-trace-kind={kind} data-trace-status={status}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
        className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md py-1.5 text-left text-[13px] leading-5 transition-colors hover:text-[var(--md-sys-color-on-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] motion-reduce:transition-none ${active ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}
      >
        <motion.span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${isError ? 'text-[var(--md-sys-color-error)]' : ''}`}
          animate={!reducedMotion && active ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.85 }}
          transition={!reducedMotion && active ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
        >
          {isError ? <AgentAlertIcon /> : status === 'interrupted' ? <AgentPauseIcon /> : icon}
        </motion.span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-[70%] shrink-0 truncate">{title}</span>
          <span className={exceptional ? `shrink-0 text-[11px] ${isError ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-outline)]'}` : 'sr-only'}>{t(STATUS_KEYS[status])}</span>
          {!expanded && summary ? <span className="min-w-0 truncate text-[12px] text-[var(--md-sys-color-outline)]">{summary}</span> : null}
          {durationLabel ? <span className="agent-trace-step-duration">{durationLabel}</span> : null}
          <span aria-hidden="true" className={`shrink-0 opacity-65 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : '-rotate-90'}`}>
            <AgentChevronIcon size={14} />
          </span>
        </span>
      </button>
      <div id={contentId} hidden={!expanded}>
        {expanded ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className="agent-trace-step-body text-[12px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"
          >
            {children}
          </motion.div>
        ) : null}
      </div>
    </li>
  );
});
