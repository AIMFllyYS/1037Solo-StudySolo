import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  CHAT_SESSION_KEY_PREFIX,
  __resetIdbStoragePendingForTests,
  chatSessionKey,
  flushPendingWrites,
} from "./idbStorage.ts";
import type { ChatMessage } from "@/lib/types/chat";
import { INITIAL_WINDOW_TURNS, TURNS_PER_CHUNK } from "@/lib/chat/turnSpine.ts";

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
const fixtureGet = (key: string) => storage.get(physical(key));


function msg(id: string, role: "user" | "assistant", text = id): ChatMessage {
  return { id, role, parts: [{ type: "text", text }], timestamp: 1 } as ChatMessage;
}

function sessionOf(turns: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push(msg(`u${i}`, "user", `第${i}轮`));
    out.push(msg(`a${i}`, "assistant"));
  }
  return out;
}

async function saveAndWait(sessionId: string, messages: ChatMessage[]) {
  const { saveSessionMessages, __waitSessionWritesForTests } = await import("./chatStorage.ts");
  saveSessionMessages(sessionId, messages);
  await __waitSessionWritesForTests(sessionId);
  flushPendingWrites();
}

describe("chatStorage v3 windowed session", { concurrency: false }, () => {
  beforeEach(() => {
    storage.clear();
    __resetIdbStoragePendingForTests();
    installBrowserMocks();
  });

  afterEach(async () => {
    const { __resetSessionV3ForTests } = await import("./chatStorage.ts");
    __resetSessionV3ForTests();
    __resetIdbStoragePendingForTests();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { indexedDB?: object }).indexedDB;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test("save → 分块键 + head；loadSessionMessages 全量装配还原", async () => {
    const { loadSessionMessages } = await import("./chatStorage.ts");
    const messages = sessionOf(TURNS_PER_CHUNK + 3);
    await saveAndWait("s1", messages);

    assert.ok(fixtureGet("chat-s3:s1:h"), "head key 应存在");
    assert.ok(fixtureGet("chat-s3:s1:c:0"), "chunk0 应存在");
    assert.ok(fixtureGet("chat-s3:s1:c:1"), "chunk1 应存在");
    assert.equal(fixtureGet("chat-s3:s1:c:2"), undefined);
    assert.equal(fixtureGet(chatSessionKey("s1")), undefined, "v2 键不应写入");

    const loaded = await loadSessionMessages("s1");
    assert.deepEqual(loaded?.map((m) => m.id), messages.map((m) => m.id));
  });

  test("loadSessionWindow 只取最近 N 轮，spine 覆盖全量", async () => {
    const { loadSessionWindow } = await import("./chatStorage.ts");
    const turns = 20;
    await saveAndWait("s2", sessionOf(turns));

    const window = await loadSessionWindow("s2");
    assert.ok(window);
    assert.equal(window!.turnCount, turns);
    assert.equal(window!.messageCount, turns * 2);
    assert.equal(window!.startTurn, turns - INITIAL_WINDOW_TURNS);
    assert.equal(window!.messages.length, INITIAL_WINDOW_TURNS * 2);
    assert.equal(window!.messages[0].id, `u${turns - INITIAL_WINDOW_TURNS}`);
    assert.equal(window!.spine.length, turns);
  });

  test("loadTurnsBefore 回读更早轮次区间", async () => {
    const { loadSessionWindow, loadTurnsBefore } = await import("./chatStorage.ts");
    await saveAndWait("s3", sessionOf(12));
    const window = await loadSessionWindow("s3");
    const range = await loadTurnsBefore("s3", window!.startTurn, 4);
    assert.ok(range);
    assert.equal(range!.fromTurn, window!.startTurn - 4);
    assert.equal(range!.messages.length, 8);
    assert.equal(range!.messages[0].id, `u${window!.startTurn - 4}`);
  });

  test("appendSessionMessages：尾部追加 + spine 增长", async () => {
    const { appendSessionMessages, loadSessionMessages, loadSessionSpine } = await import("./chatStorage.ts");
    await saveAndWait("s4", sessionOf(3));

    appendSessionMessages("s4", [msg("u3", "user", "新轮"), msg("a3", "assistant")]);
    flushPendingWrites();

    const loaded = await loadSessionMessages("s4");
    assert.equal(loaded!.length, 8);
    assert.equal(loaded![6].id, "u3");
    const spine = await loadSessionSpine("s4");
    assert.equal(spine!.length, 4);
    assert.equal(spine![3].userMessageId, "u3");
  });

  test("append 跨块：第 8 轮后再追加开新 chunk", async () => {
    const { appendSessionMessages, loadSessionMessages } = await import("./chatStorage.ts");
    await saveAndWait("s5", sessionOf(TURNS_PER_CHUNK));

    appendSessionMessages("s5", [msg("u8", "user"), msg("a8", "assistant")]);
    flushPendingWrites();

    assert.ok(fixtureGet("chat-s3:s5:c:1"), "应产生 chunk1");
    const loaded = await loadSessionMessages("s5");
    assert.equal(loaded!.length, (TURNS_PER_CHUNK + 1) * 2);
    assert.equal(loaded![TURNS_PER_CHUNK * 2].id, "u8");
  });

  test("writeSessionMessage：流式更新只动消息内容", async () => {
    const { writeSessionMessage, loadSessionMessages } = await import("./chatStorage.ts");
    await saveAndWait("s6", sessionOf(2));

    writeSessionMessage("s6", msg("a1", "assistant", "流式更新后的回答"));
    flushPendingWrites();

    const loaded = await loadSessionMessages("s6");
    const target = loaded!.find((m) => m.id === "a1");
    assert.equal((target!.parts[0] as { text: string }).text, "流式更新后的回答");
    assert.equal(loaded!.length, 4);
  });

  test("v2 单 blob 惰性迁移为 v3", async () => {
    const { loadSessionWindow, loadSessionMessages } = await import("./chatStorage.ts");
    const messages = sessionOf(6);
    fixtureSet(chatSessionKey("s7"), JSON.stringify(messages));

    const window = await loadSessionWindow("s7");
    assert.ok(window);
    assert.equal(window!.turnCount, 6);
    assert.ok(fixtureGet("chat-s3:s7:h"), "迁移后应写 v3 head");
    assert.equal(fixtureGet(chatSessionKey("s7")), undefined, "v2 键应被清除");

    const loaded = await loadSessionMessages("s7");
    assert.equal(loaded!.length, 12);
  });

  test("deleteSessionData 清掉全部 v3 键", async () => {
    const { deleteSessionData, loadSessionMessages } = await import("./chatStorage.ts");
    await saveAndWait("s8", sessionOf(10));
    await deleteSessionData("s8");
    for (const key of [...storage.keys()]) {
      assert.ok(!key.startsWith("chat-s3:s8:"), `残留 v3 键: ${key}`);
    }
    assert.equal(await loadSessionMessages("s8"), null);
  });

  test("loadSessionTail：只回读覆盖 minMessages 的尾部轮次", async () => {
    const { loadSessionTail } = await import("./chatStorage.ts");
    await saveAndWait("s9", sessionOf(12)); // 24 条消息 / 2 个 chunk

    const tail = await loadSessionTail("s9", 6);
    assert.ok(tail);
    assert.ok(tail!.length >= 6);
    assert.equal(tail![tail!.length - 1].id, "a11", "尾部必须含最后一条");
    // 粒度是轮：收满 6 条为止，第一条是某个 user 消息，绝不会从 assistant 半截开始。
    assert.equal(tail![0].role, "user");
  });

  test("loadSessionTail：minMessages 超过总长时等价全量", async () => {
    const { loadSessionTail } = await import("./chatStorage.ts");
    await saveAndWait("s10", sessionOf(3));
    const tail = await loadSessionTail("s10", 999);
    assert.equal(tail!.length, 6);
    assert.equal(tail![0].id, "u0");
  });

  test("loadSessionTail：不存在的会话返回 null", async () => {
    const { loadSessionTail } = await import("./chatStorage.ts");
    assert.equal(await loadSessionTail("nope", 10), null);
  });

  test("gcOrphanedChatKeys 识别 v3 孤儿键", async () => {
    const { gcOrphanedChatKeys } = await import("./chatStorage.ts");
    // manifest 里只有 keep；orphan 的 v3 键应被整组清掉。
    fixtureSet("chat-manifest", JSON.stringify({
      version: 2, activeSessionId: "keep",
      sessions: [{ id: "keep", title: "", createdAt: 0, updatedAt: 0, messageCount: 0, artifactIds: [] }],
      folders: [], activeProjectId: null,
    }));
    await saveAndWait("keep", sessionOf(1));
    await saveAndWait("orphan", sessionOf(9));

    const { deleted } = await gcOrphanedChatKeys();
    assert.ok(deleted.some((k) => k.startsWith("chat-s3:orphan:")));
    for (const key of [...storage.keys()]) {
      assert.ok(!key.startsWith("chat-s3:orphan:"));
    }
    assert.ok(fixtureGet("chat-s3:keep:h"), "存活会话的 head 不应被删");
  });
});
