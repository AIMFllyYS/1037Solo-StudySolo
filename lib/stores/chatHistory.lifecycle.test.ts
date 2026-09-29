import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import assert from "node:assert/strict";
import { beforeEach, afterEach, describe, test } from "node:test";
import { flushPendingWrites, PERSIST_KEYS, chatBlobKey, chatSessionKey, __resetIdbStoragePendingForTests } from "@/lib/storage/idbStorage";
import { cancelOrphanChatGc, __resetSessionV3ForTests, loadSessionMessages, saveSessionMessages, __waitSessionWritesForTests } from "@/lib/storage/chatStorage";
import type { ChatMessage } from "@/lib/types/chat";
import type { SessionMeta } from "@/lib/storage/chatStorage";

const storage = new Map<string, string>();

function installBrowserMocks() {
  activateStorageOwner("fixture-user");
  (globalThis as { window?: unknown }).window = {
    addEventListener: () => {},
  };
  (globalThis as { document?: unknown }).document = {
    addEventListener: () => {},
    visibilityState: "visible",
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
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
  };
}
const physical = (key: string) => ownedStorageKey(key)!;
const fixtureSet = (key: string, value: string) => storage.set(physical(key), value);
const fixtureGet = (key: string) => storage.get(physical(key));
const fixtureHas = (key: string) => storage.has(physical(key));
const fixtureDelete = (key: string) => storage.delete(physical(key));


function msg(id: string, content: string): ChatMessage {
  return { id, role: "assistant", parts: [{ type: "text", text: content }], timestamp: Number(id.replace(/\D/g, "")) || 1 };
}

function textOf(m: ChatMessage | undefined): string | undefined {
  const part = m?.parts.find((p) => p.type === "text");
  return part && part.type === "text" ? part.text : undefined;
}

function meta(id: string): SessionMeta {
  return {
    id,
    title: id,
    createdAt: 1,
    updatedAt: 1,
    messageCount: 1,
    artifactIds: [],
  };
}

async function waitForPendingWrites() {
  flushPendingWrites();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("chatHistory.lifecycle", { concurrency: false }, () => {
beforeEach(async () => {
  cancelOrphanChatGc();
  storage.clear();
  __resetIdbStoragePendingForTests();
  __resetSessionV3ForTests();
  installBrowserMocks();
  const { useChatHistory } = await import("./chatHistory.ts");
  useChatHistory.setState({
    sessionsMeta: [],
    messagesById: {},
    sessionWindowById: {},
    activeSessionId: null,
    sessionLoadState: {},
    loadedSessionIds: [],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
    blankChatPulse: 0,
  });
});

afterEach(() => {
  cancelOrphanChatGc();
  __resetIdbStoragePendingForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { indexedDB?: object }).indexedDB;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test("deleteSession：删除 active 会话后加载新的 active 会话消息", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  fixtureSet(chatSessionKey("s2"), JSON.stringify([msg("m2", "loaded")]));
  useChatHistory.setState({
    sessionsMeta: [meta("s1"), meta("s2")],
    messagesById: { s1: [msg("m1", "old")] },
    activeSessionId: "s1",
    sessionLoadState: { s1: "loaded" },
    loadedSessionIds: ["s1"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });

  useChatHistory.getState().deleteSession("s1");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const state = useChatHistory.getState();
  assert.equal(state.activeSessionId, "s2");
  assert.equal(state.sessionLoadState.s2, "loaded");
  assert.equal(state._activeMessagesReady, true);
  assert.equal(textOf(state.messagesById.s2?.[0]), "loaded");
});

test("updateMessage：content-only 流式更新只写 session，不写 manifest", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  // v3 下 writeSessionMessage 需要会话正文已存在（v2 键会被就地迁移为分块）。
  fixtureSet(chatSessionKey("s1"), JSON.stringify([msg("m1", "old")]));
  useChatHistory.setState({
    sessionsMeta: [meta("s1")],
    messagesById: { s1: [msg("m1", "old")] },
    activeSessionId: "s1",
    sessionLoadState: { s1: "loaded" },
    loadedSessionIds: ["s1"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });

  useChatHistory.getState().updateMessage("s1", "m1", { parts: [{ type: "text", text: "new" }] });
  await waitForPendingWrites();
  await __waitSessionWritesForTests("s1");
  await waitForPendingWrites();

  const stored = await loadSessionMessages("s1");
  assert.equal(textOf(stored?.[0]), "new");
  assert.equal(fixtureGet(PERSIST_KEYS.chatManifest), undefined);
});

test("updateMessage：新增 artifactId 时写 manifest 供冷 prune 使用", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  fixtureSet(chatSessionKey("s1"), JSON.stringify([msg("m1", "old")]));
  useChatHistory.setState({
    sessionsMeta: [meta("s1")],
    messagesById: { s1: [msg("m1", "old")] },
    activeSessionId: "s1",
    sessionLoadState: { s1: "loaded" },
    loadedSessionIds: ["s1"],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });

  useChatHistory.getState().updateMessage("s1", "m1", {
    parts: [
      {
        type: "tool-renderInteractive",
        toolCallId: "tc1",
        state: "output-available",
        input: { title: "t", prompt: "p" },
        output: { text: "", artifactId: "a1", title: "t", prompt: "p" },
      },
    ],
  });
  await waitForPendingWrites();

  const manifest = JSON.parse(fixtureGet(PERSIST_KEYS.chatManifest) ?? "{}");
  assert.deepEqual(manifest.sessions[0].artifactIds, ["a1"]);
});

test("createSession uses UUID ids that do not collide in the same millisecond", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  const first = useChatHistory.getState().createSession();
  const second = useChatHistory.getState().createSession();
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(second, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("createSession note kind does not claim the active main thread", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
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
  const noteSession = useChatHistory.getState().createSession(undefined, "note");
  assert.equal(useChatHistory.getState().activeSessionId, "main");
  assert.equal(useChatHistory.getState().sessionsMeta.find((item) => item.id === noteSession)?.kind, "note");
});

test("evicting past MAX_SESSIONS deletes blobs and drops messagesById", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  const evicted = "old-49";
  const metas = Array.from({ length: 50 }, (_, index) => meta(`old-${String(index).padStart(2, "0")}`));
  const blobId = "blob-evicted";
  fixtureSet(
    chatSessionKey(evicted),
    JSON.stringify([
      {
        id: "m-old",
        role: "user",
        parts: [{ type: "text", text: "pic" }],
        timestamp: 1,
        attachments: [{ id: blobId, type: "image", mimeType: "image/png" }],
      },
    ]),
  );
  fixtureSet(chatBlobKey(blobId), "data:image/png;base64,QUJD");
  useChatHistory.setState({
    sessionsMeta: metas,
    messagesById: {
      [evicted]: [
        {
          id: "m-old",
          role: "user",
          parts: [{ type: "text", text: "pic" }],
          timestamp: 1,
          attachments: [{ id: blobId, type: "image", mimeType: "image/png" }],
        },
      ],
    },
    activeSessionId: evicted,
    sessionLoadState: { [evicted]: "loaded" },
    loadedSessionIds: [evicted],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });

  useChatHistory.getState().createSession();
  // 淘汰链路 = listBlobIds（触发 v2→v3 迁移写）→ deleteSessionData（排队删 v3 键）：
  // 都是异步队列，轮询到删除落地为止，而不是赌一个固定毫秒数。
  for (let i = 0; i < 60 && (fixtureHas(chatBlobKey(blobId)) || fixtureHas(chatSessionKey(evicted))); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    flushPendingWrites();
  }
  await waitForPendingWrites();

  assert.equal(useChatHistory.getState().messagesById[evicted], undefined);
  assert.equal(fixtureHas(chatBlobKey(blobId)), false);
  assert.equal(fixtureHas(chatSessionKey(evicted)), false);
  assert.equal(fixtureHas(`chat-s3:${evicted}:h`), false);
  const ids = useChatHistory.getState().sessionsMeta.map((item) => item.id);
  assert.equal(ids.includes(evicted), false);
  assert.equal(ids.length, 50);
});

test("updateMessage on an evicted session does not write the shard back", async () => {
  const { useChatHistory } = await import("./chatHistory.ts");
  const evicted = "old-49";
  const metas = Array.from({ length: 50 }, (_, index) => meta(`old-${String(index).padStart(2, "0")}`));
  useChatHistory.setState({
    sessionsMeta: metas,
    messagesById: { [evicted]: [msg("m1", "stay")] },
    activeSessionId: evicted,
    sessionLoadState: { [evicted]: "loaded" },
    loadedSessionIds: [evicted],
    pinnedSessionIds: [],
    _hasHydrated: true,
    _activeMessagesReady: true,
  });
  useChatHistory.getState().createSession();
  fixtureDelete(chatSessionKey(evicted));
  useChatHistory.getState().updateMessage(evicted, "m1", { parts: [{ type: "text", text: "ghost" }] });
  await waitForPendingWrites();
  assert.equal(fixtureGet(chatSessionKey(evicted)), undefined);
});

describe("chatHistory.startNewChat", { concurrency: false }, () => {
  const main = (id: string, messageCount = 0, extra: Partial<SessionMeta> = {}): SessionMeta => ({
    id,
    title: "新对话",
    createdAt: 1,
    updatedAt: 1,
    messageCount,
    artifactIds: [],
    ...extra,
  });

  test("连点：已经在空白新对话里就复用，不再落第二条", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    const first = useChatHistory.getState().startNewChat({ subjectId: "probability", categoryId: "", itemId: "", currentTopic: "" });
    const second = useChatHistory.getState().startNewChat();
    const third = useChatHistory.getState().startNewChat();
    assert.equal(second, first);
    assert.equal(third, first);
    assert.equal(useChatHistory.getState().sessionsMeta.length, 1);
    // 三次点击里有两次是「复用当前这条」，脉冲记两次给 UI 提示
    assert.equal(useChatHistory.getState().blankChatPulse, 2);
  });

  test("发过消息之后再点才真的新建", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    const first = useChatHistory.getState().startNewChat();
    assert.ok(first);
    useChatHistory.getState().addMessage(first, msg("m1", "问了一句"));
    const second = useChatHistory.getState().startNewChat();
    assert.notEqual(second, first);
    assert.equal(useChatHistory.getState().sessionsMeta.length, 2);
    assert.equal(useChatHistory.getState().activeSessionId, second);
  });

  test("已经站在空白对话里：不跳走、不新建，只记一次脉冲", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({
      sessionsMeta: [main("newer-blank"), main("older-blank")],
      messagesById: {},
      activeSessionId: "older-blank",
      sessionLoadState: {},
      loadedSessionIds: [],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: true,
    });
    const id = useChatHistory.getState().startNewChat();
    assert.equal(id, "older-blank");
    assert.equal(useChatHistory.getState().sessionsMeta.length, 2);
    assert.equal(useChatHistory.getState().blankChatPulse, 1);
  });

  test("人在真实对话里：复用列表里最新那条空白，且接上后可直接发送", async () => {
    const { canSendNow } = await import("@/lib/chat/canSendNow");
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({
      sessionsMeta: [main("blank"), main("real", 4)],
      messagesById: { real: [msg("m1", "旧消息")] },
      activeSessionId: "real",
      sessionLoadState: { real: "loaded" },
      loadedSessionIds: ["real"],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: true,
    });
    const id = useChatHistory.getState().startNewChat();
    const state = useChatHistory.getState();
    assert.equal(id, "blank");
    assert.equal(state.sessionsMeta.length, 2);
    assert.equal(state.activeSessionId, "blank");
    // 复用路径必须自己把会话标成「已加载」：否则 canSendNow 会静默挡住发送
    assert.equal(state.sessionLoadState.blank, "loaded");
    assert.ok(state.messagesById.blank);
    assert.equal(canSendNow(state), true);
    assert.equal(state.blankChatPulse, 0);
  });

  test("未水合前不落盘：createSession 照常建，但 manifest 不会被空列表覆盖", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({ _hasHydrated: false, _activeMessagesReady: false });
    useChatHistory.getState().createSession();
    await waitForPendingWrites();
    // 未水合 → 守卫拦下写入：盘上不会出现「只剩这一条」的 manifest
    assert.equal(fixtureGet(PERSIST_KEYS.chatManifest), undefined);

    useChatHistory.setState({ _hasHydrated: true });
    useChatHistory.getState().createSession();
    await waitForPendingWrites();
    const manifest = JSON.parse(fixtureGet(PERSIST_KEYS.chatManifest) ?? "{}");
    assert.equal(manifest.sessions.length, 2);
  });

  test("未水合时 startNewChat 不新建、不落盘，返回 null（等水合后再决定）", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({ _hasHydrated: false, _activeMessagesReady: false });
    const before = useChatHistory.getState().sessionsMeta.length;
    const id = useChatHistory.getState().startNewChat();
    // 未水合：这一下点击既不新建也不落盘（水合完成后才由延后逻辑兑现）
    assert.equal(id, null);
    assert.equal(useChatHistory.getState().sessionsMeta.length, before);
    assert.equal(fixtureGet(PERSIST_KEYS.chatManifest), undefined);
    await waitForPendingWrites();
  });

  test("归档的空白、划词/笔记会话都不算「空白新对话」", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({
      sessionsMeta: [
        main("archived-blank", 0, { archived: true }),
        main("float-blank", 0, { kind: "floating" }),
        main("note-blank", 0, { kind: "note" }),
      ],
      messagesById: {},
      activeSessionId: null,
      sessionLoadState: {},
      loadedSessionIds: [],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: true,
    });
    const id = useChatHistory.getState().startNewChat();
    assert.notEqual(id, "archived-blank");
    assert.notEqual(id, "float-blank");
    assert.notEqual(id, "note-blank");
    assert.equal(useChatHistory.getState().sessionsMeta.length, 4);
  });

  test("消息没加载回来的真实对话不会被误判成空白（messageCount 说话）", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({
      sessionsMeta: [main("real", 6)],
      messagesById: {},          // 消息体还在 IndexedDB 里，没加载
      activeSessionId: "real",
      sessionLoadState: { real: "idle" },
      loadedSessionIds: [],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: false,
    });
    const id = useChatHistory.getState().startNewChat();
    assert.notEqual(id, "real");
    assert.equal(useChatHistory.getState().sessionsMeta.length, 2);
  });
});

describe("chatHistory.rememberReadSlices", { concurrency: false }, () => {
  beforeEach(async () => {
    cancelOrphanChatGc();
    storage.clear();
    __resetIdbStoragePendingForTests();
    installBrowserMocks();
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.setState({
      sessionsMeta: [meta("s1")],
      messagesById: {},
      activeSessionId: "s1",
      sessionLoadState: { s1: "loaded" },
      loadedSessionIds: ["s1"],
      pinnedSessionIds: [],
      _hasHydrated: true,
      _activeMessagesReady: true,
      blankChatPulse: 0,
    });
  });

  afterEach(() => {
    cancelOrphanChatGc();
    __resetIdbStoragePendingForTests();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { indexedDB?: object }).indexedDB;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test("累计已读切片：去重、追加在后，并写进 manifest", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.getState().rememberReadSlices("s1", ["slice-1", "slice-2"]);
    useChatHistory.getState().rememberReadSlices("s1", ["slice-2", "slice-3"]);
    await waitForPendingWrites();

    assert.deepEqual(useChatHistory.getState().sessionsMeta[0]?.readSliceIds, ["slice-1", "slice-2", "slice-3"]);
    const manifest = JSON.parse(fixtureGet(PERSIST_KEYS.chatManifest) ?? "{}") as {
      sessions?: { id: string; readSliceIds?: string[] }[];
    };
    assert.deepEqual(manifest.sessions?.find((s) => s.id === "s1")?.readSliceIds, ["slice-1", "slice-2", "slice-3"]);
  });

  test("没有新 id 时不重复落盘", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.getState().rememberReadSlices("s1", ["slice-1"]);
    await waitForPendingWrites();
    const firstWrite = fixtureGet(PERSIST_KEYS.chatManifest);
    assert.ok(firstWrite);

    useChatHistory.getState().rememberReadSlices("s1", ["slice-1"]);
    useChatHistory.getState().rememberReadSlices("s1", []);
    await waitForPendingWrites();
    assert.equal(fixtureGet(PERSIST_KEYS.chatManifest), firstWrite, "同样的片不该再写一次 manifest");
  });

  test("会话不存在时静默跳过（不新建、不落盘）", async () => {
    const { useChatHistory } = await import("./chatHistory.ts");
    useChatHistory.getState().rememberReadSlices("missing", ["slice-1"]);
    await waitForPendingWrites();
    assert.equal(useChatHistory.getState().sessionsMeta.length, 1);
    assert.equal(useChatHistory.getState().sessionsMeta[0]?.readSliceIds, undefined);
  });
});
});
