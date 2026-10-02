import assert from "node:assert/strict";
import { test } from "node:test";
import { activateStorageOwner } from "@/lib/storage/ownerScope";
import { applyCloudSessionWindow, useChatHistory } from "./chatHistory.ts";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import type { ChatMessage } from "@/lib/types/chat";

test("one hundred cloud pages keep metadata but evict actual message/window keys", () => {
  activateStorageOwner("cloud-window-fixture");
  useChatHistory.setState({ sessionsMeta: [], messagesById: {}, sessionWindowById: {}, activeSessionId: "cloud-0", loadedSessionIds: [], pinnedSessionIds: [], sessionLoadState: {}, _hasHydrated: true });
  try {
    const metas: SessionMeta[] = [];
    for (let index = 0; index < 100; index++) {
      const id = `cloud-${index}`;
      const meta: SessionMeta = { id, title: id, createdAt: index, updatedAt: index, messageCount: 2, artifactIds: [] };
      const messages: ChatMessage[] = [
        { id: `${id}-user`, role: "user", parts: [{ type: "text", text: "question" }], timestamp: index },
        { id: `${id}-answer`, role: "assistant", parts: [{ type: "text", text: "answer" }], timestamp: index + 1 },
      ];
      metas.push(meta);
      applyCloudSessionWindow(meta, messages, [...metas]);
    }
    const state = useChatHistory.getState();
    const residents = Object.keys(state.messagesById);
    assert.equal(state.sessionsMeta.length, 100);
    assert.ok(residents.length <= 5, `resident=${residents.length}`);
    assert.ok(residents.includes("cloud-0"));
    assert.ok(residents.includes("cloud-99"));
    assert.deepEqual(Object.keys(state.sessionWindowById).sort(), residents.sort());
    assert.deepEqual([...state.loadedSessionIds].sort(), residents.sort());
  } finally {
    activateStorageOwner(null);
    useChatHistory.setState({ sessionsMeta: [], messagesById: {}, sessionWindowById: {}, activeSessionId: null, loadedSessionIds: [], pinnedSessionIds: [], sessionLoadState: {}, _hasHydrated: false });
  }
});
