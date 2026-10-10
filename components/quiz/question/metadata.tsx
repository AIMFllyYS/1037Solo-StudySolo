"use client";

import React from "react";

import type { QuizQuestion as Q } from "@/lib/quiz/types";

import { useT } from "@/lib/i18n";
const DIFFICULTY_LABELS: Record<Q["difficulty"], string> = {
  basic: "window.quiz.difficulty.basic",
  medium: "window.quiz.difficulty.medium",
  hard: "window.quiz.difficulty.hard",
};

/** 题型默认显示名（等价于 lib/quiz/types 的 displayLabel，只是走词典）。 */
const TYPE_LABELS: Record<Q["type"], string> = {
  single_choice: "window.quiz.type.singleChoice",
  multiple_choice: "window.quiz.type.multipleChoice",
  true_false: "window.quiz.type.trueFalse",
  analysis: "window.quiz.type.analysis",
  fill_blank: "window.quiz.type.fillBlank",
  essay: "window.quiz.type.essay",
  reading: "window.quiz.type.reading",
  cloze: "window.quiz.type.cloze",
  translation: "window.quiz.type.translation",
};

function Chip({ children, tone }: { children: React.ReactNode; tone?: "review" | "exam" }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--md-sys-shape-corner-full)",
        background:
          tone === "review"
            ? "var(--md-sys-color-tertiary-container)"
            : tone === "exam"
              ? "var(--md-sys-color-error-container)"
              : "var(--md-sys-color-surface-container-high)",
        color:
          tone === "review"
            ? "var(--md-sys-color-on-tertiary-container)"
            : tone === "exam"
              ? "var(--md-sys-color-on-error-container)"
              : "var(--md-sys-color-on-surface-variant)",
      }}
    >
      {children}
    </span>
  );
}

export function MetaBar({ q, index, total }: { q: Q; index: number; total: number }) {
  const t = useT();
  const isExamFocus = q.label === "考试重点";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--md-sys-color-primary)" }}>
        {t("window.quiz.question.indexTotal", { index: index + 1, total })}
      </span>
      <Chip>{isExamFocus ? t(TYPE_LABELS[q.type]) : q.label?.trim() || t(TYPE_LABELS[q.type])}</Chip>
      <Chip>{t(DIFFICULTY_LABELS[q.difficulty])}</Chip>
      {isExamFocus && <Chip tone="exam">{t("window.quiz.question.examFocus")}</Chip>}
      {q.source === "review" && <Chip tone="review">{t("window.quiz.question.reviewPrefix", { chapter: q.sourceChapter ?? t("window.quiz.question.previousChapter") })}</Chip>}
      <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)" }}>
        {t("window.quiz.question.points", { points: q.points })}
      </span>
    </div>
  );
}