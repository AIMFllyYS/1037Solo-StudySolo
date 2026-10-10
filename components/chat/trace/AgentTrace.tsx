'use client';

import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useUiReducedMotion } from '@/lib/hooks/runtime/useUiReducedMotion';
import { AgentCheckIcon, AgentChevronIcon } from '@/components/icons/AgentIcons';
import type { AgentTraceModel } from '@/lib/chat/buildTrace';
import { useProcessingDisclosure } from '@/lib/hooks/chat/useProcessingDisclosure';
import { useT, type Translate } from '@/lib/i18n/index';
import { ToolTraceStep } from '@/components/chat/trace/ToolTraceStep';
import { ReasoningTraceStep } from '@/components/chat/trace/ReasoningTraceStep';
import type { ResultCardProps } from '@/lib/ai/agent/tools/registry';

/** 折叠高度过渡时长。ChatMessage 用同一窗口错开 FollowUpQuestions 插入。 */
export const TRACE_COLLAPSE_MS = 160;

export interface AgentTraceProps {
  trace: AgentTraceModel;
  isStreaming?: boolean;
  durationMs?: number;
  /** 对话消息已有品牌状态头时，折叠入口只标识内部处理过程。 */
  summaryMode?: 'status' | 'process';
  toolContext?: Omit<ResultCardProps, 'part' | 'onOutputChange'> & { onToolOutputChange?: (toolCallId: string, output: unknown) => void };
}

function completedLabel(trace: AgentTraceModel, durationMs: number | undefined, t: Translate): string {
  if (trace.steps.some(step => step.status === 'running')) return t('trace.summary.working');
  if (trace.steps.some(step => step.status === 'unknown')) return t('trace.tool.learningConnectors.uncertain');
  if (trace.steps.some(step => step.status === 'cancelled')) return t('trace.tool.learningConnectors.cancelled');
  if (trace.interruptedCount > 0) return t('trace.summary.stopped');
  if (trace.waitingCount > 0) return t('trace.summary.waiting');
  if (trace.errorCount > 0) return t('trace.summary.partialError');
  if (durationMs != null && Number.isFinite(durationMs) && durationMs >= 0) {
    if (durationMs < 1000) return t('trace.summary.underOneSecond');
    const seconds = Math.round(durationMs / 1000);
    if (seconds >= 60) return t('trace.summary.minutes', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
    return t('trace.summary.seconds', { seconds });
  }
  return t('trace.status.done');
}

export function agentProcessingLabel(
  trace: AgentTraceModel,
  isStreaming: boolean,
  durationMs: number | undefined,
  t: Translate,
): string {
  if (!isStreaming) return completedLabel(trace, durationMs, t);
  const activeStep = trace.steps.findLast((step) => step.status === 'running');
  if (activeStep) return t('trace.summary.working');
  if (trace.waitingCount) return t('trace.summary.waiting');
  if (trace.steps.length === 0) return t('trace.summary.thinking');
  return t('trace.summary.composing');
}

export const AgentTrace = React.memo(function AgentTrace({ trace, isStreaming = false, durationMs, summaryMode = 'status', toolContext }: AgentTraceProps) {
  const t = useT();
  const contentId = useId();
  const reducedMotion = useUiReducedMotion();
  const [expanded, setExpanded] = useProcessingDisclosure(isStreaming);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyMounted, setBodyMounted] = useState(expanded);
  const [maxHeight, setMaxHeight] = useState<number | 'none'>(expanded ? 'none' : 0);
  const pulse = isStreaming && !reducedMotion && !trace.waitingCount;

  useLayoutEffect(() => {
    if (expanded) setBodyMounted(true);
  }, [expanded]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (expanded) {
      if (!el || reducedMotion || el.scrollHeight <= 0) {
        setMaxHeight('none');
        return;
      }
      setMaxHeight(el.scrollHeight);
      const timer = window.setTimeout(() => setMaxHeight('none'), TRACE_COLLAPSE_MS);
      return () => window.clearTimeout(timer);
    }

    if (!el || reducedMotion || el.scrollHeight <= 0) {
      setBodyMounted(false);
      setMaxHeight(0);
      return;
    }

    setMaxHeight(el.scrollHeight);
    let secondRaf = 0;
    const raf = requestAnimationFrame(() => {
      secondRaf = requestAnimationFrame(() => setMaxHeight(0));
    });
    const timer = window.setTimeout(() => setBodyMounted(false), TRACE_COLLAPSE_MS);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(secondRaf);
      window.clearTimeout(timer);
    };
  }, [expanded, bodyMounted, reducedMotion]);

  if (trace.steps.length === 0) {
    if (!isStreaming) return null;
    return (
      <section className="agent-trace mb-1 min-w-0" aria-label={t('trace.summary.aria')}>
        <p
          role="status"
          aria-live="polite"
          data-testid="agent-trace-thinking"
          className="flex min-h-9 max-w-full items-center rounded-md py-1.5 text-left text-[13px] leading-5 text-[var(--md-sys-color-on-surface-variant)]"
        >
          <motion.span
            className="min-w-0 [overflow-wrap:anywhere]"
            animate={pulse ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
            transition={pulse ? { duration: 2.4, repeat: Infinity } : { duration: 0 }}
          >
            {t('trace.summary.thinking')}
          </motion.span>
        </p>
      </section>
    );
  }

  const title = summaryMode === 'process'
    ? t('trace.summary.process')
    : agentProcessingLabel(trace, isStreaming, durationMs, t);

  return (
    <section className={`agent-trace min-w-0 ${expanded ? 'mb-3' : 'mb-1'}`} aria-label={t('trace.summary.aria')}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
        className="flex min-h-9 max-w-full items-center gap-1 rounded-md py-1.5 text-left text-[13px] leading-5 text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--md-sys-color-primary)] motion-reduce:transition-none"
      >
        {!isStreaming && trace.steps.every(step => step.status === 'complete') ? (
          <span aria-hidden="true" className="agent-trace-complete-mark"><AgentCheckIcon size={13} /></span>
        ) : null}
        <motion.span
          role="status"
          aria-live="polite"
          className="min-w-0 [overflow-wrap:anywhere]"
          animate={isStreaming && !reducedMotion && !trace.waitingCount ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
          transition={isStreaming && !reducedMotion && !trace.waitingCount ? { duration: 2.4, repeat: Infinity } : { duration: 0 }}
        >
          {title}
        </motion.span>
        <span aria-hidden="true" className={`shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}><AgentChevronIcon size={15} /></span>
      </button>
      <div
        id={contentId}
        ref={bodyRef}
        hidden={!expanded && !bodyMounted}
        style={{
          maxHeight: maxHeight === 'none' ? undefined : maxHeight,
          overflow: 'hidden',
          transition: reducedMotion ? undefined : `max-height ${TRACE_COLLAPSE_MS}ms ease-out`,
        }}
      >
        {bodyMounted ? (
          <motion.ol
            aria-label={t('trace.summary.stepsAria')}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className="agent-trace-list"
          >
            {trace.steps.map((step) => step.kind === 'tool'
              ? <ToolTraceStep key={step.id} step={step} toolContext={toolContext} />
              : <ReasoningTraceStep key={step.id} step={step} />)}
          </motion.ol>
        ) : null}
      </div>
    </section>
  );
});
