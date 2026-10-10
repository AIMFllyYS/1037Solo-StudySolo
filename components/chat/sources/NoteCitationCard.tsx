'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentFileIcon } from '@/components/icons/AgentIcons';
import type { SearchHit } from '@/lib/ai/agent/toolTypes';
import { dedupeByKey, noteItemKey } from '@/lib/chat/traceSources';
import { useNoteCitations } from '@/lib/hooks/useNoteCitations';
import { requestCitedNote } from '@/lib/notes/openCitedNote';
import AgentFoldHeader from '@/components/chat/trace/AgentFoldHeader';
import { useT } from '@/lib/i18n/index';

export default function NoteCitationCard({ hits }: { hits: SearchHit[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const openViewer = useNoteCitations((s) => s.openViewer);
  const router = useRouter();
  const unique = dedupeByKey(hits, noteItemKey);

  if (!unique.length) return null;

  const openInNotes = (path: string, snippet: string) => {
    const href = requestCitedNote(path, snippet);
    if (href) router.push(href);
  };

  return (
    <div className="note-citation-card agent-fold" data-testid="note-citation-card">
      <AgentFoldHeader
        icon={<AgentFileIcon size={16} className="shrink-0" />}
        title={t('trace.citations.title', { count: unique.length })}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        action={(
          <button
            type="button"
            className="agent-fold-action"
            onClick={() => openViewer(unique, unique[0]?.path)}
          >
            {t('trace.citations.open')}
          </button>
        )}
      />
      {expanded ? (
        <ul className="agent-fold-list hide-scrollbar">
          {unique.map((hit) => (
            <li key={hit.path}>
              <button
                type="button"
                className="note-citation-card-item"
                onClick={() => openInNotes(hit.path, hit.snippet)}
              >
                <span className="note-citation-card-title">{hit.title}</span>
                <span className="note-citation-card-path">{hit.path}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
