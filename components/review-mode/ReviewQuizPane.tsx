"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Sparkles, BookOpen, Loader2, RotateCcw } from "lucide-react";
import QuizQuestion from "@/components/quiz/QuizQuestion";
import type { QuizQuestion as Q, UserAnswer } from "@/lib/quiz/types";
import { autoGrade, isObjective, maxPointsOf } from "@/lib/quiz/types";
import type { QuestionResult } from "@/lib/quiz-store";
import { getAllProgress, saveAttempt, type QuestionScore } from "@/lib/quiz-progress";
import { buildWrongQuestionPrompt, selectWeakPoints } from "@/lib/review-mode/wrongQuestions";
import { getSubject } from "@/lib/content-data";
import { SUBJECT_REGISTRY, type SubjectId } from "@/lib/content-data/subjects.registry";
import { subjectLabel } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { listClassSources, loadClassQuizPrompt, type ClassSourceSession } from "@/lib/review-mode/classSources";
import { buildReinforcePrompt, markReinforced, readWrongBook, recordWrongQuestions, sourceHref, type WrongEntry } from "@/lib/review-mode/wrongBook";

/** 下拉里「课堂记录」这一来源的值：Class 模式的课当作章节。 */
const CLASS_SOURCE = "__class__";

type Mode = "wrong" | "chapter";

interface GeneratedQuiz {
  quizId: string;
  title: string;
  intent?: string;
  questions: Q[];
  droppedCount: number;
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
function EmbeddedRunner({ quiz, onRecorded }: { quiz: GeneratedQuiz; onRecorded?: () => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [recorded, setRecorded] = useState(false);
  const [wrongRecorded, setWrongRecorded] = useState(0);

  const reveal = (id: string) => setRevealed((p) => (p[id] ? p : { ...p, [id]: true }));

  const results = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    for (const q of quiz.questions) {
      if (!revealed[q.id]) continue;
      const max = maxPointsOf(q);
      if (isObjective(q.type)) {
        const [awarded, correct] = autoGrade(q, answers[q.id] ?? null);
        map[q.id] = { question: q, answer: answers[q.id] ?? null, awarded, max, correct, objective: true };
      } else {
        map[q.id] = { question: q, answer: answers[q.id] ?? null, awarded: 0, max, correct: false, objective: false };
      }
    }
    return map;
  }, [quiz.questions, answers, revealed]);

  const recordAttempt = () => {
    const objective = quiz.questions.filter((q) => isObjective(q.type));
    if (objective.length === 0) {
      setRecorded(true);
      return;
    }
    let earned = 0;
    let max = 0;
    const perQuestion: QuestionScore[] = [];
    for (const q of objective) {
      const [awarded, correct] = autoGrade(q, answers[q.id] ?? null);
      const qMax = maxPointsOf(q);
      earned += awarded;
      max += qMax;
      perQuestion.push({ id: q.id, awarded, max: qMax, correct });
    }
    const percent = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
    // 答错的客观题进错题本（带出处），供「错题智能出题」按真实错题加固、并可跳回知识点。
    const wrong = objective.filter((q) => revealed[q.id] && !autoGrade(q, answers[q.id] ?? null)[1]);
    recordWrongQuestions(wrong, {
      subjectId: quiz.subjectId,
      chapterId: quiz.chapterId,
      categoryId: quiz.categoryId,
      label: quiz.title,
    });
    setWrongRecorded(wrong.length);
    onRecorded?.();
    saveAttempt(quiz.subjectId, quiz.chapterId, {
      earned,
      max,
      percent,
      completedAt: new Date().toISOString(),
      stage: "final",
      perQuestion,
    });
    setRecorded(true);
  };

  const objectiveCount = quiz.questions.filter((q) => isObjective(q.type)).length;
  const answeredObjective = quiz.questions.filter((q) => isObjective(q.type) && revealed[q.id]).length;
  const allAnswered = objectiveCount > 0 && answeredObjective === objectiveCount;

  return (
    <div className="space-y-5" data-testid="review-quiz-runner">
      {quiz.questions.map((q, i) => {
        const open = !!revealed[q.id];
        const needsConfirm = !(q.type === "single_choice" || q.type === "true_false");
        return (
          <div key={q.id} className="min-w-0">
            <QuizQuestion
              question={q}
              index={i}
              total={quiz.questions.length}
              mode={open ? "review" : "answer"}
              answer={answers[q.id] ?? null}
              onChange={(a) => {
                setAnswers((prev) => ({ ...prev, [q.id]: a }));
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
          </div>
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
        <p className="text-[12.5px] text-[var(--color-success)]">
          ✓ {t("review.quiz.recorded")}
          {wrongRecorded > 0 ? ` ${t("review.quiz.wrongRecorded", { count: wrongRecorded })}` : ""}
        </p>
      )}
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
  // 交卷会写入 quiz-progress：随新题目刷新薄弱点，而不是只在挂载时算一次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weakPoints = useMemo(() => selectWeakPoints(getAllProgress()), [quiz, bookVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wrongBook: WrongEntry[] = useMemo(() => readWrongBook(), [bookVersion, auth.userId]);
  const canDiagnose = wrongBook.length > 0 || weakPoints.length > 0;

  const chapters = useMemo(() => {
    if (!subjectId) return [];
    if (subjectId === CLASS_SOURCE) return classSessions.map((s) => ({ id: s.id, title: s.title || "课堂" }));
    const subject = getSubject(subjectId as SubjectId);
    // detail 板块的顶层小节作为「章节」候选。
    const detail = subject?.categories.find((c) => c.id === "detail") ?? subject?.categories[0];
    return (detail?.items ?? []).filter((it) => !it.navigationOnly);
  }, [subjectId, classSessions]);

  const detailCategoryId = useMemo(() => {
    if (!subjectId || subjectId === CLASS_SOURCE) return undefined;
    const subject = getSubject(subjectId as SubjectId);
    return (subject?.categories.find((c) => c.id === "detail") ?? subject?.categories[0])?.id;
  }, [subjectId]);

  async function generate(
    instruction: string,
    title: string,
    recordSubject: string,
    recordChapter: string,
    extra: { categoryId?: string; reinforcing?: string[] } = {},
  ) {
    setBusy(true);
    setError(null);
    setQuiz(null);
    try {
      const res = await fetch("/api/review/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ instruction, title, mode }),
      });
      const data = await res.json();
      if (!res.ok || data.error === "quota") {
        setError(t("review.quiz.quotaError"));
        return;
      }
      const questions: Q[] = Array.isArray(data.questions) ? data.questions : [];
      if (questions.length === 0) {
        setError(t("review.quiz.error"));
        return;
      }
      setQuiz({
        quizId: data.quizId ?? `review_${Date.now()}`,
        title: data.title ?? title,
        intent: data.intent,
        questions,
        droppedCount: data.droppedCount ?? 0,
        subjectId: recordSubject,
        chapterId: recordChapter,
        ...extra,
      });
      if (extra.reinforcing?.length) {
        markReinforced(extra.reinforcing);
        setBookVersion((v) => v + 1);
      }
    } catch {
      setError(t("review.quiz.error"));
    } finally {
      setBusy(false);
    }
  }

  const onWrong = () => {
    const reinforce = buildReinforcePrompt(wrongBook);
    if (reinforce) {
      generate(reinforce, t("review.quiz.wrong.title"), "review", "wrong-questions", {
        reinforcing: wrongBook.slice(0, 8).map((e) => e.id),
      });
      return;
    }
    const prompt = buildWrongQuestionPrompt(weakPoints, (id) => subjectLabel(id));
    generate(prompt, t("review.quiz.wrong.title"), "review", "wrong-questions");
  };

  const onChapter = () => {
    if (!subjectId || !chapterId) return;
    if (subjectId === CLASS_SOURCE) {
      const session = classSessions.find((s) => s.id === chapterId);
      if (!session || !auth.userId) return;
      const name = `课堂 · ${session.title || "课堂"}`;
      setBusy(true);
      setError(null);
      loadClassQuizPrompt(auth.userId, session)
        .then((prompt) => generate(prompt, name, "classroom", session.id))
        .catch(() => {
          setError(t("review.quiz.error"));
          setBusy(false);
        });
      return;
    }
    const subject = getSubject(subjectId as SubjectId);
    const item = chapters.find((c) => c.id === chapterId);
    const name = `${subject?.name ?? subjectId} · ${item?.title ?? chapterId}`;
    const prompt =
      `请针对「${name}」这一章节的核心知识点，出一套 6–8 道练习题（intent=practice），` +
      `题型混合单选/多选/判断/填空，覆盖重点概念、公式与易错点，每题都给出解析。`;
    generate(prompt, name, subjectId, chapterId, { categoryId: detailCategoryId });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {/* 错题智能出题 */}
          <section
            className={clsx(
              "rounded-xl border p-4",
              mode === "wrong" ? "border-[var(--accent)] bg-[var(--accent-weak)]/30" : "border-[var(--line)] bg-[var(--bg-panel)]",
            )}
            onClick={() => setMode("wrong")}
          >
            <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
              <Sparkles size={16} className="text-[var(--accent)]" />
              {t("review.quiz.wrong.title")}
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{t("review.quiz.wrong.hint")}</p>
            {wrongBook.length > 0 ? (
              <>
                <p className="mb-1 text-[11.5px] font-medium text-[var(--ink-soft)]">
                  {t("review.quiz.wrong.bookList", { count: wrongBook.length })}
                </p>
                <ul className="mb-3 space-y-1 text-[11.5px] text-[var(--ink-faint)]" data-testid="review-wrong-book">
                  {wrongBook.slice(0, 4).map((w) => {
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
            ) : weakPoints.length === 0 ? (
              <p className="text-[12px] text-[var(--ink-faint)]">{t("review.quiz.wrong.empty")}</p>
            ) : (
              <>
                <p className="mb-1 text-[11.5px] font-medium text-[var(--ink-soft)]">{t("review.quiz.wrong.weakList")}</p>
                <ul className="mb-3 space-y-0.5 text-[11.5px] text-[var(--ink-faint)]">
                  {weakPoints.slice(0, 4).map((w) => (
                    <li key={`${w.subjectId}/${w.chapterId}`}>
                      · {subjectLabel(w.subjectId)} {w.chapterLabel}（{w.lastPercent} 分）
                    </li>
                  ))}
                </ul>
              </>
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
              "rounded-xl border p-4",
              mode === "chapter" ? "border-[var(--accent)] bg-[var(--accent-weak)]/30" : "border-[var(--line)] bg-[var(--bg-panel)]",
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
              disabled={busy || !subjectId || !chapterId}
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
            <EmbeddedRunner quiz={quiz} onRecorded={() => setBookVersion((v) => v + 1)} />
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
