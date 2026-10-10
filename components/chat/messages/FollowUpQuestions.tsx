'use client';

import React from 'react';
import { HelpCircle, Lightbulb } from 'lucide-react';
import QuizMarkdown from '@/components/quiz/QuizMarkdown';
import { openSourceTrace } from '@/lib/chat/sources/openSourceTrace';
import type { TraceSource } from '@/lib/chat/sources/traceSources';
import { useIsAgentSurface } from '@/lib/window/useManagedWindowSurface';
import { useT } from '@/lib/i18n/index';

interface FollowUpQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  title?: string;
  sources?: TraceSource[];
}

export const FollowUpQuestions: React.FC<FollowUpQuestionsProps> = ({
  questions,
  onSelect,
  title,
  sources = [],
}) => {
  const t = useT();
  const isAgentSurface = useIsAgentSurface();
  const questionList = questions ?? [];
  const showSources = sources.length > 0 && !isAgentSurface;
  if (questionList.length === 0 && !showSources) return null;

  return (
    <div className="followup-card" data-testid="followups">
      <div className="followup-header">
        <Lightbulb size={14} style={{ color: 'var(--md-sys-color-primary)' }} />
        <span className="followup-title">{questionList.length ? (title ?? t('trace.followUp.title')) : t('trace.followUp.sourcesOnly')}</span>
        {showSources ? (
          <button
            type="button"
            className="followup-sources"
            onClick={() => openSourceTrace(sources)}
          >
            {t('agent.sources.count', { count: sources.length })}
          </button>
        ) : null}
      </div>
      {questionList.length > 0 ? (
        <div className="followup-list">
          {questionList.map((question, index) => (
            <button
              key={index}
              onClick={() => onSelect(question)}
              className="followup-btn"
              type="button"
            >
              <HelpCircle size={14} style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }} />
              <span className="followup-btn-text"><QuizMarkdown inline>{question}</QuizMarkdown></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
