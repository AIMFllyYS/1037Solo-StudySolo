import { useEffect, useMemo, useRef, useState } from "react";

import QuizQuestion from "@/components/quiz/QuizQuestion";
import type { UserAnswer } from "@/lib/quiz/types";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import type { QuestionResult } from "@/lib/quiz-store";
import { saveAttempt } from "@/lib/quiz-progress";
import { completeAgentQuizAttempt } from "@/lib/review-mode/agentQuizProgress";

import { useT } from "@/lib/i18n";

import { recordQuestionOutcomes } from "@/lib/review-mode/wrongBook";

import { prepareReviewAttemptCheckpoint, retryReviewAttemptSync, savePreparedReviewAttempt } from "@/lib/review-mode/progressSync";
import type { ReviewQuizAttempt } from "@/lib/review-mode/attemptTypes";

import type { GeneratedQuiz } from '@/lib/review-mode/generatedQuizTypes';

/**
 * 嵌入式出题运行器：复用 QuizQuestion（QuizRunner 逐题所用的同一题目组件）逐题作答，
 * 客观题即时判分，交卷后把成绩写回 quiz-progress（saveAttempt），
 * 让这次结果计入后续「错题智能出题」的薄弱点分析。
 */
export function EmbeddedQuizRunner({ quiz, onAttemptChange, onRecorded }: { quiz: GeneratedQuiz; onAttemptChange: (attempt: ReviewQuizAttempt) => void; onRecorded?: () => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>(quiz.attempt.answers);
  const [revealed, setRevealed] = useState<Record<string, boolean>>(() => Object.fromEntries(quiz.attempt.revealedQuestionIds.map((id) => [id, true])));
  const [recorded, setRecorded] = useState(quiz.attempt.phase === "summary");
  const [wrongRecorded, setWrongRecorded] = useState(quiz.attempt.questionResults.filter((result) => result.correct === false).length);
  const [retryingSync, setRetryingSync] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const attemptRef = useRef(quiz.attempt);

  useEffect(() => {
    if (quiz.attempt.attemptId === attemptRef.current.attemptId && quiz.attempt.revision >= attemptRef.current.revision) {
      attemptRef.current = quiz.attempt;
    }
  }, [quiz.attempt]);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<Pick<ReviewQuizAttempt, "attemptId" | "syncState" | "revision" | "serverRevision" | "syncedRevision">>).detail;
      const current = attemptRef.current;
      if (!detail || detail.attemptId !== current.attemptId || detail.revision !== current.revision) return;
      const next = { ...current, syncState: detail.syncState, serverRevision: detail.serverRevision, syncedRevision: detail.syncedRevision };
      attemptRef.current = next;
      onAttemptChange(next);
    };
    window.addEventListener("studysolo:review-attempt-sync", sync);
    return () => window.removeEventListener("studysolo:review-attempt-sync", sync);
  }, [onAttemptChange]);

  const checkpoint = (patch: Partial<ReviewQuizAttempt>) => {
    const current = attemptRef.current;
    try {
      const next = prepareReviewAttemptCheckpoint({ ...current, ...patch }, current.ownerId);
      attemptRef.current = next;
      onAttemptChange(next);
      void savePreparedReviewAttempt(next, current.ownerId).then(() => setPersistenceWarning(null)).catch((error: unknown) => {
        setPersistenceWarning(error instanceof Error && error.message === "REVIEW_OWNER_CHANGED" ? t("review.quiz.accountChanged") : t("review.quiz.localSaveFailed"));
      });
    } catch (error) {
      // Keep the answer in the component state; an owner switch must not write it under a new account.
      setPersistenceWarning(error instanceof Error && error.message === "REVIEW_OWNER_CHANGED" ? t("review.quiz.accountChanged") : t("review.quiz.localSaveFailed"));
    }
  };

  const reveal = (id: string) => {
    if (revealed[id] || attemptRef.current.phase === "summary") return;
    const next = { ...revealed, [id]: true };
    setRevealed(next);
    checkpoint({ revealedQuestionIds: Object.keys(next) });
  };

  const results = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    for (const q of quiz.questions) {
      if (!revealed[q.id]) continue;
      const max = maxPointsOf(q);
      if (isObjectivelyGradableQuestion(q)) {
        const [awarded, correct] = autoGrade(q, answers[q.id] ?? null);
        map[q.id] = { question: q, answer: answers[q.id] ?? null, awarded, max, correct, objective: true, selfScored: false };
      } else {
        map[q.id] = { question: q, answer: answers[q.id] ?? null, awarded: 0, max, correct: false, objective: false, selfScored: false };
      }
    }
    return map;
  }, [quiz.questions, answers, revealed]);

  const recordAttempt = () => {
    if (attemptRef.current.phase === "summary") return;
    const current = attemptRef.current;
    const completed = completeAgentQuizAttempt({ ...current, answers, revealedQuestionIds: Object.keys(revealed) }, quiz.questions);
    const { questionResults, score: attemptScore, completedAt } = completed;
    const { earned, max } = attemptScore;
    const outcomes = questionResults.map((result, index) => ({ question: quiz.questions[index], correct: result.correct, answer: answers[result.id] ?? null }));
    const wrong = outcomes.filter((entry) => entry.correct === false);
    recordQuestionOutcomes(outcomes, {
      subjectId: quiz.subjectId,
      chapterId: quiz.chapterId,
      categoryId: quiz.categoryId,
      label: quiz.title,
      quizId: quiz.quizId,
      attemptId: current.attemptId,
      contentHash: current.contentHash ?? undefined,
    }, current.contentHash ?? "", current.attemptId);
    setWrongRecorded(wrong.length);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("studysolo:review-wrong-book-change"));
    saveAttempt(quiz.subjectId, quiz.chapterId, {
      title: current.title,
      earned,
      max,
      percent: attemptScore.percent,
      completedAt: completedAt!,
      stage: "final",
      attemptId: current.attemptId,
      quizId: quiz.quizId,
      categoryId: quiz.categoryId,
      sourceKind: current.sourceKind,
      objectiveCount: attemptScore.objectiveCount,
      correctCount: attemptScore.correctCount,
      scoredCount: attemptScore.scoredCount,
      objectiveAccuracy: attemptScore.objectiveCount ? Math.round((attemptScore.correctCount / attemptScore.objectiveCount) * 1000) / 10 : null,
      perQuestion: questionResults,
    });
    checkpoint({
      phase: "summary",
      stage: "final",
      answers,
      revealedQuestionIds: Object.keys(revealed),
      questionResults,
      score: attemptScore,
      completedAt,
    });
    setRecorded(true);
    onRecorded?.();
  };

  const objectiveCount = quiz.questions.filter((q) => isObjectivelyGradableQuestion(q)).length;
  const answeredObjective = quiz.questions.filter((q) => isObjectivelyGradableQuestion(q) && revealed[q.id]).length;
  const allAnswered = objectiveCount > 0 && answeredObjective === objectiveCount;

  return (
    <div className="space-y-5" data-testid="review-quiz-runner" data-review-attempt-id={quiz.attempt.attemptId} data-review-quiz-set-id={quiz.attempt.quizSetId ?? undefined}>
      {quiz.questions.map((q, i) => {
        const open = !!revealed[q.id];
        const needsConfirm = !(q.type === "single_choice" || q.type === "true_false");
        return (
          <fieldset key={q.id} className="min-w-0" disabled={recorded && !open}>
            <QuizQuestion
              question={q}
              index={i}
              total={quiz.questions.length}
              mode={open ? "review" : "answer"}
              answer={answers[q.id] ?? null}
              onChange={(a) => {
                if (attemptRef.current.phase === "summary") return;
                const nextAnswers = { ...answers, [q.id]: a };
                setAnswers(nextAnswers);
                checkpoint({ answers: nextAnswers, currentIndex: i });
                if (!needsConfirm) reveal(q.id);
              }}
              result={results[q.id]}
            />
            {!open && needsConfirm && (
              <button
                type="button"
                onClick={() => reveal(q.id)}
                className="mt-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
              >
                {t("agent.quiz.reveal.default")}
              </button>
            )}
          </fieldset>
        );
      })}

      {answeredObjective > 0 && !recorded && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <span className="text-[12.5px] text-[var(--ink-soft)]">
            {t("review.quiz.progress", { done: answeredObjective, total: objectiveCount })}
          </span>
          <button
            type="button"
            onClick={recordAttempt}
            data-testid="review-quiz-record"
            className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:brightness-95"
          >
            {allAnswered ? t("review.quiz.submit") : t("review.quiz.submitPartial")}
          </button>
        </div>
      )}
      {recorded && (
        <p className="text-[12.5px] text-[var(--color-success)]" data-testid="review-quiz-score">
          {quiz.attempt.score.earned} / {quiz.attempt.score.max} · {quiz.attempt.score.percent ?? "—"}% · ✓ {t("review.quiz.recorded")}
          {wrongRecorded > 0 ? ` ${t("review.quiz.wrongRecorded", { count: wrongRecorded })}` : ""}
        </p>
      )}
      {recorded && quiz.questions.length > quiz.attempt.score.scoredCount ? <p className="text-[12px] text-[var(--ink-soft)]">{t("review.quiz.unscored", { count: quiz.questions.length - quiz.attempt.score.scoredCount })}</p> : null}
      {persistenceWarning ? <p className="text-[12px] text-[var(--md-sys-color-error)]" role="alert">{persistenceWarning}</p> : null}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--ink-faint)]" role="status" aria-live="polite">
        <span>{t(`review.quiz.sync.${quiz.attempt.syncState}`)}</span>
        {quiz.attempt.syncState === "pending" && (
          <button
            type="button"
            disabled={retryingSync}
            onClick={() => {
              setRetryingSync(true);
              void retryReviewAttemptSync(attemptRef.current).catch(() => {}).finally(() => setRetryingSync(false));
            }}
            className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-50"
          >
            {retryingSync ? t("review.quiz.sync.retrying") : t("review.quiz.sync.retry")}
          </button>
        )}
      </div>
    </div>
  );
}