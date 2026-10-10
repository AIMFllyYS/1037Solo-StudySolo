'use client';

import React, { useState } from 'react';
import type { QuizQuestion as Q } from '@/lib/quiz/types';
import QuizRunner, { intentLabelOf } from '@/components/quiz/QuizRunner';
import { AgentQuizIcon } from '@/components/icons/AgentIcons';
import AgentFoldHeader from '@/components/chat/trace/AgentFoldHeader';
import { useT } from '@/lib/i18n/index';

interface ChatQuizCardProps {
  quizId?: string;
  title: string;
  questions: Q[];
  intent?: string;
  droppedCount?: number;
}

/**
 * 对话流里的出题卡（Studio / 非 Agent 面）：折叠头 + 作答主体。
 * 作答主体见 `@/components/quiz/QuizRunner`——右栏出题窗复用同一份实现。
 * 收起时 QuizRunner 仍挂载（只返回 null），所以折叠再展开不会丢作答进度。
 */
export default function ChatQuizCard({ quizId, title, questions, intent, droppedCount }: ChatQuizCardProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (!questions.length) {
    return (
      <div className="my-3 min-w-0 overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        {t('agent.quiz.empty')}
      </div>
    );
  }

  const intentLabel = intentLabelOf(t, intent);

  return (
    <div className="chat-quiz-card agent-fold my-3" data-testid="chat-quiz-card">
      <AgentFoldHeader
        icon={<AgentQuizIcon size={16} className="shrink-0" />}
        title={t('agent.quiz.card.title', { title, count: questions.length })}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        action={<span className="shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{intentLabel}</span>}
      />

      <QuizRunner
        quizId={quizId}
        title={title}
        questions={questions}
        intent={intent}
        droppedCount={droppedCount}
        collapsed={!expanded}
      />
    </div>
  );
}
