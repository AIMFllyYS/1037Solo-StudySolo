import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToolResultCards } from "./ToolResultCards";
import { useAppMode } from "@/lib/stores/appMode";
import type { ChatMessage, ChatMessagePart } from "@/lib/types/chat";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/chat/messages/ChatImage", () => ({
  ChatImage: ({ alt }: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
  <img alt={alt} />
  ),
}));

afterEach(() => {
  cleanup();
  useAppMode.setState({ mode: "studio" });
});

function message(parts: ChatMessagePart[]): ChatMessage {
  return { id: "m", role: "assistant", timestamp: 1, parts };
}

describe("ToolResultCards aggregation", () => {
  it("merges repeated searchNotes calls and dedupes by path", () => {
    render(
      <ToolResultCards
        message={message([
          {
            type: "tool-searchNotes",
            toolCallId: "n1",
            state: "output-available",
            input: { query: "贝叶斯" },
            output: {
              text: "…",
              hits: [
                { title: "贝叶斯公式", path: "probability/detail/1.4", snippet: "s1" },
                { title: "全概率公式", path: "probability/detail/1.3", snippet: "s2" },
              ],
            },
          },
          {
            type: "tool-searchNotes",
            toolCallId: "n2",
            state: "output-available",
            input: { query: "条件概率" },
            output: {
              text: "…",
              hits: [
                { title: "贝叶斯重复", path: "probability/detail/1.4", snippet: "s3" },
                { title: "条件概率", path: "probability/detail/1.2", snippet: "s4" },
              ],
            },
          },
        ])}
      />,
    );
    expect(screen.getAllByTestId("note-citation-card")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /引用笔记 · 3 条/ }));
    expect(screen.getByText("贝叶斯公式")).toBeVisible();
    expect(screen.getByText("全概率公式")).toBeVisible();
    expect(screen.getByText("条件概率")).toBeVisible();
    expect(screen.queryByText("贝叶斯重复")).not.toBeInTheDocument();
  });

  it("merges repeated webSearch calls and dedupes by url", () => {
    render(
      <ToolResultCards
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "output-available",
            input: { query: "q1" },
            output: {
              text: "…",
              sources: [{ title: "课程甲", url: "https://example.edu/a", snippet: "" }],
              cacheHit: true,
            },
          },
          {
            type: "tool-webSearch",
            toolCallId: "w2",
            state: "output-available",
            input: { query: "q2" },
            output: {
              text: "…",
              sources: [
                { title: "课程甲重复", url: "https://example.edu/a", snippet: "" },
                { title: "课程乙", url: "https://example.edu/b", snippet: "" },
              ],
            },
          },
        ])}
      />,
    );
    expect(screen.getAllByTestId("web-source-fold")).toHaveLength(1);
    expect(screen.getByText(/联网来源 · 2 条/)).toBeVisible();
    expect(screen.queryByText(/缓存/)).not.toBeInTheDocument();
  });

  it("keeps eight searchNotes hits on one card", () => {
    const hits = Array.from({ length: 8 }, (_, i) => ({
      title: `命中 ${i + 1}`,
      path: `probability/detail/1.${i + 1}`,
      snippet: `s${i + 1}`,
    }));
    render(
      <ToolResultCards
        message={message([
          {
            type: "tool-searchNotes",
            toolCallId: "n",
            state: "output-available",
            input: { query: "q" },
            output: { text: "…", hits },
          },
        ])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /引用笔记 · 8 条/ }));
    expect(screen.getByText("命中 8")).toBeVisible();
  });

  it("流式期间 input-available 的 webSearch 挂出 live 卡（供应商脉冲点 + 骨架）", () => {
    render(
      <ToolResultCards
        isStreaming
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "input-available",
            input: { query: "如何复习", mode: "daily" },
          },
        ] as ChatMessagePart[])}
      />,
    );
    expect(screen.getByTestId("web-source-fold")).toBeInTheDocument();
    expect(screen.getByText(/正在搜索 Kimi · 智谱/)).toBeInTheDocument();
    expect(document.querySelectorAll(".web-source-card.is-skeleton")).toHaveLength(3);
  });

  it("流式期间 ready 调用与 pending 调用合成一张 live 卡", () => {
    render(
      <ToolResultCards
        isStreaming
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "output-available",
            input: { query: "q1" },
            output: {
              text: "…",
              sources: [{ title: "已到来源", url: "https://a.example/1", snippet: "" }],
            },
          },
          {
            type: "tool-webSearch",
            toolCallId: "w2",
            state: "input-available",
            input: { query: "q2" },
          },
        ] as ChatMessagePart[])}
      />,
    );
    // 一张卡：已到的来源可见 + 尾部一张骨架（还在搜索；有真卡时不铺满骨架）。
    expect(screen.getAllByTestId("web-source-fold")).toHaveLength(1);
    expect(screen.getByText("a.example")).toBeInTheDocument();
    expect(document.querySelectorAll(".web-source-card.is-skeleton")).toHaveLength(1);
  });

  it("流结束后 output-error 的调用补一张失败卡", () => {
    render(
      <ToolResultCards
        isStreaming={false}
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "output-available",
            input: { query: "q1" },
            output: {
              text: "…",
              sources: [{ title: "正常来源", url: "https://a.example/1", snippet: "" }],
            },
          },
          {
            type: "tool-webSearch",
            toolCallId: "w2",
            state: "output-error",
            input: { query: "q2" },
            errorText: "network down",
          },
        ] as ChatMessagePart[])}
      />,
    );
    const folds = screen.getAllByTestId("web-source-fold");
    expect(folds).toHaveLength(2);
    expect(screen.getByText("搜索失败")).toBeInTheDocument();
    expect(screen.getByText("network down")).toBeInTheDocument();
  });

  it("流结束后 input-available 的残件不再渲染（不会推进了）", () => {
    render(
      <ToolResultCards
        isStreaming={false}
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "input-available",
            input: { query: "q" },
          },
        ] as ChatMessagePart[])}
      />,
    );
    expect(screen.queryByTestId("web-source-fold")).not.toBeInTheDocument();
  });

  it("hides source folds on the Agent surface", () => {
    useAppMode.setState({ mode: "agent" });
    render(
      <ToolResultCards
        message={message([
          {
            type: "tool-webSearch",
            toolCallId: "w1",
            state: "output-available",
            input: { query: "q1" },
            output: {
              text: "…",
              sources: [{ title: "课程甲", url: "https://example.edu/a", snippet: "" }],
              cacheHit: true,
            },
          },
        ])}
      />,
    );
    expect(screen.queryByTestId("web-source-fold")).not.toBeInTheDocument();
    useAppMode.setState({ mode: "studio" });
  });
});
