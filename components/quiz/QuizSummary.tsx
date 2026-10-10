"use client";

import React from "react";
import { motion } from "framer-motion";
import { RotateCcw, ArrowLeft, Trophy, Check } from "lucide-react";
import { useQuizStore, computeBreakdown } from "@/lib/quiz-store";
import { getChapterProgress, objectiveBestOf } from "@/lib/quiz-progress";
import { useIsClient } from "@/lib/hooks/runtime/useIsClient";
import { useT, type Translate } from "@/lib/i18n";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "window.quiz.type.singleChoice",
  multiple_choice: "window.quiz.type.multipleChoice",
  true_false: "window.quiz.type.trueFalse",
  analysis: "window.quiz.type.analysis",
  fill_blank: "window.quiz.type.fillBlank",
  essay: "window.quiz.summary.typeEssay",
};
const SOURCE_LABELS: Record<string, string> = {
  current_chapter: "window.quiz.summary.sourceCurrent",
  review: "window.quiz.summary.sourceReview",
};
const DIFFICULTY_LABELS: Record<string, string> = {
  basic: "window.quiz.difficulty.basic",
  medium: "window.quiz.difficulty.medium",
  hard: "window.quiz.difficulty.hard",
};

function gradeOf(percent: number, t: Translate): { label: string; color: string } {
  if (percent >= 90) return { label: t("window.quiz.summary.gradeExcellent"), color: "var(--color-success)" };
  if (percent >= 80) return { label: t("window.quiz.summary.gradeGood"), color: "var(--color-info)" };
  if (percent >= 60) return { label: t("window.quiz.summary.gradePass"), color: "var(--color-warning)" };
  return { label: t("window.quiz.summary.gradeWeak"), color: "var(--md-sys-color-error)" };
}

/** 一组分类统计的进度条列表。 */
function StatGroup({
  title,
  labels,
  data,
}: {
  title: string;
  labels: Record<string, string>;
  data: Record<string, { earned: number; max: number; count: number }>;
}) {
  const t = useT();
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", marginBottom: "10px" }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {entries.map(([key, v]) => {
          const pct = v.max > 0 ? Math.round((v.earned / v.max) * 100) : 0;
          return (
            <div key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <span style={{ fontSize: "13px", color: "var(--md-sys-color-on-surface)" }}>
                  {labels[key] ? t(labels[key]) : key}
                  <span style={{ color: "var(--md-sys-color-on-surface-variant)", marginLeft: "6px" }}>
                    {t("window.quiz.summary.groupCount", { count: v.count })}
                  </span>
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t("window.quiz.summary.groupScore", { earned: v.earned, max: v.max, percent: pct })}
                </span>
              </div>
              <div
                style={{
                  height: "7px",
                  borderRadius: "var(--md-sys-shape-corner-full)",
                  background: "var(--md-sys-color-surface-container-highest)",
                  overflow: "hidden",
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.05, 0.7, 0.1, 1] }}
                  style={{
                    height: "100%",
                    borderRadius: "var(--md-sys-shape-corner-full)",
                    background:
                      pct >= 60 ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuizSummary() {
  const t = useT();
  const results = useQuizStore((s) => s.results);
  const restart = useQuizStore((s) => s.restart);
  const backToScoring = useQuizStore((s) => s.backToScoring);
  const subjectId = useQuizStore((s) => s.subjectId);
  const chapterId = useQuizStore((s) => s.chapterId);
  const categoryId = useQuizStore((s) => s.categoryId);
  const reviewAttempt = useQuizStore((s) => s.reviewAttempt);
  const breakdown = computeBreakdown(results);
  const grade = gradeOf(breakdown.percent, t);

  // finishScoring 已把成绩写入 localStorage；mounted 后读回展示「已保存 + 历史最佳」。
  const mounted = useIsClient();
  const progress = mounted ? getChapterProgress(subjectId, chapterId, categoryId) : null;
  const best = progress ? objectiveBestOf(progress) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
          fontSize: "12.5px",
          color: "var(--color-success)",
          fontWeight: 600,
        }}
      >
        <Check size={15} />
        {t("window.quiz.summary.savedLocally")}
        {reviewAttempt && (
          <span style={{ color: "var(--md-sys-color-on-surface-variant)", fontWeight: 500 }}>
            {t(`window.quiz.summary.sync.${reviewAttempt.syncState}`)}
          </span>
        )}
        {best !== null && (
          <span style={{ color: "var(--md-sys-color-on-surface-variant)", fontWeight: 500 }}>
            {t("window.quiz.summary.bestPrefix")}{best}{t("window.quiz.summary.bestSuffix")}
          </span>
        )}
      </div>
      {/* 总分卡片 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.05, 0.7, 0.1, 1] }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
          padding: "28px",
          borderRadius: "var(--md-sys-shape-corner-extra-large)",
          background: "var(--md-sys-color-surface-container-low)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          marginBottom: "28px",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            flexShrink: 0,
            background: `conic-gradient(${grade.color} ${breakdown.percent * 3.6}deg, var(--md-sys-color-surface-container-highest) 0deg)`,
          }}
        >
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: "94px",
              height: "94px",
              borderRadius: "50%",
              background: "var(--md-sys-color-surface-container-low)",
            }}
          >
            <span style={{ fontSize: "30px", fontWeight: 800, color: grade.color, lineHeight: 1 }}>
              {breakdown.percent}
            </span>
            <span style={{ fontSize: "11px", color: "var(--md-sys-color-on-surface-variant)", marginTop: "2px" }}>
              {t("window.quiz.summary.percentScale")}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <Trophy size={18} style={{ color: grade.color }} />
            <span style={{ fontSize: "20px", fontWeight: 800, color: grade.color }}>{grade.label}</span>
          </div>
          <div style={{ fontSize: "14px", color: "var(--md-sys-color-on-surface)" }}>
            {t("window.quiz.summary.rawScorePrefix")}<strong>{breakdown.earned}</strong>{t("window.quiz.summary.rawScoreSuffix", { max: breakdown.max })}
          </div>
          <div style={{ fontSize: "13px", color: "var(--md-sys-color-on-surface-variant)", marginTop: "4px" }}>
            {t("window.quiz.summary.questionCount", { count: results.length })}
          </div>
        </div>
      </motion.div>

      {/* 分类统计 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
        <StatGroup title={t("window.quiz.summary.eyebrow")} labels={TYPE_LABELS} data={breakdown.byType} />
        <StatGroup title={t("window.quiz.summary.bySource")} labels={SOURCE_LABELS} data={breakdown.bySource} />
        <StatGroup title={t("window.quiz.summary.byDifficulty")} labels={DIFFICULTY_LABELS} data={breakdown.byDifficulty} />
      </div>

      {/* 操作 */}
      <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
        <button
          type="button"
          onClick={backToScoring}
          className="press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "11px 20px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            background: "var(--md-sys-color-surface-container-high)",
            color: "var(--md-sys-color-on-surface)",
            fontSize: "14px",
            fontWeight: 600,
            border: "1px solid var(--md-sys-color-outline-variant)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={16} />
          {t("window.quiz.summary.backToScoring")}
        </button>
        <button
          type="button"
          onClick={restart}
          className="press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "11px 20px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            background: "var(--md-sys-color-primary)",
            color: "var(--md-sys-color-on-primary)",
            fontSize: "14px",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          <RotateCcw size={16} />
          {t("window.quiz.summary.redoAll")}
        </button>
      </div>
    </div>
  );
}
