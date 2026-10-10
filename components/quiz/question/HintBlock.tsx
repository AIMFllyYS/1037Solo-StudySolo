"use client";

import { Lightbulb } from "lucide-react";
import type { QuizQuestion as Q } from "@/lib/quiz/types";

import QuizMarkdown from "../QuizMarkdown";

import { useT } from "@/lib/i18n";
/** 交卷前的「提示」按钮（不泄露答案）。 */
export function HintBlock({ q, onUse, used }: { q: Q; onUse: () => void; used: boolean }) {
  const t = useT();
  if (!q.hint) return null;
  return (
    <div style={{ marginTop: "14px" }}>
      {!used ? (
          <button
            type="button"
            onClick={onUse}
            className="press"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "var(--md-sys-shape-corner-full)",
            border: "1px solid var(--color-warning)",
            background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
            color: "var(--color-warning)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Lightbulb size={15} />
          {t("window.quiz.question.showHint")}
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "11px 14px",
            borderRadius: "var(--md-sys-shape-corner-medium)",
            background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
          }}
        >
          <Lightbulb size={16} style={{ color: "var(--color-warning)", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--md-sys-color-on-surface)" }}>
            <QuizMarkdown inline>{q.hint}</QuizMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}