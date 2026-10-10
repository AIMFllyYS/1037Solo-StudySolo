import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ShareButton from "./ShareButton";
import { translate } from "@/lib/i18n";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useToast } from "@/lib/stores/toast";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import type { ChatMessage } from "@/lib/types/chat";

/**
 * ShareButton：负责「校验 → 弹确认 → 打成快照 → POST → 把 url 交给弹窗」。
 * 这一组断言盯四件事：不该开弹窗时只提示、**确认之前一个字节都不发**、
 * 确认后请求形状正确且链接交到弹窗手里、失败留在确认态且能重试。
 */

let authStatus: "loading" | "signedOut" | "signedIn" = "signedIn";
vi.mock("@/lib/hooks/auth/useAuthSession", () => ({
  useAuthSession: () => ({ status: authStatus, userId: authStatus === "signedIn" ? "u1" : null }),
}));

vi.mock("@/lib/share/snapshot", () => ({
  buildSharedSnapshot: vi.fn(() => ({
    v: 1,
    title: "对话标题",
    createdAt: 0,
    sourceClientId: "s1",
    meta: {},
    messages: [],
    artifacts: [],
  })),
}));

import { buildSharedSnapshot } from "@/lib/share/snapshot";

const META: SessionMeta = {
  id: "s1",
  title: "对话标题",
  createdAt: 1,
  updatedAt: 1,
  messageCount: 1,
  artifactIds: [],
};

function messages(text: string): ChatMessage[] {
  return [{ id: "m1", role: "user", parts: [{ type: "text", text }], timestamp: 1 }] as unknown as ChatMessage[];
}

const writeText = vi.fn(() => Promise.resolve());
const fetchMock = vi.fn();

function toasts(): string[] {
  return useToast.getState().toasts.map((item) => item.message);
}

beforeEach(() => {
  authStatus = "signedIn";
  // 词典默认语言是 zh，但用户本机可能是 en；显式钉住，断言才只反映组件行为。
  useChatHistory.setState({ activeSessionId: "s1", sessionsMeta: [META], messagesById: { s1: messages("你好") } });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useToast.getState().clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useToast.getState().clear();
  useChatHistory.setState({ activeSessionId: null, sessionsMeta: [], messagesById: {} });
});

it("空对话只提示，不发分享请求", async () => {
  useChatHistory.setState({ sessionsMeta: [{ ...META, messageCount: 0 }], messagesById: { s1: [] } });
  render(<ShareButton />);

  fireEvent.click(screen.getByTestId("share-conversation"));

  await waitFor(() => expect(toasts()).toContain(translate("zh", "share.empty")));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(buildSharedSnapshot).not.toHaveBeenCalled();
});

it("未登录同样不发请求，只提示先登录", async () => {
  authStatus = "signedOut";
  render(<ShareButton />);

  fireEvent.click(screen.getByTestId("share-conversation"));

  await waitFor(() => expect(toasts()).toContain(translate("zh", "share.loginRequired")));
  expect(fetchMock).not.toHaveBeenCalled();
});

it("先弹确认弹窗：确认之前一个字节都不发，确认后才请求并把链接交给弹窗", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: "abc123", url: "https://studysolo.test/s/abc123" }),
  });
  render(<ShareButton />);

  fireEvent.click(screen.getByTestId("share-conversation"));

  // 分享是不可逆的信息外流：弹窗先摊开「会分享什么」，此时还没发任何请求。
  expect(screen.getByTestId("share-dialog-body")).toBeVisible();
  expect(screen.getByText(translate("zh", "share.dialog.warning"))).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(buildSharedSnapshot).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("share-dialog-confirm"));

  expect(await screen.findByTestId("share-link")).toHaveTextContent("https://studysolo.test/s/abc123");
  expect(buildSharedSnapshot).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toBe("/api/share");
});

it("接口失败时留在确认态给出错误，并且可以再试一次", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
  render(<ShareButton />);

  fireEvent.click(screen.getByTestId("share-conversation"));
  fireEvent.click(screen.getByTestId("share-dialog-confirm"));

  expect(await screen.findByRole("alert")).toHaveTextContent(translate("zh", "share.failed"));
  expect(screen.getByTestId("share-dialog-confirm")).toBeEnabled();
  expect(writeText).not.toHaveBeenCalled();
});
