import type { ChatMessage, ChatMessagePart } from '@/lib/types/chat';
import type { ChatToolPart } from '@/lib/chat/messages/messageParts';
import { hasStepStart } from '@/lib/chat/messages/messageParts';
import { splitThinkContent } from '@/lib/chat/rendering/parseChatContent';
import { getToolPresentation } from '@/lib/ai/agent/tools/presentations';
import { translateNow, type Translate } from "@/lib/i18n/index";

export type TraceStatus = 'running' | 'complete' | 'error' | 'interrupted' | 'waiting' | 'unknown' | 'cancelled';
export type TraceToolPart = ChatToolPart | Extract<ChatMessagePart, { type: 'dynamic-tool' }>;

interface TraceStepBase {
  id: string;
  partIndex: number;
  status: TraceStatus;
  title: string;
  summary: string;
  durationMs?: number;
}

export interface TraceTextStep extends TraceStepBase {
  kind: 'reasoning' | 'text';
  text: string;
}

export interface TraceToolStep extends TraceStepBase {
  kind: 'tool';
  name: string;
  part: TraceToolPart;
}

export type TraceStep = TraceTextStep | TraceToolStep;

export type TraceRenderBlock =
  | { kind: 'trace'; steps: TraceStep[] }
  | { kind: 'answer'; text: string };

export interface AgentTraceModel {
  steps: TraceStep[];
  blocks: TraceRenderBlock[];
  answerText: string;
  toolCount: number;
  errorCount: number;
  interruptedCount: number;
  waitingCount: number;
}

/**
 * 这个模块是纯函数，拿不到 React 上下文：默认按 store 的当前语言即时取词。
 * 组件里一律把 `useT()` 的 t 传进来——那样换语言才会跟着重渲染，默认值只服务单测与
 * 少数还在用旧签名的调用方（MemoryProposalCloud / useChat.test）。
 */

export function isTraceToolPart(part: ChatMessagePart): part is TraceToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function traceToolName(part: TraceToolPart): string {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
}

function preview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 110 ? `${compact.slice(0, 110)}…` : compact;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getTraceToolOutput(part: TraceToolPart, t: Translate = translateNow): string {
  if (part.state === 'output-error') return part.errorText;
  if (part.state === 'output-denied') return part.approval.reason || t('trace.tool.denied');
  if (part.state === 'approval-responded' && !part.approval.approved) return part.approval.reason || t('trace.tool.denied');
  if (part.state !== 'output-available') return '';
  if (typeof part.output === 'string') return part.output;
  const output = record(part.output);
  if (typeof output.text === 'string') return output.text;
  return JSON.stringify(part.output, null, 2) ?? '';
}

export function getTraceToolStatus(part: TraceToolPart, isStreaming: boolean): TraceStatus {
  if (part.state === 'output-error' || part.state === 'output-denied') return 'error';
  if (part.state === 'output-available' && !part.preliminary) {
    const output = record(part.output);
    const action = record(output.action);
    const state = action.status ?? output.state;
    if (state === 'uncertain' || state === 'unknown') return 'unknown';
    if (output.error || action.error || record(action.result).error || state === 'failed' || (typeof output.exitCode === 'number' && output.exitCode !== 0)) return 'error';
    if (state === 'proposed' && typeof action.expiresAt === 'number' && action.expiresAt <= Date.now()) return 'error';
    if (state === 'proposed' || state === 'approval_required') return 'waiting';
    if (['executing', 'starting', 'running', 'creating', 'closing', 'started'].includes(String(state))) return 'running';
    if (state === 'cancelled') return 'cancelled';
    if (traceToolName(part) === 'learningConnectors' && output.action && !['succeeded'].includes(String(state))) return 'unknown';
    if (traceToolName(part) === 'cloudSandbox' && state && !['completed', 'active', 'closed', 'succeeded'].includes(String(state))) return 'unknown';
    return 'complete';
  }
  if (part.state === 'approval-requested') return 'waiting';
  if (part.state === 'approval-responded' && !part.approval.approved) return 'error';
  // A saved or aborted incomplete call must never keep a historical message spinning.
  return isStreaming ? 'running' : 'interrupted';
}

export function buildToolTraceStep(
  part: TraceToolPart,
  partIndex: number,
  isStreaming = false,
  stepDurationsMs?: Readonly<Record<string, number>>,
  t: Translate = translateNow,
): TraceToolStep {
  const name = traceToolName(part);
  const status = getTraceToolStatus(part, isStreaming);
  const input = record(part.input);
  const output = part.state === 'output-available' ? record(part.output) : {};
  let summary = '';

  if (status === 'unknown') {
    summary = t('trace.tool.learningConnectors.uncertain');
  } else if (status === 'cancelled') {
    summary = t('trace.tool.learningConnectors.cancelled');
  } else if (status === 'error') {
    summary = getTraceToolOutput(part, t) || t('trace.tool.denied');
  } else if (status === 'interrupted') {
    summary = t('trace.tool.interrupted');
  } else if (status === 'waiting') {
    summary = t('trace.tool.waitingApproval');
  } else if (output.deduped) {
    summary = t('trace.tool.deduped');
  } else if (Array.isArray(output.images)) {
    summary = t('trace.tool.images', { count: output.images.length });
  } else if (Array.isArray(output.questions)) {
    const count = output.questions.length;
    summary = output.title
      ? t('trace.tool.questionsWithTitle', { count, title: String(output.title) })
      : t('trace.tool.questions', { count });
  } else if (output.documentId) {
    const docTitle = typeof output.spec === 'object' && output.spec ? (output.spec as Record<string, unknown>).title : undefined;
    summary = t('trace.tool.document', { title: typeof docTitle === 'string' ? docTitle : t('trace.tool.untitled') });
  } else if (Array.isArray(output.sources)) {
    const count = output.sources.length;
    summary = (name === 'imageSearch'
      ? t('trace.tool.imageSources', { count })
      : t('trace.tool.sources', { count })) + (output.cacheHit ? t('trace.tool.cacheHit') : '');
  } else if (Array.isArray(output.hits)) {
    summary = t('trace.tool.hits', { count: output.hits.length });
  } else if (typeof output.skill === 'string') {
    summary = output.found === false
      ? t('trace.tool.skillMissing', { name: output.skill })
      : t('trace.tool.skillUsed', { name: output.skill });
  } else if (output.kind === 'note' || output.kind === 'flashcard') {
    summary = typeof output.reason === 'string' && output.reason
      ? output.reason
      : output.kind === 'note' ? t('trace.tool.proposeNote') : t('trace.tool.proposeFlashcard');
  } else if (typeof output.noteId === 'string') {
    summary = t('trace.tool.note', {
      title: typeof output.title === 'string' && output.title ? output.title : t('trace.tool.noteWritten'),
    });
  } else if (Array.isArray(output.items) && (name === 'commitFlashcards' || output.mode)) {
    const count = output.items.length;
    summary = typeof output.mode === 'string'
      ? t('trace.tool.flashcardsWithMode', { count, mode: output.mode })
      : t('trace.tool.flashcards', { count });
  } else if (typeof output.title === 'string' && output.title) {
    summary = output.title;
  } else {
    summary = [input.query, input.title, input.name, input.path, input.sectionId]
      .find((value): value is string => typeof value === 'string' && value.length > 0)
      ?? (status === 'running'
        ? (part.state === 'input-streaming' ? t('trace.tool.preparing') : t('trace.tool.running'))
        : getTraceToolOutput(part, t));
  }

  const id = `tool:${part.toolCallId}`;
  const presentation = getToolPresentation(name);
  return {
    id,
    partIndex,
    kind: 'tool',
    status,
    name,
    title: (presentation ? t(presentation.labelKey) : undefined) ?? part.title ?? name,
    summary: preview(summary),
    durationMs: stepDurationsMs?.[id],
    part,
  };
}

function summarizeTrace(steps: TraceStep[], answerText: string, blocks: TraceRenderBlock[]): AgentTraceModel {
  return {
    steps,
    blocks,
    answerText,
    toolCount: steps.filter((step) => step.kind === 'tool').length,
    errorCount: steps.filter((step) => step.status === 'error').length,
    interruptedCount: steps.filter((step) => step.status === 'interrupted').length,
    waitingCount: steps.filter((step) => step.status === 'waiting').length,
  };
}

function pushTextStep(
  steps: TraceStep[],
  kind: TraceTextStep['kind'],
  text: string,
  partIndex: number,
  streaming: boolean,
  isStreaming: boolean,
  t: Translate,
  suffix = '',
  stepDurationsMs?: Readonly<Record<string, number>>,
): TraceTextStep | undefined {
  if (!text.trim() && !streaming) return undefined;
  const id = `${kind}:${partIndex}${suffix}`;
  const step: TraceTextStep = {
    id,
    kind,
    partIndex,
    text,
    status: streaming ? (isStreaming ? 'running' : 'interrupted') : 'complete',
    title: t(kind === 'reasoning' ? 'trace.step.reasoningTitle' : 'trace.step.textTitle'),
    summary: preview(text) || t('trace.step.thinking'),
    durationMs: stepDurationsMs?.[id],
  };
  steps.push(step);
  return step;
}

/**
 * A view projection, never a second message store. Reasoning and tool calls retain
 * their exact parts positions. Messages with step-start keep text as answer segments
 * in parts order (same boundary as getAnswerText). Messages without step-start fall
 * back to two buckets: text before the last tool is commentary; the rest is the answer.
 * A later streamed tool can move a provisional two-bucket answer into the trace, but
 * it is never rendered in both places in the same snapshot.
 */
export function buildTrace(
  message: Pick<ChatMessage, 'parts'> & Partial<Pick<ChatMessage, 'metadata'>>,
  isStreaming = false,
  t: Translate = translateNow,
): AgentTraceModel {
  const stepDurationsMs = message.metadata?.stepDurationsMs;
  return hasStepStart(message.parts)
    ? buildTimelineTrace(message.parts, isStreaming, t, stepDurationsMs)
    : buildBucketTrace(message.parts, isStreaming, t, stepDurationsMs);
}

function buildBucketTrace(
  parts: readonly ChatMessagePart[],
  isStreaming: boolean,
  t: Translate,
  stepDurationsMs?: Readonly<Record<string, number>>,
): AgentTraceModel {
  const steps: TraceStep[] = [];
  const answer: string[] = [];
  let lastToolIndex = -1;
  for (let index = parts.length - 1; index >= 0; index--) {
    if (isTraceToolPart(parts[index])) {
      lastToolIndex = index;
      break;
    }
  }

  parts.forEach((part, partIndex) => {
    if (isTraceToolPart(part)) {
      steps.push(buildToolTraceStep(part, partIndex, isStreaming, stepDurationsMs, t));
    } else if (part.type === 'reasoning') {
      pushTextStep(steps, 'reasoning', part.text, partIndex, part.state === 'streaming', isStreaming, t, '', stepDurationsMs);
    } else if (part.type === 'text') {
      const split = splitThinkContent(part.text);
      if (split.reasoning) {
        pushTextStep(steps, 'reasoning', split.reasoning, partIndex, part.state === 'streaming' && !split.content.trim(), isStreaming, t, ':think', stepDurationsMs);
      }
      if (partIndex <= lastToolIndex) {
        pushTextStep(steps, 'text', split.content, partIndex, part.state === 'streaming', isStreaming, t, '', stepDurationsMs);
      } else if (split.content.trim()) {
        answer.push(split.content);
      }
    }
  });

  const answerText = answer.join('\n\n');
  const blocks: TraceRenderBlock[] = [];
  if (steps.length) blocks.push({ kind: 'trace', steps });
  if (answerText) blocks.push({ kind: 'answer', text: answerText });
  return summarizeTrace(steps, answerText, blocks);
}

function buildTimelineTrace(
  parts: readonly ChatMessagePart[],
  isStreaming: boolean,
  t: Translate,
  stepDurationsMs?: Readonly<Record<string, number>>,
): AgentTraceModel {
  const steps: TraceStep[] = [];
  const answer: string[] = [];
  const blocks: TraceRenderBlock[] = [];
  let currentSteps: TraceStep[] = [];
  let separateAnswer = false;

  const flushSteps = () => {
    if (!currentSteps.length) return;
    blocks.push({ kind: 'trace', steps: currentSteps });
    currentSteps = [];
  };

  const addStep = (step: TraceStep) => {
    steps.push(step);
    currentSteps.push(step);
  };

  parts.forEach((part, partIndex) => {
    if (part.type === 'step-start') {
      separateAnswer = true;
      return;
    }
    if (isTraceToolPart(part)) {
      addStep(buildToolTraceStep(part, partIndex, isStreaming, stepDurationsMs, t));
      return;
    }
    if (part.type === 'reasoning') {
      const step = pushTextStep(steps, 'reasoning', part.text, partIndex, part.state === 'streaming', isStreaming, t, '', stepDurationsMs);
      if (step) currentSteps.push(step);
      return;
    }
    if (part.type !== 'text') return;

    const split = splitThinkContent(part.text);
    if (split.reasoning) {
      const step = pushTextStep(
        steps,
        'reasoning',
        split.reasoning,
        partIndex,
        part.state === 'streaming' && !split.content.trim(),
        isStreaming,
        t,
        ':think',
        stepDurationsMs,
      );
      if (step) currentSteps.push(step);
    }
    if (!split.content.trim()) return;

    flushSteps();
    const prev = blocks[blocks.length - 1];
    if (prev?.kind === 'answer' && !separateAnswer) {
      prev.text = `${prev.text}\n\n${split.content}`;
    } else {
      blocks.push({ kind: 'answer', text: split.content });
    }
    separateAnswer = false;
    answer.push(split.content);
  });

  flushSteps();
  return summarizeTrace(steps, answer.join('\n\n'), blocks);
}
