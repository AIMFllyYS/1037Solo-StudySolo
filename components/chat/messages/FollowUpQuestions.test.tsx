import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useAppMode } from "@/lib/stores/appMode";

// Mock QuizMarkdown to avoid pulling in react-markdown/katex chain
vi.mock("@/components/quiz/QuizMarkdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

import { FollowUpQuestions } from "./FollowUpQuestions";

afterEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useAppMode.setState({ mode: "studio" });
});

describe("FollowUpQuestions", () => {
  it("空问题列表时不渲染", () => {
    const { container } = render(
      <FollowUpQuestions questions={[]} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("undefined 问题列表时不渲染", () => {
    const { container } = render(
      <FollowUpQuestions questions={undefined as unknown as string[]} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("渲染标题和所有问题按钮", () => {
    render(
      <FollowUpQuestions
        questions={["问题1", "问题2", "问题3"]}
        onSelect={() => {}}
        title="测试标题"
      />,
    );
    expect(screen.getByText("测试标题")).toBeInTheDocument();
    expect(screen.getByText("问题1")).toBeInTheDocument();
    expect(screen.getByText("问题2")).toBeInTheDocument();
    expect(screen.getByText("问题3")).toBeInTheDocument();
  });

  it("使用默认标题", () => {
    render(
      <FollowUpQuestions questions={["q"]} onSelect={() => {}} />,
    );
    expect(screen.getByText("你可能还想问")).toBeInTheDocument();
  });

  it("使用稳定版追问卡片：灯泡标题 + 问号按钮", () => {
    const { container } = render(<FollowUpQuestions questions={["继续了解"]} onSelect={() => {}} />);
    expect(container.querySelector(".followup-card")).not.toBeNull();
    expect(container.querySelector(".followup-btn")).not.toBeNull();
    expect(container.querySelector(".lucide-lightbulb, .lucide")).not.toBeNull();
  });

  it("点击按钮调用 onSelect 并传入问题文本", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FollowUpQuestions questions={["什么是概率？"]} onSelect={onSelect} />,
    );
    await user.click(screen.getByRole("button", { name: /什么是概率/ }));
    expect(onSelect).toHaveBeenCalledWith("什么是概率？");
  });

  it("每个追问按钮都是 type=button（非 submit）", () => {
    render(
      <FollowUpQuestions questions={["q1"]} onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "q1" })).toHaveAttribute("type", "button");
  });

  it("hides the source-trace chip on the Agent surface", () => {
    useAppMode.setState({ mode: "agent" });
    render(
      <FollowUpQuestions
        questions={["继续"]}
        onSelect={() => {}}
        sources={[{ kind: "web", title: "课程", url: "https://example.edu", snippet: "" }]}
      />,
    );
    expect(screen.queryByRole("button", { name: /来源 · 1/ })).not.toBeInTheDocument();
    expect(screen.getByText("继续")).toBeInTheDocument();
  });

  it("shows a source-trace action that opens the Mac viewer", () => {
    render(
      <FollowUpQuestions
        questions={["继续"]}
        onSelect={() => {}}
        sources={[{ kind: "web", title: "课程", url: "https://example.edu", snippet: "" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /来源 · 1/ }));
    expect(useWindowManager.getState().windows.some((w) => w.type === "source-trace-viewer")).toBe(true);
  });
});
