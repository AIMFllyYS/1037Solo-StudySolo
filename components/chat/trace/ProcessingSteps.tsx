'use client';

import React, { useMemo } from 'react';
import type { ChatMessage } from '@/lib/types/chat';
import { buildTrace } from '@/lib/chat/messages/buildTrace';
import { AgentTrace } from '@/components/chat/trace/AgentTrace';
import { useT } from '@/lib/i18n/index';

/** Compatibility entry point; new message rendering uses AgentTrace directly. */
export default function ProcessingSteps({ msg, streaming = false }: { msg: ChatMessage; streaming?: boolean }) {
  const t = useT();
  const parts = msg.parts;
  const stepDurationsMs = msg.metadata?.stepDurationsMs;
  const trace = useMemo(
    () => buildTrace({ parts, metadata: stepDurationsMs ? { stepDurationsMs } : undefined }, streaming, t),
    [parts, stepDurationsMs, streaming, t],
  );
  return <AgentTrace trace={trace} isStreaming={streaming} durationMs={msg.metadata?.durationMs} />;
}
