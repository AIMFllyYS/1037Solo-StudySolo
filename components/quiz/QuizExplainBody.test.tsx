import React, { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import QuizExplainBody from "./QuizExplainBody";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useQuizExplain, type QuizExplainWin } from "@/lib/stores/learning/quizExplain";
import { useSettings } from "@/lib/stores/settings";
import { useBillingStore } from "@/lib/stores/billing";
import { useTokenTracker } from "@/lib/stores/chat/tokenTracker";
import { useFloatingTokenTracker } from "@/lib/stores/chat/floatingTokenTracker";
import { getMessageText } from "@/lib/chat/messages/messageParts";
import { QUIZ_EXPLAIN_SEED_PROMPT } from "@/lib/quiz/formatQuestionContext";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";

vi.mock("@/lib/storage/idbStorage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/storage/idbStorage")>(),
  idbStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), setItemLazy: vi.fn(), removeItem: vi.fn(async () => {}) },
}));
vi.mock("@/lib/stores/chat/chatHistory", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/stores/chat/chatHistory")>(),
  ensureChatHistoryBootstrap: vi.fn(async () => {}),
}));
vi.mock("@/components/chat/ChatThread", () => ({ default: ({ isLoading, info, onClearInfo }: {
  isLoading: boolean; info: string | null; onClearInfo: () => void;
}) => <div><span data-testid="loading">{String(isLoading)}</span><span data-testid="info">{info}</span><button onClick={onClearInfo}>清除提示</button></div> }));
vi.mock("@/components/chat/composer/ChatInput", () => ({ default: ({ onSend, onStop, disableQuote }: {
  onSend: (text: string) => void; onStop: () => void; disableQuote?: boolean;
}) => <div><span data-testid="quote">{String(disableQuote)}</span><button onClick={() => onSend("追问一句")}>手动发送</button><button onClick={onStop}>停止</button></div> }));

const context = { subjectId: "cell-biology", categoryId: "textbook", itemId: "ch01", currentTopic: "细胞" };
const initialSettings = useSettings.getState();
const seed = (over: Partial<QuizExplainWin> = {}): QuizExplainWin => ({
  id: "quiz-explain:q1",
  sessionId: "quiz-s",
  modelId: DEFAULT_MODEL_ID,
  questionId: "q1",
  seedText: "题型：单选题\n\n题干：\n线粒体的主要功能是？\n\n已有解析：\n提供能量",
  seedNonce: 1,
  ...over,
});
let requests: Array<Record<string, unknown>>;

function Host({ visible = true }: { visible?: boolean }) {
  const win = useQuizExplain((s) => s.windows[0]);
  return visible && win ? <QuizExplainBody win={win} chatContext={context} onModelChange={() => {}} /> : null;
}

function responseControl() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel }), {
    headers: { "Content-Type": "text/event-stream" },
  });
  const emit = (...chunks: UIMessageChunk[]) => chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)));
  const finish = () => {
    emit(
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "窗内解答" },
      { type: "text-end", id: "t" },
      { type: "data-info", data: { message: "备用端点提示" }, transient: true },
      { type: "data-usage", data: { promptTokens: 10, completionTokens: 5, cachedTokens: 2, totalTokens: 15 } },
      { type: "finish" },
    );
    controller.close();
  };
  return { response, cancel, emit, finish };
}

function mockFetch(response?: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat-title") return Response.json({ title: "深度解析标题" });
    requests.push(JSON.parse(String(init?.body)));
    if (response) return response();
    const control = responseControl();
    control.finish();
    return control.response;
  }));
}

const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
const quizMessages = () => useChatHistory.getState().messagesById["quiz-s"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requests = [];
  useChatHistory.setState({
    activeSessionId: "main",
    _hasHydrated: true,
    _activeMessagesReady: true,
    messagesById: { main: [], "quiz-s": [] },
    sessionLoadState: { main: "loaded", "quiz-s": "loaded" },
    sessionsMeta: ["main", "quiz-s"].map((id) => ({ id, title: id, createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] })),
    loadedSessionIds: ["main", "quiz-s"],
    pinnedSessionIds: [],
  });
  useQuizExplain.setState({ windows: [seed()], sessionByQuestionId: { q1: "quiz-s" } });
  useSettings.setState({ ...initialSettings, selectedModelId: "mimo-v2.5", customApiGroups: [] });
  useBillingStore.setState({ records: [] });
  useTokenTracker.getState().resetSession();
  useFloatingTokenTracker.setState({ sessions: {} });
});

afterEach(async () => {
  cleanup();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuizExplainBody automatic seed lifecycle", () => {
  it("StrictMode 首次挂载只发送一次，题目走用户消息且不套原文引用", async () => {
    mockFetch();
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: "quiz-s", modelId: DEFAULT_MODEL_ID });
    expect(quizMessages()).toHaveLength(2);
    expect(getMessageText(quizMessages()[0])).toContain(QUIZ_EXPLAIN_SEED_PROMPT);
    expect(getMessageText(quizMessages()[0])).toContain("线粒体的主要功能是？");
    expect(getMessageText(quizMessages()[0])).toContain("提供能量");
    expect(getMessageText(quizMessages()[0])).not.toContain("针对当前页面这段原文");
    expect(getMessageText(quizMessages()[1])).toBe("窗内解答");
    expect(useQuizExplain.getState().windows[0].seedNonce).toBe(0);
    expect(useChatHistory.getState().messagesById.main).toEqual([]);
    expect(useTokenTracker.getState().sessionTotal.totalTokens).toBe(0);
    expect(useFloatingTokenTracker.getState().getSession("quiz-s").sessionTotal.totalTokens).toBe(15);
    expect(useBillingStore.getState().records[0]).toMatchObject({ sessionId: "quiz-s", modelId: DEFAULT_MODEL_ID });
    expect(screen.getByTestId("quote")).toHaveTextContent("true");
  });

  it("等待 session 水合后再发送，未就绪时不消耗 seedNonce", async () => {
    useChatHistory.setState({ _hasHydrated: false });
    mockFetch();
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(0);
    expect(quizMessages()).toEqual([]);
    expect(useQuizExplain.getState().windows[0].seedNonce).toBe(1);
    act(() => useChatHistory.setState({ _hasHydrated: true }));
    await settle();
    expect(requests).toHaveLength(1);
  });

  it("最小化卸载后恢复不再次发送已经接收的 seed", async () => {
    const control = responseControl();
    mockFetch(() => control.response);
    const view = render(<StrictMode><Host /></StrictMode>);
    await settle();
    control.emit({ type: "reasoning-start", id: "r" }, { type: "reasoning-delta", id: "r", delta: "部分思考" });
    await settle();
    view.rerender(<StrictMode><Host visible={false} /></StrictMode>);
    await settle();
    expect(control.cancel).toHaveBeenCalledTimes(1);
    view.rerender(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
    expect(quizMessages()).toHaveLength(2);
  });

  it("微任务派发前卸载不产生占位，也不消费 seed", async () => {
    mockFetch();
    const first = render(<StrictMode><Host /></StrictMode>);
    first.unmount();
    await settle();
    expect(requests).toHaveLength(0);
    expect(quizMessages()).toEqual([]);
    expect(useQuizExplain.getState().windows[0].seedNonce).toBe(1);
    render(<StrictMode><Host /></StrictMode>);
    await settle();
    expect(requests).toHaveLength(1);
  });
});
