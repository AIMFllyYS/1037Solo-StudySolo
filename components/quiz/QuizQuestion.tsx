"use client";

import { Check, X } from "lucide-react";

import { isComposite } from "@/lib/quiz/types";

import { useQuizStore } from "@/lib/quiz-store";

import QuizMarkdown from "./QuizMarkdown";

import { useT } from "@/lib/i18n";
import type { QuizQuestionProps } from "./question/types";
import { SUCCESS, ERROR } from "./question/palette";
import { MetaBar } from "./question/metadata";
import { HintBlock } from "./question/HintBlock";
import { ReviewExplain } from "./question/ReviewExplain";
import { useSimpleAnswerFields } from "./question/useSimpleAnswerFields";
import { useCompositeAnswerFields } from "./question/useCompositeAnswerFields";

export default function QuizQuestion({
  question: q,
  index,
  total,
  mode,
  answer,
  onChange,
  result,
  hintsUsed: hintsUsedProp,
  onUseHint: onUseHintProp,
}: QuizQuestionProps) {
  const t = useT();
  const reviewing = mode === "review";
  const { renderChoices, renderTrueFalse, renderFillBlank, renderTextArea } = useSimpleAnswerFields({ question: q, mode, answer, onChange });
  const { renderReading, renderCloze, renderTranslation } = useCompositeAnswerFields({ question: q, mode, answer, onChange });

  const storeHintsUsed = useQuizStore((s) => s.hintsUsed);
  const storeUseHint = useQuizStore((s) => s.useHint);
  const used = (hintsUsedProp ?? storeHintsUsed).includes(q.id);
  const handleUseHint = () => {
    (onUseHintProp ?? storeUseHint)(q.id);
  };

  return (
    <div>
      <MetaBar q={q} index={index} total={total} />

      <div
        style={{
          fontSize: "16px",
          lineHeight: 1.75,
          color: "var(--md-sys-color-on-surface)",
          marginBottom: "16px",
          fontWeight: 500,
        }}
      >
        <QuizMarkdown>{q.stem}</QuizMarkdown>
      </div>

      {/* 作答区 */}
      {q.type === "single_choice" && renderChoices(false)}
      {q.type === "multiple_choice" && renderChoices(true)}
      {q.type === "true_false" && renderTrueFalse()}
      {q.type === "fill_blank" && renderFillBlank()}
      {q.type === "analysis" && renderTextArea(t("window.quiz.question.analysisPlaceholder"))}
      {q.type === "essay" && renderTextArea(t("window.quiz.question.essayPlaceholder"))}
      {q.type === "reading" && renderReading()}
      {q.type === "cloze" && renderCloze()}
      {q.type === "translation" && renderTranslation()}

      {/* 客观题判分徽标（review）；复合题型由子结构分别展示，此处不重复 */}
      {reviewing && result && result.objective && !isComposite(q.type) && (
        <div
          style={{
            marginTop: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 700,
            color: result.correct ? SUCCESS : ERROR,
          }}
        >
          {result.correct ? <Check size={15} /> : <X size={15} />}
          {t("window.quiz.question.resultLine", { verdict: result.correct ? t("window.quiz.question.correct") : t("window.quiz.question.wrong"), awarded: result.awarded, max: result.max })}
        </div>
      )}

      {/* 交卷前提示 / 交卷后深度解析 */}
      {!reviewing && <HintBlock q={q} onUse={handleUseHint} used={used} />}
      {reviewing && <ReviewExplain q={q} />}
    </div>
  );
}
