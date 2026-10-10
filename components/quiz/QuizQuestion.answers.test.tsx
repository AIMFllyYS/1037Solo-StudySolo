import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QuizQuestion from "./QuizQuestion";
import type { QuizQuestion as Question, UserAnswer } from "@/lib/quiz/types";

const base: Question = {
  id: "answer-contract", type: "single_choice", difficulty: "basic", source: "current_chapter",
  points: 2, stem: "选择或填写答案", answer: 0,
};

function ControlledQuestion({ question, initial = null, mode = "answer" }: {
  question: Question; initial?: UserAnswer; mode?: "answer" | "review";
}) {
  const [answer, setAnswer] = useState<UserAnswer>(initial);
  return <>
    <QuizQuestion question={question} index={0} total={1} mode={mode} answer={answer} onChange={setAnswer} />
    <output data-testid="answer-value">{JSON.stringify(answer)}</output>
  </>;
}

afterEach(cleanup);
const currentAnswer = () => JSON.parse(screen.getByTestId("answer-value").textContent ?? "null");

describe("QuizQuestion answer formats", () => {
  it("keeps single-choice indices and sorted multiple-choice selections", () => {
    const { rerender } = render(<ControlledQuestion question={{ ...base, type: "multiple_choice", options: ["甲选项", "乙选项", "丙选项"], answer: [0, 2] }} />);
    fireEvent.click(screen.getByRole("button", { name: /丙选项/ }));
    fireEvent.click(screen.getByRole("button", { name: /甲选项/ }));
    expect(currentAnswer()).toEqual([0, 2]);
    fireEvent.click(screen.getByRole("button", { name: /丙选项/ }));
    expect(currentAnswer()).toEqual([0]);
    rerender(<ControlledQuestion key="single" question={{ ...base, options: ["甲选项", "乙选项"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /乙选项/ }));
    expect(currentAnswer()).toBe(1);
  });

  it("uses 1 and 0 for true/false and leaves review controls disabled", () => {
    const question = { ...base, type: "true_false" as const, answer: 1 };
    const { rerender } = render(<ControlledQuestion question={question} />);
    fireEvent.click(screen.getByRole("button", { name: "正确 √" }));
    expect(currentAnswer()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "错误 ×" }));
    expect(currentAnswer()).toBe(0);
    rerender(<ControlledQuestion question={question} mode="review" />);
    expect(screen.getByRole("button", { name: "正确 √" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "错误 ×" })).toBeDisabled();
  });

  it.each(["fill_blank", "analysis", "essay"] as const)("keeps %s text as an exact string", type => {
    render(<ControlledQuestion question={{ ...base, type, answer: "参考文本" }} />);
    const text = type === "fill_blank" ? "中文 + $x^2$" : "中文 + $x^2$\n第二行";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    expect(currentAnswer()).toBe(text);
  });

  it.each(["reading", "cloze"] as const)("updates %s subanswers without losing another subanswer", type => {
    const question: Question = {
      ...base, type, passage: "材料正文", answer: "",
      subQuestions: [{ id: "first", stem: "第一小题", type: "single_choice", options: ["左选项", "右选项"], answer: 1, points: 1 }],
      blanks: [{ id: "first", options: ["左选项", "右选项"], answer: 1 }],
    };
    render(<ControlledQuestion question={question} initial={{ retained: "已有答案" }} />);
    fireEvent.click(screen.getByRole("button", { name: /右选项/ }));
    expect(currentAnswer()).toEqual({ retained: "已有答案", first: 1 });
    expect(screen.getByText("材料正文")).toBeVisible();
  });

  it("keeps translation answers by item id and only reveals references in review", () => {
    const question: Question = { ...base, type: "translation", answer: "", items: [
      { id: "sentence", source: "原文句子", reference: "Reference answer", points: 2 },
    ] };
    const { rerender } = render(<ControlledQuestion question={question} initial={{ retained: "已有答案" }} />);
    expect(screen.queryByText("Reference answer")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My translation" } });
    expect(currentAnswer()).toEqual({ retained: "已有答案", sentence: "My translation" });
    rerender(<ControlledQuestion question={question} mode="review" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText("Reference answer")).toBeVisible();
  });
});
