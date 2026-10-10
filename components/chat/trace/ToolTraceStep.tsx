'use client';
import React from 'react';
import { TraceToolEntry } from './TraceToolEntry';
export { ToolIcon } from './TraceToolEntry';
import { TOOL_REGISTRY } from '@/components/chat/toolCards/registry';
import type { TraceToolStep as ToolStep } from '@/lib/chat/messages/buildTrace';
import type { ResultCardProps, ToolModule } from '@/lib/ai/agent/tools/registry';
import type { AgentTraceProps } from '@/components/chat/trace/AgentTrace';

/** Typed tool messages may attach a result detail; legacy inline tools only need the common trace view. */
export const ToolTraceStep = React.memo(function ToolTraceStep({ step, toolContext }: { step: ToolStep; toolContext?: AgentTraceProps['toolContext'] }) {
  const toolModule = (TOOL_REGISTRY as Record<string, ToolModule>)[step.name];
  const StepDetail = toolModule?.StepDetail as React.ComponentType<ResultCardProps> | undefined;
  return <TraceToolEntry step={step} toolContext={toolContext} StepDetail={StepDetail} />;
});
