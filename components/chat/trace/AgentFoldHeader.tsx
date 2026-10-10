'use client';

import React from 'react';
import { AgentChevronIcon } from '@/components/icons/AgentIcons';
import { useT } from '@/lib/i18n/index';

export default function AgentFoldHeader({
  icon,
  title,
  expanded,
  onToggle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="agent-fold-header">
      <button
        type="button"
        className="agent-fold-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {action}
      <button
        type="button"
        className="agent-fold-chevron"
        aria-expanded={expanded}
        aria-label={expanded ? t('panel.common.collapse') : t('trace.fold.expand')}
        onClick={onToggle}
      >
        <AgentChevronIcon
          size={14}
          className="opacity-70"
          style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
        />
      </button>
    </div>
  );
}
