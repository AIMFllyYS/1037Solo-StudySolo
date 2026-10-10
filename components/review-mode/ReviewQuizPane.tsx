"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Sparkles, BookOpen, Loader2, RotateCcw } from "lucide-react";
import QuizQuestion from "@/components/quiz/QuizQuestion";
import type { QuizData, QuizQuestion as Q, UserAnswer } from "@/lib/quiz/types";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import type { QuestionResult } from "@/lib/quiz-store";
import { getAllProgress, saveAttempt } from "@/lib/quiz-progress";
import { completeAgentQuizAttempt } from "@/lib/review-mode/agentQuizProgress";
import { selectWeakPoints } from "@/lib/review-mode/wrongQuestions";
import { getSubject } from "@/lib/content-data";
import type { ContentItem } from "@/lib/types/content";
import { SUBJECT_REGISTRY, type SubjectId } from "@/lib/content-data/subjects.registry";
import { subjectLabel } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import { listClassSources, type ClassSourceSession } from "@/lib/review-mode/classSources";
import { markReinforced, readWrongBook, recordQuestionOutcomes, sourceHref, type WrongEntry } from "@/lib/review-mode/wrongBook";
import { createQuizSetIdentity } from "@/lib/review-mode/quizSnapshot";
import { createAndCheckpointReviewAttempt, loadNewestReviewAttempt, loadWrongAttemptIdsFromAccount, prepareReviewAttemptCheckpoint, retryReviewAttemptSync, savePreparedReviewAttempt } from "@/lib/review-mode/progressSync";
import type { ReviewQuizAttempt, ReviewQuizSet } from "@/lib/review-mode/attemptTypes";
import { getStorageOwner } from "@/lib/storage/ownerScope";

/** 下拉里「课堂记录」这一来源的值：Class 模式的课当作章节。 */
const CLASS_SOURCE = "__class__";

type Mode = "wrong" | "chapter";

interface GeneratedQuiz {
  quizId: string;
  title: string;
  intent?: string;
  questions: Q[];
  droppedCount: number;
  quizData: QuizData;
  attempt: ReviewQuizAttempt;
  contextCoverage?: {
    includedQuestions: number;
    totalQuestions: number;
    omittedQuestions: number;
    includedMaterials: number;
    totalMaterials: number;
    omittedMaterials: number;
    estimatedInputTokens: number;
    maxInputTokens: number;
    estimate: string;
    omittedClientAttemptIds?: number;
    omittedClientLocalQuestions?: number;
    omittedClientWeakPoints?: number;
    unavailableOwnerAttemptIds?: number;
    hasUnscannedAttemptRecords?: boolean;
    includedQuestionKeys?: string[];
  };
  /** 记录归属（chapter 模式带 subject/chapter；wrong 模式记到虚拟章节）。 */
  subjectId: string;
  chapterId: string;
  /** Studio 板块 id（错题回跳 /<subject>/<category>/<item>）。 */
  categoryId?: string;
  /** 本卷依据的错题（交卷成功后标记为已加固）。 */
  reinforcing?: string[];
}

/**
 * 嵌入式出题运行器：复用 QuizQuestion（QuizRunner 逐题所用的同一题目组件）逐题作答，
 * 客观题即时判分，交卷后把成绩写回 quiz-progress（saveAttempt），
 * 让这次结果计入后续「错题智能出题」的薄弱点分析。
 */
function EmbeddedRunner({ quiz, onAttemptChange, onRecorded }: { quiz: GeneratedQuiz; onAttemptChange: (attempt: ReviewQuizAttempt) => void; onRecorded?: () => void }) {
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

export default function ReviewQuizPane() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("wrong");
  const [subjectId, setSubjectId] = useState<SubjectId | typeof CLASS_SOURCE | "">("");
  const auth = useAuthSession();
  const [classSessions, setClassSessions] = useState<ClassSourceSession[]>([]);
  useEffect(() => {
    if (subjectId !== CLASS_SOURCE || !auth.userId) return;
    let active = true;
    listClassSources(auth.userId)
      .then((rows) => {
        if (active) setClassSessions(rows);
      })
      .catch(() => {
        if (active) setClassSessions([]);
      });
    return () => {
      active = false;
    };
  }, [subjectId, auth.userId]);
  const [chapterId, setChapterId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);

  const [bookVersion, setBookVersion] = useState(0);
  const [accountWrongIndex, setAccountWrongAttempts] = useState<{ attemptIds: string[]; hasMoreAttemptRecords: boolean; wrongQuestionCount: number; ownerId: string | null; bookVersion: number }>({ attemptIds: [], hasMoreAttemptRecords: false, wrongQuestionCount: 0, ownerId: null, bookVersion: -1 });
  const accountIndexLoading = auth.status === "signedIn" && (accountWrongIndex.ownerId !== auth.userId || accountWrongIndex.bookVersion !== bookVersion);
  const accountWrongAttempts = !accountIndexLoading && accountWrongIndex.ownerId === auth.userId ? accountWrongIndex : { attemptIds: [], hasMoreAttemptRecords: false, wrongQuestionCount: 0, ownerId: null };
  // 交卷会写入 quiz-progress：随新题目刷新薄弱点，而不是只在挂载时算一次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weakPoints = useMemo(() => selectWeakPoints(getAllProgress()), [quiz, bookVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wrongBook: WrongEntry[] = useMemo(() => readWrongBook(), [bookVersion, auth.userId]);
  const activeWrongEntries = wrongBook.filter((entry) => entry.latestCorrect !== true);
  const canDiagnose = activeWrongEntries.some((entry) => !!entry.question || !!entry.attemptIds?.length) || accountWrongAttempts.wrongQuestionCount > 0;

  const chapters = useMemo(() => {
    if (!subjectId) return [];
    if (subjectId === CLASS_SOURCE) return classSessions.map((s) => ({ id: s.id, title: s.title || "课堂" }));
    const subject = getSubject(subjectId as SubjectId);
    // Group ids such as ch01 don't have a material file; use the actual leaves.
    const detail = subject?.categories.find((c) => c.id === "detail") ?? subject?.categories[0];
    const options: Array<{ id: string; title: string }> = [];
    const visit = (items: ContentItem[], parents: string[]) => {
      for (const item of items) {
        if (item.children?.length) visit(item.children, [...parents, item.title]);
        else if (!item.navigationOnly) options.push({ id: item.id, title: [...parents, item.title].join(" / ") });
      }
    };
    visit(detail?.items ?? [], []);
    return options;
  }, [subjectId, classSessions]);

  const detailCategoryId = useMemo(() => {
    if (!subjectId || subjectId === CLASS_SOURCE) return undefined;
    const subject = getSubject(subjectId as SubjectId);
    return (subject?.categories.find((c) => c.id === "detail") ?? subject?.categories[0])?.id;
  }, [subjectId]);

  useEffect(() => {
    let active = true;
    void loadNewestReviewAttempt(getStorageOwner()).then((resumable) => {
      if (!active || !resumable) return;
      const { attempt, set } = resumable;
      if (attempt.sourceKind !== "review-wrong" && attempt.sourceKind !== "review-chapter" && attempt.sourceKind !== "classroom") return;
      setMode(attempt.sourceKind === "review-wrong" ? "wrong" : "chapter");
      if (attempt.sourceKind === "classroom") setSubjectId(CLASS_SOURCE);
      else if (attempt.sourceKind === "review-chapter" && SUBJECT_REGISTRY.some((subject) => subject.id === attempt.subjectId)) {
        setSubjectId(attempt.subjectId as SubjectId);
        setChapterId(attempt.chapterId);
      }
      setQuiz({
        quizId: attempt.quizId,
        title: attempt.title,
        questions: set.quizData.questions,
        droppedCount: 0,
        subjectId: attempt.subjectId,
        chapterId: attempt.chapterId,
        categoryId: attempt.categoryId ?? undefined,
        quizData: set.quizData,
        attempt,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [auth.userId]);

  useEffect(() => {
    const refreshWrongBook = () => setBookVersion((version) => version + 1);
    window.addEventListener("studysolo:review-wrong-book-change", refreshWrongBook);
    return () => window.removeEventListener("studysolo:review-wrong-book-change", refreshWrongBook);
  }, []);

  useEffect(() => {
    if (auth.status !== "signedIn" || !auth.userId) return;
    let active = true;
    void loadWrongAttemptIdsFromAccount(getStorageOwner()).then((value) => {
      if (active) setAccountWrongAttempts({ ...value, ownerId: auth.userId!, bookVersion });
    }).catch(() => {
      if (active) setAccountWrongAttempts({ attemptIds: [], hasMoreAttemptRecords: true, wrongQuestionCount: 0, ownerId: auth.userId!, bookVersion });
    });
    return () => { active = false; };
  }, [auth.status, auth.userId, bookVersion]);

  async function generate(
    source: Record<string, unknown>,
    recordSubject: string,
    recordChapter: string,
    extra: { categoryId?: string; reinforcing?: string[]; sourceKind: ReviewQuizSet["sourceKind"] } = { sourceKind: "review-chapter" },
  ) {
    const capturedOwner = getStorageOwner();
    setBusy(true);
    setError(null);
    setQuiz(null);
    try {
      const res = await fetch("/api/review/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error === "quota" ? t("review.quiz.quotaError")
          : data.error === "REVIEW_NO_WRONG_CONTEXT" ? t("review.quiz.noWrongContext")
            : data.error === "REVIEW_SOURCE_MATERIAL_UNAVAILABLE" || data.error === "REVIEW_CLASSROOM_MATERIAL_UNAVAILABLE" ? t("review.quiz.sourceMissing")
              : t("review.quiz.error"));
        return;
      }
      const questions: Q[] = Array.isArray(data.questions) ? data.questions : [];
      if (questions.length === 0) {
        setError(t("review.quiz.error"));
        return;
      }
      if (typeof data.quizId !== "string" || !data.quizId) {
        setError(t("review.quiz.error"));
        return;
      }
      if (getStorageOwner() !== capturedOwner) {
        setError(t("review.quiz.accountChanged"));
        return;
      }
      const quizId = data.quizId;
      const title = typeof data.title === "string" && data.title ? data.title : t("review.quiz.title");
      const quizData: QuizData = {
        subjectId: recordSubject,
        chapterId: recordChapter,
        generatedAt: new Date().toISOString(),
        examConfig: { source: title, totalPoints: questions.reduce((sum, question) => sum + maxPointsOf(question), 0) },
        questions,
      };
      const identity = await createQuizSetIdentity({
        sourceKind: extra.sourceKind,
        subjectId: recordSubject,
        categoryId: extra.categoryId ?? null,
        chapterId: recordChapter,
        quizId,
        title,
        quizData,
      });
      const quizSet: ReviewQuizSet = {
        ...identity,
        sourceKind: extra.sourceKind,
        subjectId: recordSubject,
        categoryId: extra.categoryId ?? null,
        chapterId: recordChapter,
        quizId,
        title,
        quizData,
      };
      const attempt = await createAndCheckpointReviewAttempt(quizSet, capturedOwner);
      if (getStorageOwner() !== capturedOwner) {
        setError(t("review.quiz.accountChanged"));
        return;
      }
      setQuiz({
        quizId,
        title,
        intent: data.intent,
        questions,
        droppedCount: data.droppedCount ?? 0,
        subjectId: recordSubject,
        chapterId: recordChapter,
        categoryId: extra.categoryId,
        quizData,
        attempt,
        contextCoverage: data.contextCoverage,
        reinforcing: extra.reinforcing,
      });
    } catch {
      setError(t("review.quiz.error"));
    } finally {
      setBusy(false);
    }
  }

  const onWrong = () => {
    const attempts = [...new Set([...activeWrongEntries.flatMap((entry) => entry.attemptIds ?? []), ...accountWrongAttempts.attemptIds])];
    const attemptIds = attempts.slice(0, 1000);
    const localCandidates = activeWrongEntries.filter((entry) => entry.question).map((entry) => ({
      key: entry.questionKey ?? entry.id,
      title: entry.source.label,
      quizId: entry.source.quizId ?? entry.source.chapterId,
      misses: Math.max(1, entry.misses),
      latestAttemptAt: entry.createdAt,
      question: entry.question!,
    }));
    const localQuestions: typeof localCandidates = [];
    let localBytes = 0;
    for (const entry of localCandidates) {
      const bytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
      if (localQuestions.length >= 20) break;
      if (localBytes + bytes > 110_000) continue;
      localBytes += bytes;
      localQuestions.push(entry);
    }
    const scopedWeakPoints = weakPoints.filter((point) => point.categoryId).map((point) => ({
      subjectId: point.subjectId,
      categoryId: point.categoryId!,
      chapterId: point.chapterId,
      accuracy: point.lastPercent,
      wrongCount: point.wrongCount,
      answeredCount: point.answeredCount,
    }));
    generate({
      kind: "wrong",
      attemptIds,
      hasMoreAttemptRecords: attempts.length > attemptIds.length || accountWrongAttempts.hasMoreAttemptRecords,
      localQuestions,
      omittedLocalQuestionCount: Math.max(0, localCandidates.length - localQuestions.length),
      weakPoints: scopedWeakPoints.slice(0, 20),
      omittedWeakPointCount: Math.max(0, scopedWeakPoints.length - 20),
    }, "review", "wrong-questions", {
      sourceKind: "review-wrong",
      reinforcing: activeWrongEntries.map((entry) => entry.id),
    });
  };

  const onChapter = () => {
    if (!subjectId || !chapterId || !chapters.some((chapter) => chapter.id === chapterId)) return;
    if (subjectId === CLASS_SOURCE) {
      const session = classSessions.find((s) => s.id === chapterId);
      if (!session || !auth.userId) return;
      generate({ kind: "classroom", sessionId: session.id }, "classroom", session.id, { sourceKind: "classroom" });
      return;
    }
    if (!detailCategoryId) return;
    generate({ kind: "chapter", subjectId, categoryId: detailCategoryId, chapterId }, subjectId, chapterId, {
      categoryId: detailCategoryId,
      sourceKind: "review-chapter",
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">{t("review.quiz.studioTitle")}</h2>
          <div role="radiogroup" aria-label={t("review.quiz.modeAria")} className="ml-auto inline-flex rounded-xl bg-[var(--bg-muted)] p-1" data-testid="review-quiz-mode">
            {([
              { value: "wrong" as const, label: t("review.quiz.wrong.title"), Icon: Sparkles },
              { value: "chapter" as const, label: t("review.quiz.chapter.title"), Icon: BookOpen },
            ]).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  mode === value ? "bg-[var(--bg-panel)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
                )}
              >
                <Icon size={14} className={mode === value ? "text-[var(--accent)]" : undefined} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          {/* 错题智能出题 */}
          <section
            className={clsx(
              "rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-4",
              mode !== "wrong" && "hidden",
            )}
            onClick={() => setMode("wrong")}
          >
            <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
              <Sparkles size={16} className="text-[var(--accent)]" />
              {t("review.quiz.wrong.title")}
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{t("review.quiz.wrong.hint")}</p>
            {activeWrongEntries.length > 0 ? (
              <>
                <p className="mb-1 text-[11.5px] font-medium text-[var(--ink-soft)]">
                  {t("review.quiz.wrong.bookList", { count: activeWrongEntries.length })}
                </p>
                <ul className="mb-3 space-y-1 text-[11.5px] text-[var(--ink-faint)]" data-testid="review-wrong-book">
                  {activeWrongEntries.slice(0, 4).map((w) => {
                    const href = sourceHref(w.source);
                    return (
                      <li key={w.id} className="flex min-w-0 items-baseline gap-1.5">
                        <span className="min-w-0 flex-1 truncate" title={w.stem}>
                          · {w.stem.replace(/\$+/g, "").slice(0, 40)}
                        </span>
                        {w.misses > 1 && <span className="shrink-0 text-[var(--md-sys-color-error)]">×{w.misses}</span>}
                        {href ? (
                          <a
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-[var(--accent)] hover:underline"
                            title={t("review.quiz.wrong.jump")}
                          >
                            {w.source.label.length > 12 ? `${w.source.label.slice(0, 12)}…` : w.source.label}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : accountIndexLoading ? (
              <p className="text-[12px] text-[var(--ink-faint)]" role="status">{t("review.quiz.wrong.loading")}</p>
            ) : accountWrongAttempts.wrongQuestionCount > 0 ? (
              <p className="text-[12px] text-[var(--ink-soft)]">{t("review.quiz.wrong.accountSummary", { count: accountWrongAttempts.wrongQuestionCount })}</p>
            ) : weakPoints.length === 0 && !accountWrongAttempts.hasMoreAttemptRecords ? (
              <p className="text-[12px] text-[var(--ink-faint)]">{t("review.quiz.wrong.empty")}</p>
            ) : weakPoints.length > 0 ? (
              <>
                <p className="mb-1 text-[11.5px] font-medium text-[var(--ink-soft)]">{t("review.quiz.wrong.weakList")}</p>
                <ul className="mb-3 space-y-0.5 text-[11.5px] text-[var(--ink-faint)]">
                  {weakPoints.slice(0, 4).map((w) => (
                    <li key={`${w.subjectId}/${w.chapterId}`}>
                      · {w.subjectId === "review" ? t("review.quiz.agentSource") : subjectLabel(w.subjectId)} {w.chapterLabel}（{w.lastPercent} 分）
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {!canDiagnose && weakPoints.length > 0 && (
              <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-faint)]">{t("review.quiz.noWrongContext")}</p>
            )}
            {!canDiagnose && accountWrongAttempts.hasMoreAttemptRecords && (
              <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-faint)]" role="status">{t("review.quiz.wrong.historyIndexIncomplete")}</p>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode("wrong");
                onWrong();
              }}
              disabled={busy || !canDiagnose}
              data-testid="review-quiz-wrong-cta"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] hover:brightness-95 disabled:opacity-50"
            >
              {t("review.quiz.wrong.cta")}
            </button>
          </section>

          {/* 按章节出题 */}
          <section
            className={clsx(
              "rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-4",
              mode !== "chapter" && "hidden",
            )}
            onClick={() => setMode("chapter")}
          >
            <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
              <BookOpen size={16} className="text-[var(--accent)]" />
              {t("review.quiz.chapter.title")}
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{t("review.quiz.chapter.hint")}</p>
            <div className="mb-3 flex flex-col gap-2">
              <select
                value={subjectId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setSubjectId(e.target.value as SubjectId);
                  setChapterId("");
                }}
                aria-label={t("review.quiz.chapter.subject")}
                data-testid="review-quiz-subject"
                className="rounded-lg border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1.5 text-[12.5px] text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">{t("review.quiz.chapter.pickSubject")}</option>
                {auth.userId && <option value={CLASS_SOURCE}>{t("review.quiz.chapter.classSource")}</option>}
                {SUBJECT_REGISTRY.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={chapterId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setChapterId(e.target.value)}
                disabled={!subjectId || chapters.length === 0}
                aria-label={t("review.quiz.chapter.chapter")}
                data-testid="review-quiz-chapter"
                className="rounded-lg border border-[var(--line)] bg-[var(--bg-app)] px-2 py-1.5 text-[12.5px] text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              >
                <option value="">{t("review.quiz.chapter.pickChapter")}</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {subjectId === CLASS_SOURCE ? c.title : `${c.id} ${c.title}`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode("chapter");
                onChapter();
              }}
              disabled={busy || !subjectId || !chapterId || !chapters.some((chapter) => chapter.id === chapterId)}
              data-testid="review-quiz-chapter-cta"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] hover:brightness-95 disabled:opacity-50"
            >
              {t("review.quiz.chapter.cta")}
            </button>
          </section>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[var(--ink-soft)]">
            <Loader2 size={16} className="animate-spin" /> {t("review.quiz.generating")}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[13px] text-[var(--md-sys-color-error)]">{error}</p>
            <button
              type="button"
              onClick={() => (mode === "wrong" ? onWrong() : onChapter())}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            >
              <RotateCcw size={13} /> {t("review.quiz.regenerate")}
            </button>
          </div>
        ) : quiz ? (
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[var(--ink)]">
                {quiz.title} · {t("review.quiz.resultTitle", { count: quiz.questions.length })}
              </h3>
              <button
                type="button"
                onClick={() => (mode === "wrong" ? onWrong() : onChapter())}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
              >
                <RotateCcw size={13} /> {t("review.quiz.regenerate")}
              </button>
            </div>
            {quiz.contextCoverage && (
              <p className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink-soft)]" data-testid="review-context-coverage" data-review-context-question-keys={quiz.contextCoverage.includedQuestionKeys?.join(",")}>
                {t("review.quiz.contextCoverage", {
                  questions: quiz.contextCoverage.includedQuestions,
                  totalQuestions: quiz.contextCoverage.totalQuestions,
                  omittedQuestions: quiz.contextCoverage.omittedQuestions,
                  materials: quiz.contextCoverage.includedMaterials,
                  totalMaterials: quiz.contextCoverage.totalMaterials,
                  omittedMaterials: quiz.contextCoverage.omittedMaterials,
                  tokens: quiz.contextCoverage.estimatedInputTokens,
                  limit: quiz.contextCoverage.maxInputTokens,
                  unavailableAttempts: quiz.contextCoverage.unavailableOwnerAttemptIds ?? 0,
                })}
                {quiz.contextCoverage.hasUnscannedAttemptRecords ? ` ${t("review.quiz.moreAttemptsUnscanned")}` : ""}
              </p>
            )}
            <EmbeddedRunner
              key={quiz.attempt.attemptId}
              quiz={quiz}
              onAttemptChange={(attempt) => setQuiz((current) => current?.attempt.attemptId === attempt.attemptId ? { ...current, attempt } : current)}
              onRecorded={() => {
                if (quiz.reinforcing?.length) {
                  const includedKeys = new Set(quiz.contextCoverage?.includedQuestionKeys ?? []);
                  const includedWrongIds = wrongBook.filter((entry) => entry.questionKey && includedKeys.has(entry.questionKey)).map((entry) => entry.id);
                  markReinforced(includedWrongIds);
                }
                setBookVersion((version) => version + 1);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-center">
            <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-faint)]">{t("review.quiz.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
