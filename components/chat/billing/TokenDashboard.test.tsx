import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TokenDashboard from "./TokenDashboard";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { useBillingStore } from "@/lib/hooks/useBillingStore";

vi.mock("@/lib/billing/syncUsageLedger", () => ({
  refreshBillingFromLedger: vi.fn(),
}));
vi.mock("@/lib/window/openBillingDashboard", () => ({
  openBillingDashboard: vi.fn(),
}));

afterEach(() => {
  cleanup();
  useChatHistory.setState({
    sessionsMeta: [],
    messagesById: {},
    activeSessionId: null,
  });
  useBillingStore.setState({ records: [] });
});

describe("TokenDashboard context panel", () => {
  it("keeps context details open, hides quota/storage, and shows cache hit billing", async () => {
    useChatHistory.setState({
      activeSessionId: "s1",
      sessionsMeta: [{
        id: "s1",
        title: "测试",
        createdAt: 1,
        updatedAt: 1,
        messageCount: 1,
        artifactIds: [],
      }],
      messagesById: {
        s1: [{
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          timestamp: 1,
        }],
      },
    });
    useBillingStore.setState({
      records: [
        {
          id: "r1",
          timestamp: 1,
          modelId: "mimo-v2.5",
          modelLabel: "MiMo",
          providerCategory: "unknown",
          type: "chat",
          promptTokens: 100,
          completionTokens: 20,
          cachedTokens: 40,
          totalTokens: 120,
          cost: 0.01,
          sessionId: "s1",
        },
        {
          id: "r2",
          timestamp: 2,
          modelId: "mimo-v2.5",
          modelLabel: "MiMo",
          providerCategory: "unknown",
          type: "chat",
          promptTokens: 80,
          completionTokens: 10,
          cachedTokens: 0,
          totalTokens: 90,
          cost: 0.02,
          sessionId: "s1",
        },
      ],
    });

    render(<TokenDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "打开上下文看板" }));
    expect(document.querySelector("details")).toBeNull();
    expect(screen.getByText("上下文使用")).toBeInTheDocument();
    expect(screen.getByText("上下文构成")).toBeInTheDocument();
    expect(screen.getByText("累计计费")).toBeInTheDocument();
    expect(screen.getByText("1 次")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "压缩" })).toBeInTheDocument();
    expect(screen.queryByText("会员与额度")).toBeNull();
    expect(screen.queryByText(/已使用的 AI 额度/)).toBeNull();
    expect(screen.queryByRole("progressbar", { name: "对话占用" })).toBeNull();
    expect(screen.getByText(/缓存命中窗口默认 5 分钟/)).toBeInTheDocument();
  });
});
