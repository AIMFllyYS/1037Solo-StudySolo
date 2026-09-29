import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  CHAT_BLOB_KEY_PREFIX,
  CHAT_SESSION_KEY_PREFIX,
  __resetIdbStoragePendingForTests,
  chatBlobKey,
  chatSessionKey,
  flushPendingWrites,
} from "./idbStorage.ts";
import type { ChatMessage } from "@/lib/types/chat";
import type { ChatManifestV2 } from "./chatStorage.ts";

const storage = new Map<string, string>();

function installBrowserMocks() {
  activateStorageOwner("fixture-user");
  (globalThis as { window?: unknown }).window = { addEventListener: () => {} };
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
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
  };
}
const physical = (key: string) => ownedStorageKey(key)!;
const fixtureSet = (key: string, value: string) => storage.set(physical(key), value);


describe("chatStorage gc", { concurrency: false }, () => {
beforeEach(() => {
  storage.clear();
  __resetIdbStoragePendingForTests();
  installBrowserMocks();
});

afterEach(async () => {
  const { cancelOrphanChatGc } = await import("./chatStorage.ts");
  cancelOrphanChatGc();
  __resetIdbStoragePendingForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: object }).indexedDB;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function msgWithBlob(blobId: string): ChatMessage {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "pic" }],
    timestamp: 1,
    attachments: [{ id: blobId, type: "image", mimeType: "image/png" }],
  };
}

test("gcOrphanedChatKeys deletes keys missing from manifest and keeps referenced ones", async () => {
  const { gcOrphanedChatKeys, listAllChatKeys } = await import("./chatStorage.ts");
  const keys = new Map<string, string>([
    [chatSessionKey("keep"), JSON.stringify([msgWithBlob("blob-keep")])],
    [chatSessionKey("zzz"), JSON.stringify([msgWithBlob("blob-orphan-session")])],
    [chatBlobKey("blob-keep"), "data:image/png;base64,AAA"],
    [chatBlobKey("blob-orphan"), "data:image/png;base64,BBB"],
  ]);
  const manifest: ChatManifestV2 = {
    version: 2,
    activeSessionId: "keep",
    sessions: [
      {
        id: "keep",
        title: "keep",
        createdAt: 1,
        updatedAt: 1,
        messageCount: 1,
        artifactIds: [],
      },
    ],
  };
  const result = await gcOrphanedChatKeys({
    listKeys: async () => [...keys.keys()],
    removeKey: async (key) => {
      keys.delete(key);
    },
    loadMessages: async (sessionId) => {
      const raw = keys.get(chatSessionKey(sessionId));
      return raw ? (JSON.parse(raw) as ChatMessage[]) : null;
    },
    loadManifest: async () => manifest,
  });
  assert.equal(keys.has(chatSessionKey("keep")), true);
  assert.equal(keys.has(chatBlobKey("blob-keep")), true);
  assert.equal(keys.has(chatSessionKey("zzz")), false);
  assert.equal(keys.has(chatBlobKey("blob-orphan")), false);
  assert.ok(result.deleted.includes(chatSessionKey("zzz")));
  assert.ok(result.deleted.includes(chatBlobKey("blob-orphan")));
  assert.equal(typeof listAllChatKeys, "function");
});

test("gcOrphanedChatKeys：读不到 manifest 时一个都不删（空 keep 集合 != 真相）", async () => {
  const { gcOrphanedChatKeys } = await import("./chatStorage.ts");
  const keys = new Map<string, string>([
    [chatSessionKey("a"), JSON.stringify([msgWithBlob("blob-a")])],
    [chatSessionKey("b"), JSON.stringify([msgWithBlob("blob-b")])],
    [chatBlobKey("blob-a"), "data:image/png;base64,AAA"],
  ]);
  const result = await gcOrphanedChatKeys({
    listKeys: async () => [...keys.keys()],
    removeKey: async (key) => { keys.delete(key); },
    loadMessages: async () => null,
    loadManifest: async () => null,
  });
  assert.deepEqual(result.deleted, []);
  assert.equal(keys.size, 3);
});

test("gcOrphanedChatKeys：孤儿异常多时整轮放弃（manifest 很可能是被覆盖过的旧/空列表）", async () => {
  const { gcOrphanedChatKeys } = await import("./chatStorage.ts");
  const keys = new Map<string, string>();
  for (const id of ["a", "b", "c", "d", "e"]) keys.set(chatSessionKey(id), JSON.stringify([msgWithBlob("blob-" + id)]));
  const manifest: ChatManifestV2 = {
    version: 2,
    activeSessionId: "fresh",
    sessions: [{ id: "fresh", title: "新对话", createdAt: 1, updatedAt: 1, messageCount: 0, artifactIds: [] }],
  };
  const result = await gcOrphanedChatKeys({
    listKeys: async () => [...keys.keys()],
    removeKey: async (key) => { keys.delete(key); },
    loadMessages: async () => null,
    loadManifest: async () => manifest,
  });
  assert.deepEqual(result.deleted, []);
  assert.equal(keys.size, 5, "宁可留着孤儿键，也不能在 manifest 不可信时删正文");
});

test("gcOrphanedChatKeys：存活会话正文读不出来时不动任何附件", async () => {
  const { gcOrphanedChatKeys } = await import("./chatStorage.ts");
  const keys = new Map<string, string>([
    [chatSessionKey("keep"), "NOT-JSON"],
    [chatSessionKey("orphan"), JSON.stringify([msgWithBlob("blob-o")])],
    [chatBlobKey("blob-keep-actual"), "data:image/png;base64,AAA"],
  ]);
  const manifest: ChatManifestV2 = {
    version: 2,
    activeSessionId: "keep",
    sessions: [{ id: "keep", title: "keep", createdAt: 1, updatedAt: 1, messageCount: 3, artifactIds: [] }],
  };
  const result = await gcOrphanedChatKeys({
    listKeys: async () => [...keys.keys()],
    removeKey: async (key) => { keys.delete(key); },
    loadMessages: async (sessionId) => {
      const raw = keys.get(chatSessionKey(sessionId));
      if (!raw) return null;
      try { return JSON.parse(raw) as ChatMessage[]; } catch { return null; }
    },
    loadManifest: async () => manifest,
  });
  assert.deepEqual(result.deleted, [chatSessionKey("orphan")]);
  assert.equal(keys.has(chatBlobKey("blob-keep-actual")), true, "keep 集合不完整时不能删附件");
});

test("listAllChatKeys enumerates session and blob prefixes from local storage", async () => {
  const { listAllChatKeys } = await import("./chatStorage.ts");
  fixtureSet(chatSessionKey("zzz"), "[]");
  fixtureSet(chatBlobKey("b1"), "data:image/png;base64,AAA");
  fixtureSet("unrelated", "nope");
  flushPendingWrites();
  const keys = await listAllChatKeys();
  assert.ok(keys.includes(`${CHAT_SESSION_KEY_PREFIX}zzz`));
  assert.ok(keys.includes(`${CHAT_BLOB_KEY_PREFIX}b1`));
  assert.equal(keys.includes("unrelated"), false);
});
});
