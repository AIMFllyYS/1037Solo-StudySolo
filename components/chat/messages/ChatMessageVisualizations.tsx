'use client';

import React, { useCallback } from 'react';
import {
  VennDiagram,
  DistributionChart,
  FormulaSteps as FormulaStepsPrimitive,
  VideoPlayer,
} from '@/components/visualizations/index';
import { DiagramCanvas, isDiagramMode } from '@/components/canvas/index';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { replaceCanvasBlock } from '@/lib/chat/rendering/canvasBlockPatch';
import { getAnswerText, withAnswerText } from '@/lib/chat/messageParts';
import type { CanvasBlock } from '@/lib/canvas/types';
import VizFold from '@/components/chat/messages/VizFold';
import { AgentFileIcon, AgentImageIcon, AgentQuizIcon, AgentTerminalIcon } from '@/components/icons/AgentIcons';
import { useT, type I18nKey } from '@/lib/i18n/index';

// ----------------------------------------------------
// ChatMessageVisualizations: 标签分发器
// 将 AI 输出的 XML 标签分发到 Phase 4 创建的公共可视化原语。
// 不要只搜「可视化」：这里不是 renderInteractive 的 HTML 演示（那个在 ArtifactViewer）。
// XML 属性经 parseXmlTags 解析后均为字符串，这里负责按需转为 number/boolean。
// ----------------------------------------------------
interface ChatMessageVisualizationsProps {
  tagName: string;
  props: Record<string, unknown>;
  childrenText: string;
  repairContext?: {
    sessionId?: string;
    messageId?: string;
    blockIndex?: number;
    modelId?: string;
    topic?: string;
  };
}

const toNum = (v: unknown): number | undefined =>
  v === undefined || v === null || v === '' ? undefined : Number(v);

/** 韦恩图份额：0–1 原样；>1 且 ≤100 视为百分数。 */
export function vennShare(v: unknown): number | undefined {
  const n = toNum(v);
  if (n === undefined || Number.isNaN(n)) return undefined;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

const toBool = (v: unknown): boolean => v === 'true' || v === true;

const toStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;

const toDistributionType = (v: unknown): 'normal' | 'binomial' | 'poisson' =>
  v === 'binomial' || v === 'poisson' || v === 'normal' ? v : 'normal';

/** 折叠条标题进词典；图标仍随原语走。 */
const VIZ_FOLD: Record<string, { titleKey: I18nKey; icon: React.ReactNode }> = {
  InteractiveVenn: { titleKey: 'trace.viz.venn', icon: <AgentImageIcon size={16} className="shrink-0" /> },
  InlineDistribution: { titleKey: 'trace.viz.distribution', icon: <AgentImageIcon size={16} className="shrink-0" /> },
  FormulaSteps: { titleKey: 'trace.viz.formulaSteps', icon: <AgentQuizIcon size={16} className="shrink-0" /> },
  ManimPlayer: { titleKey: 'trace.viz.manim', icon: <AgentTerminalIcon size={16} className="shrink-0" /> },
  SvgDiagram: { titleKey: 'trace.viz.diagram', icon: <AgentFileIcon size={16} className="shrink-0" /> },
};

export const ChatMessageVisualizations: React.FC<ChatMessageVisualizationsProps> = ({
  tagName,
  props,
  childrenText,
  repairContext,
}) => {
  const t = useT();
  const handleCanvasRevision = useCallback((nextBlock: CanvasBlock) => {
    const sessionId = repairContext?.sessionId;
    const messageId = repairContext?.messageId;
    const blockIndex = repairContext?.blockIndex;
    if (!sessionId || !messageId || blockIndex === undefined) return;

    const state = useChatHistory.getState();
    const message = state.messagesById[sessionId]?.find((item) => item.id === messageId);
    if (!message) return;

    const current = getAnswerText(message);
    const content = replaceCanvasBlock(current, blockIndex, nextBlock);
    if (content !== current) {
      state.updateMessage(sessionId, messageId, { parts: withAnswerText(message, content) });
    }
  }, [repairContext]);

  const inner = (() => {
  switch (tagName) {
    case 'InteractiveVenn':
      return (
        <VennDiagram
          a={vennShare(props.a)}
          b={vennShare(props.b)}
          ab={vennShare(props.ab)}
          aLabel={toStr(props.aLabel)}
          bLabel={toStr(props.bLabel)}
          abLabel={toStr(props.abLabel)}
          interactive={toBool(props.interactive)}
        />
      );

    case 'InlineDistribution': {
      const hasParams =
        props.mu !== undefined ||
        props.sigma !== undefined ||
        props.n !== undefined ||
        props.p !== undefined ||
        props.lambda !== undefined;
      return (
        <DistributionChart
          type={toDistributionType(props.type)}
          params={
            hasParams
              ? {
                  mu: toNum(props.mu),
                  sigma: toNum(props.sigma),
                  n: toNum(props.n),
                  p: toNum(props.p),
                  lambda: toNum(props.lambda),
                }
              : undefined
          }
          interactive={toBool(props.interactive)}
        />
      );
    }

    case 'FormulaSteps': {
      const steps = childrenText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <FormulaStepsPrimitive
          steps={steps}
          interactive={toBool(props.interactive)}
        />
      );
    }

    case 'ManimPlayer':
      return (
        <VideoPlayer
          src={toStr(props.src) ?? ''}
          title={toStr(props.title)}
          poster={toStr(props.poster)}
        />
      );

    case 'SvgDiagram': {
      // 统一画布：mode 路由 raw(自由SVG) / math(函数图) / molecule(SMILES) / html(沙箱)。
      const mode = isDiagramMode(props.mode) ? props.mode : 'raw';
      const title = props.title ? String(props.title) : undefined;
      return (
        <DiagramCanvas
          mode={mode}
          content={childrenText.trim()}
          title={title}
          width={toNum(props.width)}
          height={toNum(props.height)}
          attrs={props}
          repairContext={{
            modelId: repairContext?.modelId,
            topic: repairContext?.topic,
          }}
          onRevisionAccepted={handleCanvasRevision}
        />
      );
    }

    default:
      return null;
  }
  })();

  if (!inner) return null;
  const fold = VIZ_FOLD[tagName] ?? { titleKey: 'trace.viz.fallback' as I18nKey, icon: <AgentFileIcon size={16} className="shrink-0" /> };
  return (
    <VizFold title={t(fold.titleKey)} icon={fold.icon}>
      {inner}
    </VizFold>
  );
};
