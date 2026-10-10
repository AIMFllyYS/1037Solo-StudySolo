'use client';

import React from 'react';
import {
  AgentDocumentIcon,
  AgentFileIcon,
  AgentGalleryIcon,
  AgentImageIcon,
  AgentLoopIcon,
  AgentQuizIcon,
  AgentSearchIcon,
  AgentTerminalIcon,
} from '@/components/icons/AgentIcons';
import { AgentTraceStep } from '@/components/chat/AgentTraceStep';
import { WebSearchStepDetail } from '@/components/chat/WebSearchStepDetail';
import { getTraceToolOutput, type TraceToolStep as ToolStep } from '@/lib/chat/buildTrace';
import { getToolPresentation, type ToolIconKind } from '@/lib/chat/toolPresentation';
import { useIsAgentSurface } from '@/lib/window/useManagedWindowSurface';
import { useT } from '@/lib/i18n';
import type { ResultCardProps } from '@/lib/ai/agent/tools/registry';
import type { AgentTraceProps } from '@/components/chat/AgentTrace';

export const TraceToolEntry = React.memo(function TraceToolEntry({ step, toolContext, StepDetail }: { step: ToolStep; toolContext?: AgentTraceProps['toolContext']; StepDetail?: React.ComponentType<ResultCardProps> }) {
  const t = useT();
  const { part } = step;
  const input = part.input ?? (part.state === 'output-error' && 'rawInput' in part ? part.rawInput : undefined);
  const output = getTraceToolOutput(part, t);
  const hasInput = input != null && (typeof input !== 'object' || Object.keys(input).length > 0);
  // 联网搜索步骤：展开区塞分源状态点 + 来源走马灯。Agent 面上结果卡整卡隐藏
  // （hideInAgentChat），所以运行中自动展开这步让来源流式可见；普通对话里卡片
  // 已展示同一条走马灯，保持收起避免重复。
  const isWebSearch = step.name === 'webSearch';
  const isAgentSurface = useIsAgentSurface();

  return (
    <AgentTraceStep {...step} icon={<ToolIcon name={step.name} />} expandWhileRunning={isWebSearch && isAgentSurface}>
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--md-sys-color-outline)]">
          <code className="break-all">{step.name}()</code>
          {step.status === 'running' || step.status === 'waiting' || step.status === 'interrupted' ? <span>{step.summary}</span> : null}
        </div>
        {isWebSearch ? <WebSearchStepDetail step={step} /> : null}
        {hasInput ? (
          <div className="agent-trace-subdetail">
            <p className="mb-1 text-[10px] font-medium text-[var(--md-sys-color-outline)]">{t('trace.step.input')}</p>
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words py-1 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]">{typeof input === 'string' ? input : JSON.stringify(input, null, 2)}</pre>
          </div>
        ) : null}
        {StepDetail && toolContext ? <StepDetail {...toolContext} part={part as ResultCardProps['part']} onOutputChange={toolContext.onToolOutputChange ? next => toolContext.onToolOutputChange?.(part.toolCallId, next) : undefined} /> : null}
        {output && !(StepDetail && toolContext && part.state === 'output-available') ? (
          <div className="agent-trace-subdetail">
            <p className={`mb-1 text-[10px] font-medium ${step.status === 'error' ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-outline)]'}`}>{step.status === 'error' ? t('trace.step.errorOutput') : t('trace.step.output')}</p>
            <pre className={`m-0 max-h-44 overflow-auto whitespace-pre-wrap break-words py-1 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere] ${step.status === 'error' ? 'text-[var(--md-sys-color-error)]' : ''}`}>{output}</pre>
          </div>
        ) : null}
        {!hasInput && !output && step.status === 'complete' ? <span>{t('trace.step.success')}</span> : null}
      </div>
    </AgentTraceStep>
  );
});

const ICONS: Record<ToolIconKind, React.ReactElement> = {
  search: <AgentSearchIcon />,
  file: <AgentFileIcon />,
  image: <AgentImageIcon />,
  gallery: <AgentGalleryIcon />,
  skill: <AgentLoopIcon />,
  terminal: <AgentTerminalIcon />,
  quiz: <AgentQuizIcon />,
  document: <AgentDocumentIcon />,
};

/** 图标来自 toolPresentation 注册表；未知（dynamic-tool）工具回落到终端图标。 */
export function ToolIcon({ name }: { name: string }) {
  return ICONS[getToolPresentation(name)?.icon ?? 'terminal'];
}
