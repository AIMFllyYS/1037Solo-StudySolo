import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { APP_MODE_STORAGE_KEY } from "@/lib/constants/app-mode";
import { useAppMode } from "./appMode";

const storage = new Map<string, string>();
const attrs = new Map<string, string>();

function installBrowserMocks() {
  (globalThis as { window?: { localStorage: Storage } }).window = {
    localStorage: {
      get length() {
        return storage.size;
      },
      clear() {
        storage.clear();
      },
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      key() {
        return null;
      },
    },
  };
  (globalThis as { document?: { documentElement: { setAttribute: (n: string, v: string) => void } } }).document = {
    documentElement: {
      setAttribute(name, value) {
        attrs.set(name, value);
      },
    },
  };
}

function resetStore() {
  useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: false });
}

beforeEach(() => {
  storage.clear();
  attrs.clear();
  installBrowserMocks();
  resetStore();
});

afterEach(() => {
  resetStore();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

test("setMode 写入 mode 与 data-app-mode，并落到 studysolo-app-mode", () => {
  useAppMode.getState().setMode("agent");
  assert.equal(useAppMode.getState().mode, "agent");
  assert.equal(useAppMode.getState().hydrated, true);
  assert.equal(attrs.get("data-app-mode"), "agent");
  assert.deepEqual(JSON.parse(storage.get(APP_MODE_STORAGE_KEY) ?? "{}"), {
    mode: "agent",
    lastStudioPath: "/",
  });
});

test("syncFromPathname 跟 URL，登录页不改 persist", () => {
  useAppMode.getState().setMode("studio");
  useAppMode.getState().syncFromPathname("/class");
  assert.equal(useAppMode.getState().mode, "class");
  useAppMode.getState().syncFromPathname("/login");
  assert.equal(useAppMode.getState().mode, "class");
});

test("setMode / syncFromPathname 支持 review 模式", () => {
  useAppMode.getState().setMode("review");
  assert.equal(useAppMode.getState().mode, "review");
  assert.equal(attrs.get("data-app-mode"), "review");
  assert.deepEqual(JSON.parse(storage.get(APP_MODE_STORAGE_KEY) ?? "{}"), {
    mode: "review",
    lastStudioPath: "/",
  });
  useAppMode.getState().syncFromPathname("/review");
  assert.equal(useAppMode.getState().mode, "review");
  useAppMode.getState().syncFromPathname("/anatomy/detail/1.1");
  assert.equal(useAppMode.getState().mode, "studio");
});

test("手机 retainAgentOnStudio：Studio 路由不把 Agent persist 改回 studio", () => {
  useAppMode.getState().setMode("agent");
  useAppMode.getState().rememberStudioPath("/anatomy/detail/1.1");
  useAppMode.getState().syncFromPathname("/anatomy/detail/1.1", { retainAgentOnStudio: true });
  assert.equal(useAppMode.getState().mode, "agent");
  useAppMode.getState().syncFromPathname("/class", { retainAgentOnStudio: true });
  assert.equal(useAppMode.getState().mode, "class");
});

test("rememberStudioPath 只记 Studio 路由", () => {
  useAppMode.getState().rememberStudioPath("/anatomy/detail/1.1");
  useAppMode.getState().rememberStudioPath("/agent");
  useAppMode.getState().rememberStudioPath("/login");
  assert.equal(useAppMode.getState().lastStudioPath, "/anatomy/detail/1.1");
  assert.deepEqual(JSON.parse(storage.get(APP_MODE_STORAGE_KEY) ?? "{}"), {
    mode: "studio",
    lastStudioPath: "/anatomy/detail/1.1",
  });
});

test("hydrate 从 localStorage 回填 mode 与 lastStudioPath", () => {
  storage.set(
    APP_MODE_STORAGE_KEY,
    JSON.stringify({ mode: "agent", lastStudioPath: "/chemistry/detail/1.1" }),
  );
  useAppMode.getState().hydrate();
  assert.equal(useAppMode.getState().mode, "agent");
  assert.equal(useAppMode.getState().lastStudioPath, "/chemistry/detail/1.1");
  assert.equal(useAppMode.getState().hydrated, true);
  assert.equal(attrs.get("data-app-mode"), "agent");
});
