import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { clear, createStore } from "idb-keyval";
import type { ChatMessage } from "@/lib/types/chat";
import { collectSessionSourceRounds } from "@/lib/chat/sources/traceSources";
import { estimateTokens } from "@/lib/context/estimateTokens";
import { getMessageText } from "@/lib/chat/messages/messageParts";
import { activateStorageOwner } from "./ownerScope.ts";
import { __resetSessionV3ForTests, saveSessionMessagesCommitted } from "./chatStorage.ts";
import { __resetIdbStoragePendingForTests } from "./idbStorage.ts";
import { loadSessionSummary } from "./sessionSummary.ts";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";

function message(id: string, role: "user" | "assistant", text: string, source?: string): ChatMessage {
  const parts: unknown[] = [{ type: "text", text }];
  if (source) parts.push({ type: "tool-webSearch", toolCallId: id, state: "output-available", input: { query: text }, output: { sources: [{ title: id, url: source, snippet: "snippet" }] } });
  return { id, role, parts, timestamp: 1 } as ChatMessage;
}

test("summary builds by bounded turns, matches source/token oracle, invalidates on revision and owner", async () => {
  await clear(createStore("gailvlun-db", "keyval"));
  (globalThis as { window?: unknown }).window = { addEventListener() {} };
  (globalThis as { document?: unknown }).document = { addEventListener() {}, visibilityState: "visible" };
  const storage = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(), key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  activateStorageOwner("summary-owner-A");
  try {
    const messages: ChatMessage[] = [];
    for (let turn = 0; turn < 20; turn++) {
      messages.push(message(`u${turn}`, "user", `第 ${turn} 轮`));
      messages.push(message(`a${turn}`, "assistant", `回答 ${turn}`, turn === 1 || turn === 17 ? "https://example.edu/shared" : undefined));
    }
    messages[7].parts.push({ type: "tool-futureSource", toolCallId: "future-1", state: "output-available", input: {}, output: { citation: "retained" } } as unknown as ChatMessage["parts"][number]);
    await saveSessionMessagesCommitted("summary-fixture", messages);
    const first = await loadSessionSummary("summary-fixture");
    assert.ok(first);
    assert.equal(first.sourceRefs.length, collectSessionSourceRounds(messages).length);
    assert.equal(first.sourceRefs.length, 1, "cross-chunk duplicate source belongs to its first round");
    assert.equal(first.tokenEstimate, messages.reduce((total, row) => total + estimateTokens(getMessageText(row)), 0));
    assert.equal(first.turnTokenEstimates.length, 20);
    assert.ok(first.estimatedBytes > 0);
    assert.deepEqual(first.unknownToolRefs, [{ messageId: "a3", messageIndex: 7, turn: 3, partIndex: 1, type: "tool-futureSource" }]);

    const next = [...messages, message("u20", "user", "新增问题"), message("a20", "assistant", "新增回答", "https://example.edu/new")];
    await saveSessionMessagesCommitted("summary-fixture", next);
    const revised = await loadSessionSummary("summary-fixture");
    assert.ok(revised);
    assert.ok(revised.sourceRevision > first.sourceRevision);
    assert.equal(revised.sourceRefs.length, 2);
    assert.ok(revised.tokenEstimate > first.tokenEstimate);

    const residentBefore = Object.keys(useChatHistory.getState().messagesById);
    const thousand: ChatMessage[] = [];
    for (let turn = 0; turn < 1000; turn++) {
      thousand.push(message(`large-u${turn}`, "user", `问题 ${turn}`));
      thousand.push(message(`large-a${turn}`, "assistant", `回答 ${turn}`));
    }
    await saveSessionMessagesCommitted("large-summary-fixture", thousand);
    const largeSummary = await loadSessionSummary("large-summary-fixture");
    assert.equal(largeSummary?.turnTokenEstimates.length, 1000);
    assert.deepEqual(Object.keys(useChatHistory.getState().messagesById), residentBefore, "source/token panels must not hydrate chatHistory body slots");

    activateStorageOwner("summary-owner-B");
    assert.equal(await loadSessionSummary("summary-fixture"), null);
  } finally {
    __resetSessionV3ForTests();
    __resetIdbStoragePendingForTests();
    activateStorageOwner(null);
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
