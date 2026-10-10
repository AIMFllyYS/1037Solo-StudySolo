"use client";

import React from "react";

import { BookOpen } from "lucide-react";
import type { QuizQuestion as Q } from "@/lib/quiz/types";

import { openMessageMenu } from "@/lib/stores/workspace/contextMenu";
import QuizMarkdown from "../QuizMarkdown";
import { useQuizExplain } from "@/lib/stores/learning/quizExplain";
import { useT } from "@/lib/i18n";
import { SUCCESS, ERROR } from "./palette";
import { ManimVideo } from "./ManimVideo";
/** review 模式：深度解析 + 参考答案 + 评分要点 + 来源目录 + 视频。 */
export function ReviewExplain({ q }: { q: Q }) {
  const t = useT();
  const isSubjective = q.type === "analysis" || q.type === "fill_blank" || q.type === "essay";
  return (
    <div
      data-testid="quiz-explain-card"
      style={{
        marginTop: "6px",
        padding: "10px 12px",
        borderRadius: "var(--md-sys-shape-corner-medium)",
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: q.explanation || isSubjective || (q.scoring_criteria && q.scoring_criteria.length > 0) ? "6px" : 0,
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
          {t("window.quiz.question.explain")}
        </span>
        <button
          type="button"
          data-testid="quiz-explain-agent-btn"
          onClick={() => useQuizExplain.getState().openWindow(q)}
          style={{
            flexShrink: 0,
            fontSize: "11px",
            fontWeight: 600,
            lineHeight: 1.3,
            padding: "3px 8px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            border: "1px solid var(--md-sys-color-outline-variant)",
            background: "var(--md-sys-color-surface-container-lowest)",
            color: "var(--md-sys-color-primary)",
            cursor: "pointer",
          }}
        >
          {t("window.quiz.question.askAgent")}
        </button>
      </div>

      {/* 辨析题：先给命题判断 */}
      {q.type === "analysis" && (
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", color: q.answer === 1 ? SUCCESS : ERROR }}>
          {t("window.quiz.question.proposition", { verdict: q.answer === 1 ? t("window.quiz.question.verdictTrue") : t("window.quiz.question.verdictFalse") })}
        </div>
      )}

      {/* 参考答案（主观题） */}
      {isSubjective && (
        <>
          <SectionLabel tight>{t("window.quiz.question.referenceAnswer")}</SectionLabel>
          <div style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--md-sys-color-on-surface)" }}>
            <QuizMarkdown>{q.type === "analysis" ? q.reasoning || String(q.answer ?? "") : String(q.answer ?? "")}</QuizMarkdown>
          </div>
        </>
      )}

      {/* 评分要点 */}
      {q.scoring_criteria && q.scoring_criteria.length > 0 && (
        <>
          <SectionLabel tight={!isSubjective}>{t("window.quiz.question.scoringCriteria")}</SectionLabel>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {q.scoring_criteria.map((c, i) => (
              <li key={i} style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--md-sys-color-on-surface)" }}>
                <QuizMarkdown inline>{c}</QuizMarkdown>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 深度解析正文 */}
      {q.explanation && (
        <div
          style={{ fontSize: "13.5px", lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}
          onContextMenu={(e) => openMessageMenu(e, q.explanation!)}
        >
          <QuizMarkdown>{q.explanation}</QuizMarkdown>
        </div>
      )}

      {/* 来源目录 */}
      {q.sourceRef && (q.sourceRef.label || q.sourceRef.path) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
            marginTop: "12px",
            paddingTop: "10px",
            borderTop: "1px dashed var(--md-sys-color-outline-variant)",
            fontSize: "12px",
            color: "var(--md-sys-color-on-surface-variant)",
          }}
        >
          <BookOpen size={14} style={{ flexShrink: 0, marginTop: "2px", color: "var(--md-sys-color-primary)" }} />
          <span>
            {t("window.quiz.question.source", { label: q.sourceRef.label ?? "" })}
            {q.sourceRef.path && (
              <code style={{ marginLeft: "6px", fontSize: "11.5px", color: "var(--md-sys-color-on-surface-variant)", fontFamily: "var(--font-mono)" }}>
                {q.sourceRef.path}
              </code>
            )}
          </span>
        </div>
      )}

      {/* Manim 视频讲解 */}
      {q.manimVideoId && <ManimVideo id={q.manimVideoId} />}
    </div>
  );
}

function SectionLabel({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", margin: tight ? "4px 0 6px" : "12px 0 6px" }}>
      {children}
    </div>
  );
}