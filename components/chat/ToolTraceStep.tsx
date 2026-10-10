'use client';
import React from 'react';
import { TraceToolEntry } from './trace/TraceToolEntry';
export { ToolIcon } from './trace/TraceToolEntry';
import { TOOL_REGISTRY } from '@/components/chat/toolCards/registry';
import type { TraceToolStep as ToolStep } from '@/lib/chat/buildTrace';
import type { ResultCardProps, ToolModule } from '@/lib/ai/agent/tools/registry';
import type { AgentTraceProps } from '@/components/chat/AgentTrace';

/** Typed tool messages may attach a result detail; legacy inline tools only need the common trace view. */
export const ToolTraceStep = React.memo(function ToolTraceStep({ step, toolContext }: { step: ToolStep; toolContext?: AgentTraceProps['toolContext'] }) {
  const toolModule = (TOOL_REGISTRY as Record<string, ToolModule>)[step.name];
  const StepDetail = toolModule?.StepDetail as React.ComponentType<ResultCardProps> | undefined;
  return <TraceToolEntry step={step} toolContext={toolContext} StepDetail={StepDetail} />;
});
