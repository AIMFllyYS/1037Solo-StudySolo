import {activateStorageOwner} from "./ownerScope.ts";
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import {
  idbStorage,
  setItemNow,
  flushPendingWrites,
  WRITE_DEBOUNCE_MS,
  __resetIdbStoragePendingForTests,
} from "./idbStorage.ts";

const storage = new Map<string, string>();

test('lazy writes serialize only the latest snapshot, and deletion cancels it', async () => {
  let serializations = 0;
  for (let i = 0; i < 100; i++) idbStorage.setItemLazy('lazy', () => { serializations++; return String(i); });
  assert.equal(serializations, 0);
  flushPendingWrites();
  assert.equal(serializations, 1);
  assert.equal(await idbStorage.getItem('lazy'), '99');
  idbStorage.setItemLazy('lazy', () => { serializations++; return 'deleted'; });
  await idbStorage.removeItem('lazy');
  flushPendingWrites();
  assert.equal(serializations, 1);
  assert.equal(await idbStorage.getItem('lazy'), null);
});

function installBrowserMocks() {
  const listeners = new Map<string, Set<() => void>>();
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
  };
  (globalThis as { indexedDB?: object }).indexedDB = {};
  (globalThis as { localStorage?: Storage }).localStorage = {
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
  };
}

beforeEach(() => {
  activateStorageOwner("test-owner");
  storage.clear();
  __resetIdbStoragePendingForTests();
  installBrowserMocks();
});

afterEach(() => {
  activateStorageOwner(null);
  __resetIdbStoragePendingForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: object }).indexedDB;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test("setItem：防抖窗口内多次写入只落盘最后一次", async () => {
  let writes = 0;
  const originalSetItem = globalThis.localStorage!.setItem.bind(globalThis.localStorage);
  globalThis.localStorage!.setItem = (key: string, value: string) => {
    writes += 1;
    originalSetItem(key, value);
  };

  idbStorage.setItem("chat-history", '{"v":1}');
  idbStorage.setItem("chat-history", '{"v":2}');
  idbStorage.setItem("chat-history", '{"v":3}');

  assert.equal(writes, 0, "防抖期内不应写盘");

  await new Promise((r) => setTimeout(r, WRITE_DEBOUNCE_MS + 50));
  assert.equal(writes, 1, "防抖结束后应只写一次");
  assert.equal(storage.get("ss-user:test-owner:chat-history"), '{"v":3}');
});

test("getItem：未落盘时返回 pending 最新值", async () => {
  idbStorage.setItem("chat-history", '{"pending":true}');
  const val = await idbStorage.getItem("chat-history");
  assert.equal(val, '{"pending":true}');
});

test("flushPendingWrites：立即落盘所有挂起 key", () => {
  let writes = 0;
  const originalSetItem = globalThis.localStorage!.setItem.bind(globalThis.localStorage);
  globalThis.localStorage!.setItem = (key: string, value: string) => {
    writes += 1;
    originalSetItem(key, value);
  };

  idbStorage.setItem("a", "1");
  idbStorage.setItem("b", "2");
  flushPendingWrites();
  assert.equal(writes, 2);
  assert.equal(storage.get("ss-user:test-owner:a"), "1");
  assert.equal(storage.get("ss-user:test-owner:b"), "2");
});

test("setItemNow：绕过防抖并返回写入结果", async () => {
  const ok = await setItemNow("chat-manifest", '{"version":2}');

  assert.equal(ok, true);
  assert.equal(storage.get("ss-user:test-owner:chat-manifest"), '{"version":2}');
});
