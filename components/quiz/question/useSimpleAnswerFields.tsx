"use client";

import { useT } from "@/lib/i18n";
import { SUCCESS, ERROR, PRIMARY, LETTERS } from "./palette";
import { OptionRow } from "./OptionRow";
import type { AnswerFieldProps } from "./types";
export function useSimpleAnswerFields({ question: q, mode, answer, onChange }: AnswerFieldProps) {
  const t = useT();
  const reviewing = mode === "review";

  const renderChoices = (multiple: boolean) => {
    const correctSet = new Set<number>(
      multiple ? ((q.answer as number[]) ?? []) : [q.answer as number],
    );
    const pickedArr: number[] = multiple
      ? Array.isArray(answer)
        ? (answer as number[])
        : []
      : typeof answer === "number"
        ? [answer as number]
        : [];
    const pickedSet = new Set(pickedArr);

    const toggle = (i: number) => {
      if (reviewing || !onChange) return;
      if (multiple) {
        const next = new Set(pickedSet);
        if (next.has(i)) {
          next.delete(i);
        } else {
          next.add(i);
        }
        onChange([...next].sort((a, b) => a - b));
      } else {
        onChange(i);
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {(q.options ?? []).map((opt, i) => {
          let state: "neutral" | "correct" | "wrong" = "neutral";
          if (reviewing) {
            if (correctSet.has(i)) state = "correct";
            else if (pickedSet.has(i)) state = "wrong";
          }
          return (
            <OptionRow
              key={i}
              letter={LETTERS[i] ?? String(i + 1)}
              text={opt}
              selected={pickedSet.has(i)}
              mode={mode}
              state={state}
              onClick={() => toggle(i)}
            />
          );
        })}
      </div>
    );
  };

  const renderTrueFalse = () => {
    const picked = typeof answer === "number" ? answer : null;
    const correct = q.answer as number;
    const opts = [
      { val: 1, label: t("window.quiz.question.verdictTrue") },
      { val: 0, label: t("window.quiz.question.verdictFalse") },
    ];
    return (
      <div style={{ display: "flex", gap: "10px" }}>
        {opts.map(({ val, label }) => {
          let state: "neutral" | "correct" | "wrong" = "neutral";
          if (reviewing) {
            if (val === correct) state = "correct";
            else if (picked === val) state = "wrong";
          }
          const selected = picked === val;
          let borderColor = "var(--md-sys-color-outline-variant)";
          let bg = "var(--md-sys-color-surface-container-lowest)";
          let color = "var(--md-sys-color-on-surface)";
          if (mode === "answer" && selected) {
            borderColor = PRIMARY;
            bg = "var(--md-sys-color-primary-container)";
            color = "var(--md-sys-color-on-primary-container)";
          } else if (state === "correct") {
            borderColor = SUCCESS;
            bg = "color-mix(in srgb, var(--color-success) 14%, transparent)";
            color = SUCCESS;
          } else if (state === "wrong") {
            borderColor = ERROR;
            bg = "color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)";
            color = ERROR;
          }
          return (
            <button
              key={val}
              type="button"
              disabled={reviewing}
              onClick={() => !reviewing && onChange?.(val)}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "var(--md-sys-shape-corner-medium)",
                border: `1.5px solid ${borderColor}`,
                background: bg,
                color,
                fontSize: "15px",
                fontWeight: 600,
                cursor: reviewing ? "default" : "pointer",
                transition: "border-color 200ms, background 200ms",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderFillBlank = () => (
    <input
      type="text"
      value={typeof answer === "string" ? answer : ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={reviewing}
      placeholder={t("window.quiz.question.answerPlaceholder")}
      style={{
        width: "100%",
        padding: "11px 14px",
        borderRadius: "var(--md-sys-shape-corner-medium)",
        border: "1.5px solid var(--md-sys-color-outline-variant)",
        background: "var(--md-sys-color-surface-container-lowest)",
        color: "var(--md-sys-color-on-surface)",
        fontSize: "15px",
        outline: "none",
      }}
    />
  );

  // analysis（辨析）与 essay（简答/材料分析/论述）统一用多行文本作答
  // analysis（辨析）与 essay（简答/材料分析/论述）统一用多行文本作答
  const renderTextArea = (placeholder: string) => (
    <textarea
      value={typeof answer === "string" ? answer : ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={reviewing}
      rows={reviewing ? 4 : 7}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: "var(--md-sys-shape-corner-medium)",
        border: "1.5px solid var(--md-sys-color-outline-variant)",
        background: "var(--md-sys-color-surface-container-lowest)",
        color: "var(--md-sys-color-on-surface)",
        fontSize: "14px",
        lineHeight: 1.7,
        resize: "vertical",
        outline: "none",
        fontFamily: "inherit",
      }}
    />
  );
  return { renderChoices, renderTrueFalse, renderFillBlank, renderTextArea };
}
