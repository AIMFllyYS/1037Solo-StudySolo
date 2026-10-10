"use client";

import React from "react";

import type { UserAnswer } from "@/lib/quiz/types";

import QuizMarkdown from "../QuizMarkdown";

import { useT } from "@/lib/i18n";
import { SUCCESS, ERROR, PRIMARY, LETTERS } from "./palette";
import { OptionRow } from "./OptionRow";
import type { AnswerFieldProps } from "./types";
export function useCompositeAnswerFields({ question: q, mode, answer, onChange }: AnswerFieldProps) {
  const t = useT();
  const reviewing = mode === "review";

  const compositeRecord = (
    typeof answer === "object" && answer !== null && !Array.isArray(answer)
      ? (answer as Record<string, unknown>)
      : {}
  );

  const getComposite = (subId: string): UserAnswer => {
    const v = compositeRecord[subId];
    if (v === undefined) return null;
    if (typeof v === "number" || typeof v === "string" || Array.isArray(v)) return v as UserAnswer;
    return null;
  };

  const setCompositeAnswer = (subId: string, subAnswer: UserAnswer) => {
    onChange?.({ ...compositeRecord, [subId]: subAnswer });
  };

  /** 单选/判断选项渲染（支持传入自定义数据，用于复合题型）。 */
  function SimpleChoice({
    subId,
    type,
    options,
    correctAnswer,
    label,
  }: {
    subId: string;
    type: "single_choice" | "multiple_choice" | "true_false";
    options?: string[];
    correctAnswer: number | number[];
    label?: React.ReactNode;
  }) {
    const subAnswer = getComposite(subId);
    const isMultiple = type === "multiple_choice";
    const isTrueFalse = type === "true_false";

    if (isTrueFalse) {
      const picked = typeof subAnswer === "number" ? subAnswer : null;
      const correct = correctAnswer as number;
      const opts = [
        { val: 1, label: t("window.quiz.question.verdictTrue") },
        { val: 0, label: t("window.quiz.question.verdictFalse") },
      ];
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {label}
          <div style={{ display: "flex", gap: "10px" }}>
            {opts.map(({ val, label: text }) => {
              let state: "neutral" | "correct" | "wrong" = "neutral";
              if (reviewing) {
                if (val === correct) state = "correct";
                else if (picked === val) state = "wrong";
              }
              const selected = picked === val;
              let borderColor = "var(--md-sys-color-outline-variant)";
              let bg = "var(--md-sys-color-surface-container-lowest)";
              let color = "var(--md-sys-color-on-surface)";
              if (!reviewing && selected) {
                borderColor = PRIMARY;
                bg = "var(--md-sys-color-primary-container)";
                color = "var(--md-sys-color-on-primary-container)";
              } else if (state === "correct") {
                borderColor = SUCCESS;
                bg = "color-mix(in srgb, var(--color-success) 14%, transparent)";
                color = SUCCESS;
              } else if (state === "wrong") {
                borderColor = ERROR;
                bg = "color-mix(in srgb, var(--color-error) 14%, transparent)";
                color = ERROR;
              }
              return (
                <button
                  key={val}
                  type="button"
                  disabled={reviewing}
                  onClick={() => !reviewing && setCompositeAnswer(subId, val)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "var(--md-sys-shape-corner-medium)",
                    border: `1.5px solid ${borderColor}`,
                    background: bg,
                    color,
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: reviewing ? "default" : "pointer",
                  }}
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    const correctSet = new Set<number>(isMultiple ? (correctAnswer as number[]) : [correctAnswer as number]);
    const pickedArr: number[] = isMultiple
      ? Array.isArray(subAnswer)
        ? (subAnswer as number[])
        : []
      : typeof subAnswer === "number"
        ? [subAnswer as number]
        : [];
    const pickedSet = new Set(pickedArr);

    const toggle = (i: number) => {
      if (reviewing) return;
      if (isMultiple) {
        const next = new Set(pickedSet);
        if (next.has(i)) {
          next.delete(i);
        } else {
          next.add(i);
        }
        setCompositeAnswer(subId, [...next].sort((a, b) => a - b));
      } else {
        setCompositeAnswer(subId, i);
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {label}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(options ?? []).map((opt, i) => {
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
      </div>
    );
  }

  /** 阅读理解渲染。 */
  const renderReading = () => {
    const subs = q.subQuestions ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {q.passage && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--md-sys-shape-corner-medium)",
              background: "var(--md-sys-color-surface-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              fontSize: "14px",
              lineHeight: 1.75,
            }}
          >
            <QuizMarkdown>{q.passage}</QuizMarkdown>
          </div>
        )}
        {subs.map((sq, idx) => (
          <div key={sq.id}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--md-sys-color-on-surface)",
                marginBottom: "8px",
              }}
            >
              {idx + 1}. <QuizMarkdown inline>{sq.stem}</QuizMarkdown>
            </div>
            <SimpleChoice
              subId={sq.id}
              type={sq.type}
              options={sq.options}
              correctAnswer={sq.answer}
            />
            {reviewing && sq.explanation && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 12px",
                  borderRadius: "var(--md-sys-shape-corner-medium)",
                  background: "var(--md-sys-color-surface-container-high)",
                  fontSize: "13px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  lineHeight: 1.65,
                }}
              >
                <QuizMarkdown>{sq.explanation}</QuizMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  /** 完形填空渲染。 */
  const renderCloze = () => {
    const blanks = q.blanks ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {q.passage && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--md-sys-shape-corner-medium)",
              background: "var(--md-sys-color-surface-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              fontSize: "14px",
              lineHeight: 1.75,
            }}
          >
            <QuizMarkdown>{q.passage}</QuizMarkdown>
          </div>
        )}
        {blanks.map((b, idx) => (
          <SimpleChoice
            key={b.id}
            subId={b.id}
            type="single_choice"
            options={b.options}
            correctAnswer={b.answer}
            label={
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--md-sys-color-on-surface)" }}>
                ({idx + 1})
              </span>
            }
          />
        ))}
      </div>
    );
  };

  /** 翻译题渲染。 */
  const renderTranslation = () => {
    const items = q.items ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {items.map((item, idx) => (
          <div key={item.id}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--md-sys-color-on-surface)",
                marginBottom: "8px",
              }}
            >
              {idx + 1}. <QuizMarkdown inline>{item.source}</QuizMarkdown>
              <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)", fontWeight: 500 }}>
                {t("window.quiz.question.subPoints", { points: item.points })}
              </span>
            </div>
            <textarea
              value={typeof getComposite(item.id) === "string" ? (getComposite(item.id) as string) : ""}
              onChange={(e) => setCompositeAnswer(item.id, e.target.value)}
              disabled={reviewing}
              rows={reviewing ? 3 : 5}
              placeholder={t("window.quiz.question.translationPlaceholder")}
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
            {reviewing && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 12px",
                  borderRadius: "var(--md-sys-shape-corner-medium)",
                  background: "var(--md-sys-color-surface-container-high)",
                  fontSize: "13px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  lineHeight: 1.65,
                }}
              >
                <strong style={{ color: "var(--md-sys-color-on-surface)" }}>{t("window.quiz.question.referenceTranslation")}</strong>
                <QuizMarkdown inline>{item.reference}</QuizMarkdown>
                {item.explanation && (
                  <>
                    <br />
                    <strong style={{ color: "var(--md-sys-color-on-surface)" }}>{t("window.quiz.question.keyPoints")}</strong>
                    <QuizMarkdown inline>{item.explanation}</QuizMarkdown>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  return { renderReading, renderCloze, renderTranslation };
}
