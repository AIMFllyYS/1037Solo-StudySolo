'use client';

import React, { useState } from 'react';
import { AgentChevronIcon } from '@/components/icons/AgentIcons';
import AgentFoldHeader from '@/components/chat/trace/AgentFoldHeader';

export default function VizFold({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div className="agent-fold viz-fold" data-testid="viz-fold">
      <AgentFoldHeader
        icon={icon ?? <AgentChevronIcon size={16} className="shrink-0 opacity-0" />}
        title={title}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? <div className="viz-fold-body">{children}</div> : null}
    </div>
  );
}
