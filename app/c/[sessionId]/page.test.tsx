import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** 钩子替身：只关心「三种状态各自渲染成什么」，打开对话的逻辑由 useOpenSessionById.test.tsx 覆盖。 */
let status: "loading" | "ready" | "notFound" = "loading";

vi.mock("@/lib/hooks/chat/useOpenSessionById", () => ({
  useOpenSessionById: () => ({ status }),
}));

// 真件会把 ChatPanel 那一整棵（上百个模块）拖进来，这里只要证明「ready 时挂的是它」。
vi.mock("@/components/agent/AgentChatCenter", () => ({
  default: () => <div data-testid="agent-chat-center" />,
}));

import ChatDeepLinkPage from "./page";

/** Next 16 的 params 是 Promise：客户端页面用 use() 解，所以这里也必须给 Promise（不能给普通对象）。 */
async function renderPage(sessionId: string) {
  await act(async () => {
    render(
      <Suspense fallback={<div data-testid="suspense-fallback" />}>
        <ChatDeepLinkPage params={Promise.resolve({ sessionId })} />
      </Suspense>,
    );
  });
}

afterEach(() => {
  cleanup();
  status = "loading";
});

describe("/c/<sessionId> 深链页面", () => {
  it("加载中：显示 share.route.loading，不挂对话", async () => {
    status = "loading";
    await renderPage("s1");
    expect(screen.getByTestId("chat-deep-link-loading")).toHaveTextContent("正在打开这条对话…");
    expect(screen.queryByTestId("agent-chat-center")).toBeNull();
  });

  it("找不到：显示 share.route.notFound 与回 /agent 的链接", async () => {
    status = "notFound";
    await renderPage("missing");
    const section = screen.getByTestId("chat-deep-link-not-found");
    expect(section).toHaveTextContent("找不到这条对话。");
    const back = screen.getByRole("link", { name: "回到 Agent" });
    expect(back).toHaveAttribute("href", "/agent");
    expect(screen.queryByTestId("agent-chat-center")).toBeNull();
  });

  it("成功：渲染与 /agent 同一个 AgentChatCenter", async () => {
    status = "ready";
    await renderPage("s2");
    expect(screen.getByTestId("agent-chat-center")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-deep-link-loading")).toBeNull();
  });
});
