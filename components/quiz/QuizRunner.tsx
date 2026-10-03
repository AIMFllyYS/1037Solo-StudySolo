'use client';

import React, { useMemo, useState } from 'react';
import type { QuestionType, QuizQuestion as Q, UserAnswer } from '@/lib/quiz/types';
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from '@/lib/quiz/types';
import type { QuestionResult } from '@/lib/quiz-store';
import QuizQuestion from '@/components/quiz/QuizQuestion';
import { useT, type Translate } from '@/lib/i18n';

export interface QuizRunnerProps {
  /** 卷面标题。本组件只把它放进无障碍标签——可见标题由宿主承担（折叠头 / 窗口标题）。 */
  title: string;
  questions: Q[];
  intent?: string;
  droppedCount?: number;
  /**
   * 折叠卡里收起时置 true：组件**保持挂载**（作答进度不随折叠丢失）但不渲染任何内容。
   * 右栏出题窗不带这个属性，永远展开。
   */
  collapsed?: boolean;
}

const INTENT_LABEL_KEY: Record<string, string> = {
  check: 'agent.quiz.intent.check',
  diagnose: 'agent.quiz.intent.diagnose',
  practice: 'agent.quiz.intent.practice',
  exam: 'agent.quiz.intent.exam',
};

/** 出题意图的展示文案；未知意图原样透出（模型可能给出词典外的值）。 */
export function intentLabelOf(t: Translate, intent?: string): string {
  if (!intent) return t('agent.quiz.intent.practice');
  const key = INTENT_LABEL_KEY[intent];
  return key ? t(key) : intent;
}

/** 点一下选项就能判定：单选 / 判断。多选要先选完再确认，避免半途揭晓。 */
function isInstantChoice(type: QuestionType): boolean {
  return type === 'single_choice' || type === 'true_false';
}

function isAnswered(answer: UserAnswer | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (typeof answer === 'object') return Object.keys(answer).length > 0;
  return true;
}

function resultOf(q: Q, answer: UserAnswer): QuestionResult {
  const max = maxPointsOf(q);
  if (isObjectivelyGradableQuestion(q)) {
    const [awarded, correct] = autoGrade(q, answer);
    return { question: q, answer, awarded, max, correct, objective: true, selfScored: false };
  }
  return { question: q, answer, awarded: 0, max, correct: false, objective: false, selfScored: false };
}

function revealLabel(t: Translate, type: QuestionType): string {
  if (type === 'fill_blank') return t('agent.quiz.reveal.blank');
  if (type === 'multiple_choice') return t('agent.quiz.reveal.multiple');
  return t('agent.quiz.reveal.default');
}

/**
 * 出题作答主体：逐题作答（即时判定 / 确认揭晓）、已反馈进度、重做、丢弃题提示。
 * 两个宿主共用——对话流里的 `ChatQuizCard`（折叠头 + 本组件）与右栏 `AgentQuizWindow`。
 */
export default function QuizRunner({ title, questions, intent, droppedCount, collapsed = false }: QuizRunnerProps) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [hintsUsed, setHintsUsed] = useState<string[]>([]);

  const reveal = (id: string) => setRevealed((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  const onAnswer = (q: Q, a: UserAnswer) => {
    setAnswers((prev) => ({ ...prev, [q.id]: a }));
    if (isInstantChoice(q.type)) reveal(q.id);
  };

  const results = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    for (const q of questions) {
      if (!revealed[q.id]) continue;
      map[q.id] = resultOf(q, answers[q.id] ?? null);
    }
    return map;
  }, [questions, answers, revealed]);

  if (collapsed) return null;

  if (!questions.length) {
    return (
      <div className="my-3 min-w-0 overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        {t('agent.quiz.empty')}
      </div>
    );
  }

  const revealedCount = questions.filter((q) => revealed[q.id]).length;
  const intentLabel = intentLabelOf(t, intent);

  return (
    <div
      className="chat-quiz-body space-y-5"
      data-testid="quiz-runner"
      role="group"
      aria-label={`${title} · ${intentLabel}`}
    >
      {questions.map((q, i) => {
        const open = !!revealed[q.id];
        const needsConfirm = !isInstantChoice(q.type);
        return (
          <div key={q.id} className="min-w-0">
            <QuizQuestion
              question={q}
              index={i}
              total={questions.length}
              mode={open ? 'review' : 'answer'}
              answer={answers[q.id] ?? null}
              onChange={(a) => onAnswer(q, a)}
              result={results[q.id]}
              hintsUsed={hintsUsed}
              onUseHint={(id) => setHintsUsed((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            />
            {needsConfirm && !open ? (
              <button
                type="button"
                disabled={!isAnswered(answers[q.id])}
                onClick={() => reveal(q.id)}
                className="mt-3 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
              >
                {revealLabel(t, q.type)}
              </button>
            ) : null}
          </div>
        );
      })}

      {revealedCount > 0 ? (
        <div className="mt-4 flex items-center gap-3 text-[13px]">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {t('agent.quiz.progress', { done: revealedCount, total: questions.length })}
          </span>
          <button
            type="button"
            onClick={() => { setAnswers({}); setHintsUsed([]); setRevealed({}); }}
            className="ml-auto rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[12px] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            {t('agent.quiz.redo')}
          </button>
        </div>
      ) : null}

      {droppedCount ? (
        <div className="mt-3 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {t('agent.quiz.dropped', { count: droppedCount })}
        </div>
      ) : null}
    </div>
  );
}
