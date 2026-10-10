import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { closeManagedWindow } from "@/lib/keyboard/windowActions";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { QUIZ_EXPLAIN_MODEL_KEY, setQuizExplainModelId } from "@/lib/hooks/learning/useQuizExplainModel";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import type { QuizQuestion } from "@/lib/quiz/types";
import { quizExplainWindowIdOf, useQuizExplain } from "./quizExplain.ts";

const question: QuizQuestion = {
  id: "cell-q1",
  type: "single_choice",
  difficulty: "basic",
  source: "current_chapter",
  points: 2,
  stem: "线粒体的主要功能是？",
  options: ["储存遗传信息", "提供能量"],
  answer: 1,
  explanation: "线粒体是有氧呼吸的主要场所。",
};

function setupLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = ls;
  (globalThis as unknown as { window: { localStorage: Storage; innerWidth: number; innerHeight: number } }).window = {
    localStorage: ls,
    innerWidth: 1440,
    innerHeight: 900,
  };
}

function reset() {
  setupLocalStorage();
  useQuizExplain.setState({ windows: [], sessionByQuestionId: {} });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useChatHistory.setState({
    sessionsMeta: [{ id: "main", title: "主对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
    messagesById: { main: [] },
    activeSessionId: "main",
    sessionLoadState: { main: "loaded" },
    loadedSessionIds: ["main"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });
}

beforeEach(() => {
  reset();
});

test("openWindow 新建 floating session，默认 DeepSeek，不抢主对话", () => {
  const id = useQuizExplain.getState().openWindow(question);
  assert.equal(id, quizExplainWindowIdOf("cell-q1"));
  const win = useQuizExplain.getState().windows[0];
  assert.ok(win);
  assert.equal(win.modelId, DEFAULT_MODEL_ID);
  assert.equal(win.seedNonce, 1);
  assert.match(win.seedText, /线粒体的主要功能是/);
  assert.match(win.seedText, /线粒体是有氧呼吸的主要场所/);
  assert.equal(useChatHistory.getState().activeSessionId, "main");
  const session = useChatHistory.getState().sessionsMeta.find((item) => item.id === win.sessionId);
  assert.equal(session?.kind, "floating");
  const managed = useWindowManager.getState().windows.find((item) => item.id === id);
  assert.equal(managed?.type, "quiz-explain");
  assert.ok((managed?.size.width ?? 0) >= 480);
  assert.ok((managed?.size.height ?? 0) >= 420);
});

test("openWindow 读取 quizExplainModel，同题再开只置前不新建 session", () => {
  setQuizExplainModelId("mimo-v2.5");
  const first = useQuizExplain.getState().openWindow(question);
  const sessionId = useQuizExplain.getState().windows[0].sessionId;
  assert.equal(useQuizExplain.getState().windows[0].modelId, "mimo-v2.5");
  useWindowManager.getState().minimizeWindow(first);
  const second = useQuizExplain.getState().openWindow(question);
  assert.equal(second, first);
  assert.equal(useQuizExplain.getState().windows.length, 1);
  assert.equal(useQuizExplain.getState().windows[0].sessionId, sessionId);
  assert.equal(useWindowManager.getState().windows.find((item) => item.id === first)?.minimized, false);
  assert.equal(window.localStorage.getItem(QUIZ_EXPLAIN_MODEL_KEY), "mimo-v2.5");
});

test("关掉空窗会删 session；有缓存 session 再开不再 seed", () => {
  const id = useQuizExplain.getState().openWindow(question);
  const sessionId = useQuizExplain.getState().windows[0].sessionId;
  useChatHistory.setState((s) => ({
    messagesById: { ...s.messagesById, [sessionId]: [{ id: "u", role: "user", parts: [{ type: "text", text: "已答" }] } as never] },
    sessionsMeta: s.sessionsMeta.map((item) => item.id === sessionId ? { ...item, messageCount: 1 } : item),
  }));
  useQuizExplain.getState().closeWindow(id);
  assert.equal(useQuizExplain.getState().windows.length, 0);
  assert.equal(useQuizExplain.getState().sessionByQuestionId["cell-q1"], sessionId);
  const reopened = useQuizExplain.getState().openWindow(question);
  assert.equal(useQuizExplain.getState().windows[0].sessionId, sessionId);
  assert.equal(useQuizExplain.getState().windows[0].seedNonce, 0);
  assert.equal(reopened, id);
});

test("closeManagedWindow 走 quiz-explain 分支", () => {
  const id = useQuizExplain.getState().openWindow(question);
  const managed = useWindowManager.getState().windows.find((item) => item.id === id);
  assert.ok(managed);
  closeManagedWindow(managed!);
  assert.equal(useQuizExplain.getState().windows.length, 0);
  assert.equal(useWindowManager.getState().windows.length, 0);
});
