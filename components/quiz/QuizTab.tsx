"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, History } from "lucide-react";
import { useStore } from "@/lib/store";
import { useQuizStore } from "@/lib/quiz-store";
import type { UserAnswer } from "@/lib/quiz/types";
import { getChapterProgress, getSession, objectiveAccuracyOf, objectiveAttemptsOf, objectiveBestOf, type ChapterProgress, type QuizSession } from "@/lib/quiz-progress";
import QuizQuestion from "./QuizQuestion";
import QuizScoring from "./QuizScoring";
import QuizSummary from "./QuizSummary";
import { useT } from "@/lib/i18n";

/** 客户端读取本地历史成绩（mounted 后再读，避免 hydration 抖动）。 */
function useChapterProgress(subjectId: string, chapterId: string, categoryId: string, deps: unknown[] = []) {
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(getChapterProgress(subjectId, chapterId, categoryId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, chapterId, categoryId, ...deps]);
  return progress;
}

/** 历史成绩横幅（上次 / 最佳 + 答题恢复提示）。 */
function HistoryBanner({ subjectId, chapterId, categoryId }: { subjectId: string; chapterId: string; categoryId: string }) {
  const t = useT();
  const progress = useChapterProgress(subjectId, chapterId, categoryId);
  const [session, setSession] = useState<QuizSession | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(getSession(subjectId, chapterId, categoryId));
  }, [subjectId, chapterId, categoryId]);

  if (!progress && !session) return null;

  const objectiveBest = progress ? objectiveBestOf(progress) : null;
  const objectiveAccuracy = progress ? objectiveAccuracyOf(progress) : null;
  const objectiveAttempts = progress ? objectiveAttemptsOf(progress) : 0;

  const sessionLabel = session
    ? session.phase === "answering"
      ? t("window.quiz.tab.resumeAnswering", { index: session.currentIndex + 1 })
      : session.phase === "scoring"
        ? t("window.quiz.tab.resumeScoring")
        : t("window.quiz.tab.viewLastScore")
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "16px",
        padding: "8px 13px",
        borderRadius: "var(--md-sys-shape-corner-medium)",
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
        fontSize: "12.5px",
        color: "var(--md-sys-color-on-surface-variant)",
      }}
    >
      <History size={14} style={{ color: "var(--md-sys-color-primary)" }} />
      {sessionLabel ? (
        <span style={{ color: "var(--md-sys-color-primary)", fontWeight: 600 }}>
          {sessionLabel}
        </span>
      ) : null}
      {progress && (
        <span>
          {sessionLabel && <span style={{ margin: "0 8px", opacity: 0.5 }}>·</span>}
          {objectiveBest !== null ? <>{t("window.quiz.tab.bestPrefix")}<strong style={{ color: "var(--md-sys-color-primary)" }}>{objectiveBest}{t("window.quiz.tab.bestSuffix")}</strong><span style={{ margin: "0 8px", opacity: 0.5 }}>·</span></> : null}
          {objectiveAccuracy == null
            ? t("window.quiz.tab.lastUnscored")
            : t("window.quiz.tab.lastAttempt", { percent: objectiveAccuracy, count: objectiveAttempts })}
        </span>
      )}
    </div>
  );
}

function isAnswered(a: UserAnswer | undefined): boolean {
  if (a === undefined || a === null) return false;
  if (Array.isArray(a)) return a.length > 0;
  if (typeof a === "string") return a.trim().length > 0;
  return true;
}

/** 居中提示（空态 / 错误 / 加载）。 */
function CenterState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--md-sys-color-primary-container)",
          display: "grid",
          placeItems: "center",
          marginBottom: "1rem",
        }}
      >
        {icon}
      </div>
      <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--md-sys-color-on-surface)", margin: "0 0 0.5rem" }}>
        {title}
      </p>
      <p style={{ fontSize: "13px", maxWidth: "300px", color: "var(--md-sys-color-on-surface-variant)", margin: 0, lineHeight: 1.6 }}>
        {desc}
      </p>
    </div>
  );
}

function AnsweringView() {
  const t = useT();
  const data = useQuizStore((s) => s.data)!;
  const subjectId = useQuizStore((s) => s.subjectId);
  const chapterId = useQuizStore((s) => s.chapterId);
  const categoryId = useQuizStore((s) => s.categoryId);
  const currentIndex = useQuizStore((s) => s.currentIndex);
  const answers = useQuizStore((s) => s.answers);
  const setAnswer = useQuizStore((s) => s.setAnswer);
  const goTo = useQuizStore((s) => s.goTo);
  const next = useQuizStore((s) => s.next);
  const prev = useQuizStore((s) => s.prev);
  const submit = useQuizStore((s) => s.submit);

  const questions = data.questions;
  const q = questions[currentIndex];
  const answeredCount = questions.filter((qq) => isAnswered(answers[qq.id])).length;
  const isLast = currentIndex === questions.length - 1;
  const progressPct = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-8">
      {/* 头部：标题 + 进度 */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--md-sys-color-primary)" }}>
            {t("window.quiz.tab.title", { chapter: data.chapterId.toUpperCase() })}
          </div>
          <div style={{ fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)" }}>
            {t("window.quiz.tab.answered", { answered: answeredCount, total: questions.length })}
            {data.examConfig?.timeLimit ? t("window.quiz.tab.timeLimit", { minutes: data.examConfig.timeLimit }) : ""}
          </div>
        </div>
        <div
          style={{
            marginTop: "8px",
            height: "6px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            background: "var(--md-sys-color-surface-container-highest)",
            overflow: "hidden",
          }}
        >
          <motion.div
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
            style={{
              height: "100%",
              borderRadius: "var(--md-sys-shape-corner-full)",
              background: "var(--md-sys-color-primary)",
            }}
          />
        </div>
      </div>

      {/* 历史成绩 */}
      <HistoryBanner subjectId={subjectId} chapterId={chapterId} categoryId={categoryId} />

      {/* 题号导航 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
        {questions.map((qq, i) => {
          const active = i === currentIndex;
          const done = isAnswered(answers[qq.id]);
          return (
            <button
              key={qq.id}
              type="button"
              onClick={() => goTo(i)}
              title={t("window.quiz.tab.gotoQuestion", { index: i + 1 })}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "var(--md-sys-shape-corner-small)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                border: active
                  ? "1.5px solid var(--md-sys-color-primary)"
                  : "1px solid var(--md-sys-color-outline-variant)",
                background: active
                  ? "var(--md-sys-color-primary)"
                  : done
                    ? "var(--md-sys-color-primary-container)"
                    : "var(--md-sys-color-surface-container-lowest)",
                color: active
                  ? "var(--md-sys-color-on-primary)"
                  : done
                    ? "var(--md-sys-color-on-primary-container)"
                    : "var(--md-sys-color-on-surface-variant)",
                transition: "all 150ms",
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* 当前题 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22 }}
          style={{
            padding: "22px 24px",
            borderRadius: "var(--md-sys-shape-corner-large)",
            background: "var(--md-sys-color-surface-container-low)",
            border: "1px solid var(--md-sys-color-outline-variant)",
          }}
        >
          <QuizQuestion
            question={q}
            index={currentIndex}
            total={questions.length}
            mode="answer"
            answer={answers[q.id] ?? null}
            onChange={(a) => setAnswer(q.id, a)}
          />
        </motion.div>
      </AnimatePresence>

      {/* 底部导航 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "20px" }}>
        <button
          type="button"
          onClick={prev}
          disabled={currentIndex === 0}
          className="press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "10px 18px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            background: "var(--md-sys-color-surface-container-high)",
            color: "var(--md-sys-color-on-surface)",
            fontSize: "14px",
            fontWeight: 600,
            border: "1px solid var(--md-sys-color-outline-variant)",
            cursor: currentIndex === 0 ? "not-allowed" : "pointer",
            opacity: currentIndex === 0 ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={16} />
          {t("window.quiz.tab.prev")}
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={submit}
            className="press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 24px",
              borderRadius: "var(--md-sys-shape-corner-full)",
              background: "var(--md-sys-color-primary)",
              color: "var(--md-sys-color-on-primary)",
              fontSize: "14px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: "var(--md-sys-elevation-level1)",
            }}
          >
            <CheckCircle2 size={16} />
            {t("window.quiz.tab.submit")}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "10px 18px",
              borderRadius: "var(--md-sys-shape-corner-full)",
              background: "var(--md-sys-color-primary)",
              color: "var(--md-sys-color-on-primary)",
              fontSize: "14px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("window.quiz.tab.next")}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function QuizTab() {
  const t = useT();
  const subjectId = useStore((s) => s.activeSubjectId);
  const chapterId = useStore((s) => s.activeChapterId);
  const categoryId = useStore((s) => s.activeCategoryId);
  const status = useQuizStore((s) => s.status);
  const phase = useQuizStore((s) => s.phase);
  const persistenceError = useQuizStore((s) => s.persistenceError);
  const load = useQuizStore((s) => s.load);

  // 路由切换到新章节时加载对应题目（store 内部做去重与竞态保护）。
  useEffect(() => {
    load(subjectId, chapterId, categoryId);
  }, [subjectId, chapterId, categoryId, load]);

  if (status === "loading" || status === "idle") {
    return (
      <CenterState
        icon={
          <ClipboardCheck size={28} className="animate-pulse" style={{ color: "var(--md-sys-color-primary)" }} />
        }
        title={t("window.quiz.tab.loadingTitle")}
        desc={t("window.quiz.tab.loadingDesc")}
      />
    );
  }

  if (status === "error") {
    return (
      <CenterState
        icon={<AlertCircle size={28} style={{ color: "var(--md-sys-color-error)" }} />}
        title={t("window.quiz.tab.errorTitle")}
        desc={t("window.quiz.tab.errorDesc")}
      />
    );
  }

  if (status === "empty") {
    return (
      <CenterState
        icon={<ClipboardCheck size={28} style={{ color: "var(--md-sys-color-primary)" }} />}
        title={t("window.quiz.tab.emptyTitle")}
        desc={
          chapterId
            ? t("window.quiz.tab.emptyDescChapter")
            : t("window.quiz.tab.emptyDescNoChapter")
        }
      />
    );
  }

  // status === "ready"
  return (
    <div className="scroll-y h-full">
      {persistenceError && (
        <div className="mx-auto mt-3 max-w-3xl rounded-lg border border-[var(--md-sys-color-error)]/40 bg-[var(--md-sys-color-error-container)]/30 px-3 py-2 text-[12.5px] text-[var(--md-sys-color-error)]" role="alert">
          {t(persistenceError === "owner-changed" ? "window.quiz.tab.ownerChanged" : "window.quiz.tab.localSaveFailed")}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {phase === "answering" && <AnsweringView />}
          {phase === "scoring" && <QuizScoring />}
          {phase === "summary" && <QuizSummary />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
