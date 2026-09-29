import { activateStorageOwner } from "@/lib/storage/ownerScope";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { flushPendingWrites, __resetIdbStoragePendingForTests } from "@/lib/storage/idbStorage";
import { createLazyIdbJSONStorage } from "./_persist.ts";

const storage = new Map<string, string>();

function installBrowserMocks() {
  activateStorageOwner("fixture-user");
  (globalThis as { window?: unknown }).window = {
    addEventListener: () => {},
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
  storage.clear();
  __resetIdbStoragePendingForTests();
  installBrowserMocks();
});

afterEach(() => {
  __resetIdbStoragePendingForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: object }).indexedDB;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test("lazy persist 多次 set 只 stringify 最后一次", async () => {
  const persist = createLazyIdbJSONStorage<{ n: number }>();
  let serializations = 0;
  const payload = {
    state: { n: 1 },
    version: 0,
    toJSON() {
      serializations += 1;
      return { state: this.state, version: this.version };
    },
  };
  for (let i = 0; i < 40; i++) {
    payload.state = { n: i };
    persist.setItem("user-notes", payload);
  }
  assert.equal(serializations, 0);
  flushPendingWrites();
  assert.equal(serializations, 1);
  const stored = await persist.getItem("user-notes");
  assert.equal(stored?.state.n, 39);
});
