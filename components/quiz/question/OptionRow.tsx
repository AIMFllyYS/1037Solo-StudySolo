"use client";

import { Check, X } from "lucide-react";

import QuizMarkdown from "../QuizMarkdown";

import { SUCCESS, ERROR, PRIMARY } from "./palette";
/** 选项按钮（单选/多选共用）。 */
export function OptionRow({
  letter,
  text,
  selected,
  mode,
  state,
  onClick,
}: {
  letter: string;
  text: string;
  selected: boolean;
  mode: "answer" | "review";
  state: "neutral" | "correct" | "wrong";
  onClick?: () => void;
}) {
  let borderColor = "var(--md-sys-color-outline-variant)";
  let bg = "var(--md-sys-color-surface-container-lowest)";
  let markColor = "var(--md-sys-color-on-surface-variant)";

  if (mode === "answer" && selected) {
    borderColor = PRIMARY;
    bg = "var(--md-sys-color-primary-container)";
    markColor = "var(--md-sys-color-on-primary-container)";
  } else if (mode === "review" && state === "correct") {
    borderColor = SUCCESS;
    bg = "color-mix(in srgb, var(--color-success) 14%, transparent)";
    markColor = SUCCESS;
  } else if (mode === "review" && state === "wrong") {
    borderColor = ERROR;
    bg = "color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)";
    markColor = ERROR;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={mode === "review"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        width: "100%",
        textAlign: "left",
        padding: "11px 13px",
        borderRadius: "var(--md-sys-shape-corner-medium)",
        border: `1.5px solid ${borderColor}`,
        background: bg,
        color: "var(--md-sys-color-on-surface)",
        cursor: mode === "answer" ? "pointer" : "default",
        transition: "border-color 200ms, background 200ms",
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          width: "22px",
          height: "22px",
          borderRadius: "var(--md-sys-shape-corner-full)",
          border: `1.5px solid ${markColor}`,
          color: markColor,
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        {mode === "review" && state === "correct" ? (
          <Check size={13} />
        ) : mode === "review" && state === "wrong" ? (
          <X size={13} />
        ) : (
          letter
        )}
      </span>
      <span style={{ flex: 1, fontSize: "14px", lineHeight: 1.6, paddingTop: "1px" }}>
        <QuizMarkdown inline>{text}</QuizMarkdown>
      </span>
    </button>
  );
}