import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { ChatMessage } from "@/lib/types/chat";
import type { Artifact } from "@/lib/stores/artifacts";
import type { StoredDocument } from "@/lib/documents/types";
import type { UserNote } from "@/lib/notes/userNote";
import type { ReviewCard } from "@/lib/review/types";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import { createMemorySyncClient } from "./client.ts";
import {
  __resetCloudSyncForTests,
  __setCloudSyncDebounceForTests,
  __setCloudSyncStoresForTests,
  __setSyncClientForTests,
  enqueueTombstone,
  enqueueUpsert,
  flushCloudSyncForTests,
  loadCloudSyncUsage,
  pullAndPushAll,
  type CloudSyncStores,
} from "./engine.ts";
import { __resetCloudSyncStatusForTests, getCloudSyncStatus } from "./status.ts";
import { SCHEMA_SYNC_KINDS, type ChatProjectSyncPayload, type ChatSessionSyncPayload } from "./types.ts";
import { __setSyncLimitsForTests } from "./payload.ts";
import { setCloudSyncEnabled, isCloudSyncEnabled } from "./schedule.ts";
import { markSessionStreaming } from "./streamingSessions.ts";

function msg(id: string, text: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
    timestamp: Number(id.replace(/\D/g, "")) || 1,
    ...extra,
  };
}

function sessionMeta(id: string, updatedAt = 10): SessionMeta {
  return {
    id,
    title: id,
    createdAt: 1,
    updatedAt,
    messageCount: 1,
    artifactIds: [],
  };
}

function createMemoryStores() {
  const sessions = new Map<string, { meta: SessionMeta; messages: ChatMessage[] }>();
  const artifacts = new Map<string, Artifact>();
  const documents = new Map<string, StoredDocument>();
  const notes = new Map<string, UserNote>();
  const cards = new Map<string, ReviewCard>();
  const projects = new Map<string, ChatProjectSyncPayload>();
  const stores: CloudSyncStores = {
    listSessionMetas: () => [...sessions.values()].map((row) => row.meta),
    loadSession: async (id) => sessions.get(id) ?? null,
    applySession: (payload: ChatSessionSyncPayload) => {
      sessions.set(payload.meta.id, { meta: payload.meta, messages: payload.messages });
    },
    forgetSession: (id) => {
      sessions.delete(id);
    },
    listArtifactIds: () => [...artifacts.keys()],
    getArtifact: (id) => artifacts.get(id) ?? null,
    applyArtifact: (artifact) => {
      artifacts.set(artifact.id, artifact);
    },
    forgetArtifact: (id) => {
      artifacts.delete(id);
    },
    listDocumentIds: () => [...documents.keys()],
    getDocument: (id) => documents.get(id) ?? null,
    applyDocument: (doc) => {
      documents.set(doc.id, doc);
    },
    forgetDocument: (id) => {
      documents.delete(id);
    },
    listNoteIds: () => [...notes.keys()],
    getNote: (id) => notes.get(id) ?? null,
    applyNote: (note) => {
      notes.set(note.id, note);
    },
    forgetNote: (id) => {
      notes.delete(id);
    },
    listCardIds: () => [...cards.keys()],
    getCard: (id) => cards.get(id) ?? null,
    applyCard: (card) => {
      cards.set(card.id, card);
    },
    listProjectIds: () => [...projects.keys()],
    getProject: (id) => projects.get(id) ?? null,
    applyProject: (project) => {
      projects.set(project.id, project);
    },
    forgetProject: (id) => {
      projects.delete(id);
    },
    forgetCard: (id) => {
      cards.delete(id);
    },
  };
  return { stores, sessions, artifacts, documents, notes, cards };
}

describe("cloud sync engine", { concurrency: false }, () => {
  beforeEach(() => {
    __resetCloudSyncForTests();
    __resetCloudSyncStatusForTests();
    __setCloudSyncDebounceForTests(0);
  });

  afterEach(() => {
    __resetCloudSyncForTests();
    __resetCloudSyncStatusForTests();
    setCloudSyncEnabled(false);
  });

  test("pull restores chat-session and artifact onto empty local stores", async () => {
    const memory = createMemoryStores();
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "chat-session",
      client_id: "s-remote",
      deleted: false,
      payload: {
        v: 1,
        meta: sessionMeta("s-remote"),
        messages: [msg("m1", "from-cloud")],
      },
    });
    await api.upsert({
      kind: "artifact",
      client_id: "art-1",
      deleted: false,
      payload: { id: "art-1", title: "demo", html: "<p>ok</p>", status: "done" },
    });
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    api.upserts.length = 0;
    await pullAndPushAll();
    const session = memory.sessions.get("s-remote");
    const textPart = session?.messages[0]?.parts[0];
    assert.equal(textPart && textPart.type === "text" ? textPart.text : "", "from-cloud");
    assert.equal(memory.artifacts.get("art-1")?.html, "<p>ok</p>");
  });

  test("push strips base64 images and never writes settings or skill", async () => {
    const memory = createMemoryStores();
    memory.sessions.set("s1", {
      meta: sessionMeta("s1"),
      messages: [
        msg("m1", "photo", {
          attachments: [{ type: "image", mimeType: "image/png", base64: "data:image/png;base64,QUJDRA==" }],
        }),
      ],
    });
    memory.artifacts.set("a1", { id: "a1", title: "t", html: "<div>hi</div>", status: "done" });
    memory.documents.set("d1", {
      id: "d1",
      spec: { title: "Doc", format: "markdown", genre: "article", brief: "b" },
      sections: [{ title: "Intro", markdown: "# Hi", status: "done" }],
      status: "done",
      createdAt: 1,
      updatedAt: 2,
    });
    const api = createMemorySyncClient();
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    await pullAndPushAll();
    const kinds = api.upserts.map((row) => row.kind);
    assert.ok(kinds.includes("chat-session"));
    assert.ok(kinds.includes("artifact"));
    assert.ok(kinds.includes("document"));
    assert.ok(SCHEMA_SYNC_KINDS.includes("settings"));
    assert.ok(SCHEMA_SYNC_KINDS.includes("skill"));
    assert.equal(kinds.includes("settings"), false);
    assert.equal(kinds.includes("skill"), false);
    const chat = api.upserts.find((row) => row.kind === "chat-session");
    const json = JSON.stringify(chat?.payload);
    assert.equal(json.includes("data:image"), false);
    assert.equal(json.includes("QUJDRA=="), false);
    assert.equal(json.includes('"base64"'), false);
    assert.equal(json.includes('"apiKey"'), false);
  });

  test("multi-device chat merge keeps both sides' messages", async () => {
    const memory = createMemoryStores();
    memory.sessions.set("s1", {
      meta: sessionMeta("s1", 40),
      messages: [msg("m1", "shared"), msg("m-local", "from-a")],
    });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "chat-session",
      client_id: "s1",
      deleted: false,
      payload: {
        v: 1,
        meta: sessionMeta("s1", 50),
        messages: [msg("m1", "shared"), msg("m-remote", "from-b")],
      },
    });
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    enqueueUpsert("chat-session", "s1");
    await flushCloudSyncForTests();
    const pushed = api.rows.get("chat-session:s1");
    const payload = pushed?.payload as { messages: Array<{ id: string }> };
    const ids = payload.messages.map((row) => row.id).sort();
    assert.deepEqual(ids, ["m-local", "m-remote", "m1"].sort());
    assert.deepEqual(memory.sessions.get("s1")?.messages.map((row) => row.id).sort(), ids);
  });

  test("kind over-limit does not upsert and sets a readable error", async () => {
    __setSyncLimitsForTests({ kind: { artifact: 256 } });
    const memory = createMemoryStores();
    memory.artifacts.set("huge", {
      id: "huge",
      title: "huge",
      html: "y".repeat(300),
      status: "done",
    });
    const api = createMemorySyncClient();
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    enqueueUpsert("artifact", "huge");
    await flushCloudSyncForTests();
    assert.equal(api.rows.has("artifact:huge"), false);
    assert.match(getCloudSyncStatus().message ?? "", /未上传云端/);
  });

  test("user total over-limit refuses the new row", async () => {
    __setSyncLimitsForTests({ user: 512, kind: { artifact: 400 } });
    const memory = createMemoryStores();
    memory.artifacts.set("extra", { id: "extra", title: "e", html: "<p>more</p>", status: "done" });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "artifact",
      client_id: "filler",
      deleted: false,
      payload: { id: "filler", html: "z".repeat(400), status: "done", title: "f" },
    });
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    api.upserts.length = 0;
    enqueueUpsert("artifact", "extra");
    await flushCloudSyncForTests();
    assert.equal(api.rows.has("artifact:extra"), false);
    assert.match(getCloudSyncStatus().message ?? "", /上限/);
  });

  test("schedule stays off until login enables it", () => {
    setCloudSyncEnabled(false);
    assert.equal(isCloudSyncEnabled(), false);
    setCloudSyncEnabled(true);
    assert.equal(isCloudSyncEnabled(), true);
    setCloudSyncEnabled(false);
  });

  test("tombstone marks deleted instead of removing the row", async () => {
    const api = createMemorySyncClient();
    await api.upsert({ kind: "chat-session", client_id: "gone", payload: { v: 1 }, deleted: false });
    __setCloudSyncStoresForTests(createMemoryStores().stores);
    __setSyncClientForTests(api);
    enqueueTombstone("chat-session", "gone");
    await flushCloudSyncForTests();
    const row = api.rows.get("chat-session:gone");
    assert.equal(row?.deleted, true);
    assert.equal(api.rows.size, 1);
  });

  test("identical payload hash skips a second upsert", async () => {
    const memory = createMemoryStores();
    memory.sessions.set("s1", {
      meta: sessionMeta("s1"),
      messages: [msg("m1", "same")],
    });
    const api = createMemorySyncClient();
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    enqueueUpsert("chat-session", "s1");
    await flushCloudSyncForTests();
    const first = api.upserts.length;
    enqueueUpsert("chat-session", "s1");
    await flushCloudSyncForTests();
    assert.equal(api.upserts.length, first);
  });

  test("pullAndPushAll skips a session that is still streaming", async () => {
    const memory = createMemoryStores();
    memory.sessions.set("live", {
      meta: sessionMeta("live"),
      messages: [msg("m1", "streaming")],
    });
    const api = createMemorySyncClient();
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    markSessionStreaming("live", true);
    await pullAndPushAll();
    assert.equal(api.upserts.some((row) => row.client_id === "live"), false);
    markSessionStreaming("live", false);
    await pullAndPushAll();
    assert.equal(api.upserts.some((row) => row.client_id === "live"), true);
  });

  test("loadCloudSyncUsage sums live remote rows by kind", async () => {
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "chat-session",
      client_id: "s1",
      payload: { v: 1, meta: sessionMeta("s1"), messages: [msg("m1", "hello")] },
      deleted: false,
    });
    await api.upsert({
      kind: "artifact",
      client_id: "a1",
      payload: { id: "a1", title: "demo", html: "<p>x</p>", status: "done" },
      deleted: false,
    });
    await api.upsert({
      kind: "document",
      client_id: "d1",
      payload: { id: "d1" },
      deleted: true,
    });
    __setCloudSyncStoresForTests(createMemoryStores().stores);
    __setSyncClientForTests(api);
    const usage = await loadCloudSyncUsage();
    assert.equal(usage.source, "cloud");
    assert.equal(usage.kinds.find((row) => row.kind === "chat-session")?.count, 1);
    assert.equal(usage.kinds.find((row) => row.kind === "artifact")?.count, 1);
    assert.equal(usage.kinds.find((row) => row.kind === "document")?.count, 0);
    assert.ok(usage.totalBytes > 0);
  });

  test("loadCloudSyncUsage falls back to local stores when unsigned", async () => {
    const memory = createMemoryStores();
    memory.sessions.set("s1", {
      meta: sessionMeta("s1"),
      messages: [msg("m1", "local-only")],
    });
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(null);
    const usage = await loadCloudSyncUsage();
    assert.equal(usage.source, "local");
    assert.equal(usage.kinds.find((row) => row.kind === "chat-session")?.count, 1);
    assert.ok(usage.totalBytes > 0);
  });

  test("pull and push user-note and review-card as real cloud kinds", async () => {
    const memory = createMemoryStores();
    memory.notes.set("n1", {
      id: "n1",
      title: "被覆上皮",
      markdown: "# 被覆上皮\n\n1. 分类",
      subjectId: "anatomy",
      createdAt: 1,
      updatedAt: 2,
    });
    memory.cards.set("c1", {
      id: "c1",
      subjectId: "anatomy",
      sourceLabel: "组织学",
      originalText: "被覆上皮",
      cardType: "excerpt",
      front: "什么是被覆上皮",
      back: "覆盖体表或衬于体内",
      status: "ready",
      createdAt: 1,
    });
    const api = createMemorySyncClient();
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    await pullAndPushAll();
    const kinds = api.upserts.map((row) => row.kind);
    assert.ok(kinds.includes("user-note"));
    assert.ok(kinds.includes("review-card"));

    const other = createMemoryStores();
    __setCloudSyncStoresForTests(other.stores);
    await pullAndPushAll();
    assert.equal(other.notes.get("n1")?.markdown, "# 被覆上皮\n\n1. 分类");
    assert.equal(other.cards.get("c1")?.front, "什么是被覆上皮");
    const usage = await loadCloudSyncUsage();
    assert.equal(usage.pools.find((row) => row.id === "notes")?.count, 1);
    assert.equal(usage.pools.find((row) => row.id === "flashcards")?.count, 1);
  });

  test("user-note pull keeps the newer local updatedAt", async () => {
    const memory = createMemoryStores();
    memory.notes.set("n1", {
      id: "n1",
      title: "本机新稿",
      markdown: "# 本机",
      subjectId: "anatomy",
      createdAt: 1,
      updatedAt: 90,
    });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "user-note",
      client_id: "n1",
      deleted: false,
      payload: {
        id: "n1",
        title: "云端旧稿",
        markdown: "# 云端",
        subjectId: "anatomy",
        createdAt: 1,
        updatedAt: 10,
      },
    });
    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    await pullAndPushAll();
    assert.equal(memory.notes.get("n1")?.title, "本机新稿");
    assert.match(JSON.stringify(api.upserts.at(-1)?.payload), /本机/);
  });

  /**
   * 闪卡过去没有版本比较：`pushOne` 只有 user-note / chat-project 分支，
   * review-card 一律无条件 upsert。于是只要本机对同一张卡有任何改动，
   * 就会静默覆盖别处（Platform Wiki）写下的编辑。
   */
  test("review-card push does not clobber a newer remote version", async () => {
    const memory = createMemoryStores();
    memory.cards.set("c1", {
      id: "c1",
      subjectId: "anatomy",
      sourceLabel: "组织学",
      originalText: "被覆上皮",
      cardType: "excerpt",
      front: "本机旧稿",
      back: "本机旧答案",
      status: "ready",
      createdAt: 1,
      updatedAt: 10,
    });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "review-card",
      client_id: "c1",
      deleted: false,
      payload: {
        id: "c1",
        subjectId: "anatomy",
        sourceLabel: "组织学",
        originalText: "被覆上皮",
        cardType: "excerpt",
        front: "Platform 新稿",
        back: "Platform 新答案",
        status: "ready",
        createdAt: 1,
        updatedAt: 90,
      },
    });
    const before = api.upserts.length;

    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    // 走推送路径而不是先拉取：这正是有本地改动时的真实时序。
    enqueueUpsert("review-card", "c1");
    await flushCloudSyncForTests();

    assert.equal(
      api.upserts.length,
      before,
      "云端更新时不得再次上传，否则会覆盖 Platform 的编辑"
    );
    assert.equal(memory.cards.get("c1")?.front, "Platform 新稿");
    assert.equal(memory.cards.get("c1")?.back, "Platform 新答案");
  });

  test("review-card push still wins when the local copy is newer", async () => {
    const memory = createMemoryStores();
    memory.cards.set("c1", {
      id: "c1",
      subjectId: "anatomy",
      sourceLabel: "组织学",
      originalText: "被覆上皮",
      cardType: "excerpt",
      front: "本机新稿",
      back: "本机新答案",
      status: "ready",
      createdAt: 1,
      updatedAt: 90,
    });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "review-card",
      client_id: "c1",
      deleted: false,
      payload: {
        id: "c1",
        subjectId: "anatomy",
        sourceLabel: "组织学",
        originalText: "被覆上皮",
        cardType: "excerpt",
        front: "云端旧稿",
        back: "云端旧答案",
        status: "ready",
        createdAt: 1,
        updatedAt: 10,
      },
    });
    const before = api.upserts.length;

    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    enqueueUpsert("review-card", "c1");
    await flushCloudSyncForTests();

    assert.equal(api.upserts.length, before + 1, "本机更新时必须照常上传");
    assert.match(JSON.stringify(api.upserts.at(-1)?.payload), /本机新稿/);
  });

  /**
   * 现网 94 张卡都没有 updatedAt，只靠 createdAt 比较。这条保证旧数据无需迁移。
   */
  test("review-card without updatedAt falls back to createdAt", async () => {
    const memory = createMemoryStores();
    memory.cards.set("c1", {
      id: "c1",
      subjectId: "anatomy",
      sourceLabel: "组织学",
      originalText: "被覆上皮",
      cardType: "excerpt",
      front: "本机旧稿",
      back: "本机旧答案",
      status: "ready",
      createdAt: 1,
    });
    const api = createMemorySyncClient();
    await api.upsert({
      kind: "review-card",
      client_id: "c1",
      deleted: false,
      payload: {
        id: "c1",
        subjectId: "anatomy",
        sourceLabel: "组织学",
        originalText: "被覆上皮",
        cardType: "excerpt",
        front: "Platform 新稿",
        back: "Platform 新答案",
        status: "ready",
        createdAt: 1,
        updatedAt: 90,
      },
    });
    const before = api.upserts.length;

    __setCloudSyncStoresForTests(memory.stores);
    __setSyncClientForTests(api);
    enqueueUpsert("review-card", "c1");
    await flushCloudSyncForTests();

    assert.equal(api.upserts.length, before);
    assert.equal(memory.cards.get("c1")?.front, "Platform 新稿");
  });
});
