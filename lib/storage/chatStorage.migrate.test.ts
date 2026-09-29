import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { PERSIST_KEYS } from "./idbStorage.ts";

const storage = new Map<string, string>();
let failSetItemForPrefix: string | null = null;

function installBrowserMocks() {
  activateStorageOwner("fixture-user");
  (globalThis as { window?: unknown }).window = {};
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
      if (failSetItemForPrefix && key.startsWith(physical(failSetItemForPrefix))) {
        throw new Error(`forced write failure: ${key}`);
      }
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
const physical = (key: string) => ownedStorageKey(key)!;
const fixtureSet = (key: string, value: string) => storage.set(physical(key), value);
const fixtureGet = (key: string) => storage.get(physical(key));


beforeEach(() => {
  storage.clear();
  failSetItemForPrefix = null;
  installBrowserMocks();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: object }).indexedDB;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test("migrateFromV1IfNeeded：v1 单体 JSON 拆分为 manifest + per-session", async () => {
  const v1 = {
    state: {
      activeSessionId: "s1",
      sessions: [
        {
          id: "s1",
          title: "测试",
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hi",
              timestamp: 3,
            },
          ],
        },
      ],
    },
  };
  fixtureSet(PERSIST_KEYS.chatHistory, JSON.stringify(v1));

  const { migrateFromV1IfNeeded, loadManifest, loadSessionMessages } = await import("./chatStorage.ts");

  const migrated = await migrateFromV1IfNeeded();
  assert.equal(migrated, true);

  const manifest = await loadManifest();
  assert.ok(manifest);
  assert.equal(manifest!.version, 2);
  assert.equal(manifest!.sessions.length, 1);
  assert.equal(manifest!.activeSessionId, "s1");

  const messages = await loadSessionMessages("s1");
  assert.ok(messages);
  assert.equal(messages!.length, 1);
  // v1 旧扁平结构在迁移时同时转成 parts
  assert.deepEqual(messages![0].parts, [{ type: "text", text: "hi", state: "done" }]);

  assert.equal(fixtureGet(PERSIST_KEYS.chatHistory), undefined);

  const again = await migrateFromV1IfNeeded();
  assert.equal(again, false);
});

test("migrateFromV1IfNeeded：v2 写入失败时保留 legacy 以便重试", async () => {
  const v1 = {
    state: {
      activeSessionId: "s1",
      sessions: [
        {
          id: "s1",
          title: "测试",
          createdAt: 1,
          updatedAt: 2,
          messages: [{ id: "m1", role: "user", content: "hi", timestamp: 3 }],
        },
      ],
    },
  };
  const legacyRaw = JSON.stringify(v1);
  fixtureSet(PERSIST_KEYS.chatHistory, legacyRaw);
  failSetItemForPrefix = "chat-s3:";

  const { migrateFromV1IfNeeded, loadManifest } = await import("./chatStorage.ts");

  const migrated = await migrateFromV1IfNeeded();

  assert.equal(migrated, false);
  assert.equal(fixtureGet(PERSIST_KEYS.chatHistory), legacyRaw);
  assert.equal(await loadManifest(), null);
});

test("migrateFromV1IfNeeded：inline 图片迁移为 blob ref 且可 hydrate 回 API 附件", async () => {
  const dataUrl = "data:image/png;base64,abc";
  const v1 = {
    state: {
      activeSessionId: "s1",
      sessions: [
        {
          id: "s1",
          title: "测试",
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: "m1",
              role: "user",
              content: "看图",
              timestamp: 3,
              attachments: [{ type: "image", mimeType: "image/png", base64: dataUrl }],
            },
          ],
        },
      ],
    },
  };
  fixtureSet(PERSIST_KEYS.chatHistory, JSON.stringify(v1));

  const { migrateFromV1IfNeeded, loadSessionMessages, hydrateAttachmentsForApi } = await import("./chatStorage.ts");

  assert.equal(await migrateFromV1IfNeeded(), true);
  const stored = await loadSessionMessages("s1");
  assert.ok(stored);
  assert.equal("id" in stored![0].attachments![0], true);
  assert.equal("base64" in stored![0].attachments![0], false);

  const hydrated = await hydrateAttachmentsForApi(stored!);
  const first = hydrated[0].attachments?.[0];
  assert.equal(first && "base64" in first ? first.base64 : undefined, dataUrl);
});

test("migrateFromV1IfNeeded：文档正文单独落 blob 并可无损 hydrate", async () => {
  const v1 = {
    state: {
      activeSessionId: "docs",
      sessions: [{
        id: "docs", title: "文档", createdAt: 1, updatedAt: 2,
        messages: [{
          id: "m-doc", role: "user", content: "总结", timestamp: 3,
          attachments: [{
            type: "document", mimeType: "text/markdown", name: "复习.md",
            text: "# 重点\n细胞结构", size: 24, characterCount: 9,
          }],
        }],
      }],
    },
  };
  fixtureSet(PERSIST_KEYS.chatHistory, JSON.stringify(v1));
  const { migrateFromV1IfNeeded, loadSessionMessages, hydrateAttachmentsForApi } = await import("./chatStorage.ts");

  assert.equal(await migrateFromV1IfNeeded(), true);
  const stored = await loadSessionMessages("docs");
  const ref = stored?.[0].attachments?.[0];
  assert.ok(ref && "id" in ref && ref.type === "document");
  assert.equal(ref && "text" in ref, false);

  const hydrated = await hydrateAttachmentsForApi(stored!);
  const document = hydrated[0].attachments?.[0];
  assert.ok(document && document.type === "document" && "text" in document);
  if (document?.type === "document" && "text" in document) {
    assert.equal(document.text, "# 重点\n细胞结构");
    assert.equal(document.name, "复习.md");
  }
});

test("migrateFromV1IfNeeded：本地 PDF 数据只落本机 blob 并可恢复预览", async () => {
  const dataUrl = "data:application/pdf;base64,JVBERi0xLjc=";
  const v1 = {
    state: {
      activeSessionId: "pdf",
      sessions: [{
        id: "pdf", title: "本地 PDF", createdAt: 1, updatedAt: 2,
        messages: [{
          id: "m-pdf", role: "user", content: "本地参考", timestamp: 3,
          attachments: [{
            type: "local-file", mimeType: "application/pdf", name: "lecture.pdf",
            dataUrl, size: 14,
          }],
        }],
      }],
    },
  };
  fixtureSet(PERSIST_KEYS.chatHistory, JSON.stringify(v1));
  const { migrateFromV1IfNeeded, loadSessionMessages, hydrateAttachmentsForApi } = await import("./chatStorage.ts");

  assert.equal(await migrateFromV1IfNeeded(), true);
  const stored = await loadSessionMessages("pdf");
  const ref = stored?.[0].attachments?.[0];
  assert.ok(ref && "id" in ref && ref.type === "local-file");
  assert.equal(ref && "dataUrl" in ref, false);

  const hydrated = await hydrateAttachmentsForApi(stored!);
  const localFile = hydrated[0].attachments?.[0];
  assert.ok(localFile && localFile.type === "local-file" && "dataUrl" in localFile);
  if (localFile?.type === "local-file" && "dataUrl" in localFile) {
    assert.equal(localFile.dataUrl, dataUrl);
    assert.equal(localFile.name, "lecture.pdf");
  }
});
