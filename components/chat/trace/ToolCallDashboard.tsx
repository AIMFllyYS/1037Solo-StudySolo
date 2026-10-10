'use client';

import React from 'react';
import { buildToolTraceStep, type TraceToolPart } from '@/lib/chat/messages/buildTrace';
import { TraceToolEntry as ToolTraceStep } from '@/components/chat/trace/TraceToolEntry';
import { useT } from '@/lib/i18n/index';

// MessageContent still accepts historical inline <ToolCall> markup. Keep that
// narrow rendering adapter local; real ChatMessages only use typed tool parts.
interface InlineToolCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  result?: string;
}

export function ToolCallDashboard({ toolCalls, isProcessing = false }: { toolCalls: InlineToolCall[]; isProcessing?: boolean }) {
  const t = useT();
  if (!toolCalls.length) return null;
  return (
    <ol className="my-2 min-w-0 list-none p-0" aria-label={t('trace.tool.callAria')}>
      {toolCalls.map((call, index) => {
        const base = { type: 'dynamic-tool' as const, toolName: call.name, toolCallId: call.id, input: call.arguments ?? {} };
        const part: TraceToolPart = call.status === 'running'
          ? { ...base, state: 'input-available' }
          : call.status === 'error'
            ? { ...base, state: 'output-error', errorText: call.result || t('trace.tool.runFailed') }
            : { ...base, state: 'output-available', output: { text: call.result ?? '' } };
        return <ToolTraceStep key={call.id} step={buildToolTraceStep(part, index, isProcessing, undefined, t)} />;
      })}
    </ol>
  );
}
