import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import {
  DEFAULT_QUIZ_EXPLAIN_MODEL,
  QUIZ_EXPLAIN_MODEL_KEY,
  getQuizExplainModelId,
  setQuizExplainModelId,
} from "./useQuizExplainModel.ts";

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
  (globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: ls };
}

function teardownLocalStorage() {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  delete (globalThis as unknown as { window?: { localStorage: Storage } }).window;
}

afterEach(async () => {
  teardownLocalStorage();
  const { useSettings } = await import("@/lib/stores/settings");
  const current = useSettings.getState() as { quizModelId?: string; quizExplainModel?: string };
  if ("quizModelId" in current || "quizExplainModel" in current) {
    useSettings.setState({ quizModelId: undefined, quizExplainModel: undefined } as never);
  }
});

test("quizExplainModel 缺省为 DeepSeek 全局默认模型", () => {
  setupLocalStorage();
  assert.equal(DEFAULT_QUIZ_EXPLAIN_MODEL, DEFAULT_MODEL_ID);
  assert.match(DEFAULT_QUIZ_EXPLAIN_MODEL, /deepseek/i);
  assert.equal(getQuizExplainModelId(), DEFAULT_MODEL_ID);
});

test("quizExplainModel 可读已写入的答题模型", () => {
  setupLocalStorage();
  setQuizExplainModelId("mimo-v2.5");
  assert.equal(window.localStorage.getItem(QUIZ_EXPLAIN_MODEL_KEY), "mimo-v2.5");
  assert.equal(getQuizExplainModelId(), "mimo-v2.5");
});

test("空字符串回退 DeepSeek", () => {
  setupLocalStorage();
  setQuizExplainModelId("mimo-v2.5");
  setQuizExplainModelId("   ");
  assert.equal(getQuizExplainModelId(), DEFAULT_MODEL_ID);
});

test("无独立 key 时读设置 store 的答题模型", async () => {
  setupLocalStorage();
  const { useSettings } = await import("@/lib/stores/settings");
  useSettings.setState({ quizModelId: "mimo-v2.5" } as never);
  assert.equal(getQuizExplainModelId(), "mimo-v2.5");
  setQuizExplainModelId("deepseek/deepseek-v4.1-flash");
  assert.equal(getQuizExplainModelId(), "deepseek/deepseek-v4.1-flash");
});
