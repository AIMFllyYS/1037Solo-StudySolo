import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ChatEmptyState from "./ChatEmptyState";

describe("ChatEmptyState initial guidance", () => {
  it("retains the course context and uses the same suggestion rows as Agent", () => {
    render(<ChatEmptyState topic="随机变量" subjectName="概率论" onFollowUpClick={() => {}} />);
    expect(screen.getByText("我是你的概率论助教")).toBeInTheDocument();
    expect(screen.getByText("当前学习: 随机变量")).toBeInTheDocument();
    expect(screen.getByTestId("new-chat-suggestions").querySelectorAll(".chat-welcome-example")).toHaveLength(3);
    expect(document.querySelector(".followup-card")).toBeNull();
  });
  it("sends the selected initial prompt through the consumer callback", () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState topic="" subjectName="物理" onFollowUpClick={onSelect} />);
    expect(screen.queryByText(/当前学习/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /请解释当前小节/ }));
    expect(onSelect).toHaveBeenCalledWith("请解释当前小节的核心概念，并配合直观的解释。");
  });
});
