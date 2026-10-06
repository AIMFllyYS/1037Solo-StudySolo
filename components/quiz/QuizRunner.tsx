'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QuestionType, QuizQuestion as Q, UserAnswer } from '@/lib/quiz/types';
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from '@/lib/quiz/types';
import type { QuestionResult } from '@/lib/quiz-store';
import QuizQuestion from '@/components/quiz/QuizQuestion';
import { useT, type Translate } from '@/lib/i18n';
import { agentQuizSet, completeAgentQuizAttempt, openAgentQuizAttempt } from '@/lib/review-mode/agentQuizProgress';
import { prepareReviewAttemptCheckpoint, retryReviewAttemptSync, savePreparedReviewAttempt, subscribeReviewAttemptSync } from '@/lib/review-mode/progressSync';
import type { ReviewQuizAttempt, ReviewQuizSet } from '@/lib/review-mode/attemptTypes';
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from '@/lib/storage/ownerScope';
import { saveAttempt } from '@/lib/quiz-progress';
import { recordQuestionOutcomes } from '@/lib/review-mode/wrongBook';

export interface QuizRunnerProps {
  /** 卷面标题。本组件只把它放进无障碍标签——可见标题由宿主承担（折叠头 / 窗口标题）。 */
  title: string;
  /** Stable tool-result identity, shared by inline and dock hosts. */
  quizId?: string;
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
export default function QuizRunner({ title, quizId, questions, intent, droppedCount, collapsed = false }: QuizRunnerProps) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [hintsUsed, setHintsUsed] = useState<string[]>([]);
  const ownerEpoch = useSyncExternalStore(onStorageOwnerChange, getOwnerEpoch, () => 0);
  const attemptRef = useRef<ReviewQuizAttempt | null>(null);
  const setRef = useRef<ReviewQuizSet | null>(null);
  const epochRef = useRef(ownerEpoch);
  const [attempt, setAttempt] = useState<ReviewQuizAttempt | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [loadedScope, setLoadedScope] = useState({ quizId, title, questions, ownerEpoch, loadRevision });
  if (loadedScope.quizId !== quizId || loadedScope.title !== title || loadedScope.questions !== questions || loadedScope.ownerEpoch !== ownerEpoch || loadedScope.loadRevision !== loadRevision) {
    setLoadedScope({ quizId, title, questions, ownerEpoch, loadRevision });
    setAttempt(null); setAnswers({}); setRevealed({}); setHintsUsed([]); setSaveError(false);
  }

  useEffect(() => {
    if (!quizId || !questions.length) return;
    let active = true;
    const owner = getStorageOwner();
    epochRef.current = ownerEpoch;
    attemptRef.current = null;
    setRef.current = null;
    void agentQuizSet(title, questions, quizId).then(async (set) => {
      if (!active || ownerEpoch !== getOwnerEpoch()) return;
      const restored = await openAgentQuizAttempt(set, owner);
      if (!active || ownerEpoch !== getOwnerEpoch()) return;
      setRef.current = set;
      attemptRef.current = restored;
      setAttempt(restored);
      setAnswers(restored.answers);
      setRevealed(Object.fromEntries(restored.revealedQuestionIds.map((id) => [id, true])));
      setHintsUsed(restored.hintsUsed);
    }).catch(() => { if (active) setSaveError(true); });
    return () => { active = false; };
  }, [quizId, title, questions, ownerEpoch, loadRevision]);

  useEffect(() => subscribeReviewAttemptSync((snapshot) => {
    const current = attemptRef.current;
    if (!current || current.attemptId !== snapshot.attemptId || current.revision !== snapshot.revision || epochRef.current !== getOwnerEpoch()) return;
    const next = { ...current, ...snapshot };
    attemptRef.current = next;
    setAttempt(next);
  }), []);

  const checkpoint = (patch: Partial<ReviewQuizAttempt>) => {
    const current = attemptRef.current;
    if (!current || epochRef.current !== getOwnerEpoch()) return;
    try {
      const next = prepareReviewAttemptCheckpoint({ ...current, ...patch });
      attemptRef.current = next;
      setAttempt(next);
      void savePreparedReviewAttempt(next).then(() => setSaveError(false)).catch(() => setSaveError(true));
    } catch { setSaveError(true); }
  };

  const submit = () => {
    const current = attemptRef.current;
    if (!current || current.phase === 'summary' || epochRef.current !== getOwnerEpoch()) return;
    const completed = completeAgentQuizAttempt(current, questions);
    const score = completed.score;
    saveAttempt(current.subjectId, current.chapterId, {
      title: current.title,
      ...score, completedAt: completed.completedAt!, stage: 'final', attemptId: current.attemptId,
      quizId: current.quizId, categoryId: current.categoryId ?? undefined, sourceKind: 'review-chapter',
      objectiveAccuracy: score.objectiveCount ? Math.round(score.correctCount / score.objectiveCount * 1000) / 10 : null,
      perQuestion: completed.questionResults,
    });
    recordQuestionOutcomes(completed.questionResults.map((result, index) => ({ question: questions[index], correct: result.correct, answer: current.answers[result.id] ?? null })),
      { subjectId: current.subjectId, chapterId: current.chapterId, categoryId: current.categoryId ?? undefined, label: title, quizId: current.quizId, attemptId: current.attemptId, contentHash: current.contentHash! }, current.contentHash!, current.attemptId);
    window.dispatchEvent(new Event('studysolo:review-wrong-book-change'));
    checkpoint(completed);
  };

  const reveal = (id: string) => {
    const next = { ...revealed, [id]: true };
    setRevealed(next);
    checkpoint({ revealedQuestionIds: Object.keys(next) });
  };

  const onAnswer = (q: Q, a: UserAnswer) => {
    if (quizId && (!attemptRef.current || attemptRef.current.phase === 'summary' || epochRef.current !== getOwnerEpoch())) return;
    const next = { ...answers, [q.id]: a };
    setAnswers(next);
    checkpoint({ answers: next });
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
      data-review-attempt-id={attempt?.attemptId}
      data-review-quiz-set-id={attempt?.quizSetId ?? undefined}
      data-review-revision={attempt?.revision}
      data-review-server-revision={attempt?.serverRevision}
      data-review-synced-revision={attempt?.syncedRevision}
      role="group"
      aria-label={`${title} · ${intentLabel}`}
    >
      {questions.map((q, i) => {
        const open = !!revealed[q.id];
        const needsConfirm = !isInstantChoice(q.type);
        return (
          <fieldset key={q.id} className="min-w-0" disabled={Boolean(quizId && (!attempt || (attempt.phase === 'summary' && !open)))}>
            <QuizQuestion
              question={q}
              index={i}
              total={questions.length}
              mode={open ? 'review' : 'answer'}
              answer={answers[q.id] ?? null}
              onChange={(a) => onAnswer(q, a)}
              result={results[q.id]}
              hintsUsed={hintsUsed}
              onUseHint={(id) => { const next = hintsUsed.includes(id) ? hintsUsed : [...hintsUsed, id]; setHintsUsed(next); checkpoint({ hintsUsed: next }); }}
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
          </fieldset>
        );
      })}

      {revealedCount > 0 ? (
        <div className="mt-4 flex items-center gap-3 text-[13px]">
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {t('agent.quiz.progress', { done: revealedCount, total: questions.length })}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!quizId) { setAnswers({}); setHintsUsed([]); setRevealed({}); return; }
              const set = setRef.current;
              if (!set || epochRef.current !== getOwnerEpoch()) return;
              setAttempt(null); attemptRef.current = null;
              const capturedEpoch = getOwnerEpoch();
              void openAgentQuizAttempt(set, getStorageOwner(), true).then((next) => {
                if (capturedEpoch !== getOwnerEpoch()) return;
                attemptRef.current = next; setAttempt(next); setAnswers({}); setHintsUsed([]); setRevealed({});
              }).catch(() => setSaveError(true));
            }}
            className="ml-auto rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[12px] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            {t('agent.quiz.redo')}
          </button>
        </div>
      ) : null}

      {quizId && attempt && revealedCount > 0 && attempt.phase !== 'summary' ? (
        <button type="button" data-testid="agent-quiz-record" onClick={submit} className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-primary)]">
          {t(revealedCount === questions.length ? 'review.quiz.submit' : 'review.quiz.submitPartial')}
        </button>
      ) : null}
      {quizId && attempt?.phase === 'summary' ? <p data-testid="agent-quiz-score" className="text-[13px] text-[var(--ink)]">{attempt.score.earned} / {attempt.score.max} · {attempt.score.percent ?? '—'}% · {t('review.quiz.recorded')}</p> : null}
      {quizId && attempt?.phase === 'summary' && questions.length > attempt.score.scoredCount ? <p className="text-[12px] text-[var(--ink-soft)]">{t('review.quiz.unscored', { count: questions.length - attempt.score.scoredCount })}</p> : null}
      {quizId ? <div role="status" className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--ink-faint)]">
        {attempt ? t(`review.quiz.sync.${attempt.syncState}`) : !saveError ? t('review.quiz.sync.retrying') : null}
        {saveError ? <span role="alert">{t('review.quiz.localSaveFailed')}</span> : null}
        {saveError || attempt?.syncState === 'pending' ? <button type="button" onClick={() => {
          if (!attemptRef.current) { setLoadRevision((value) => value + 1); return; }
          void savePreparedReviewAttempt(attemptRef.current).then(() => retryReviewAttemptSync(attemptRef.current!)).then(() => setSaveError(false)).catch(() => setSaveError(true));
        }} className="rounded-md border border-[var(--line)] px-2 py-0.5">{t('review.quiz.sync.retry')}</button> : null}
      </div> : null}

      {droppedCount ? (
        <div className="mt-3 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {t('agent.quiz.dropped', { count: droppedCount })}
        </div>
      ) : null}
    </div>
  );
}
