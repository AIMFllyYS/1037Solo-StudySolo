import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "@/lib/types/chat";
import { MAX_CHAT_SESSION_BYTES } from "@/lib/sync/types.ts";
import {
  attachmentStoredBytes,
  measureSessionStorageUsage,
  measureSessionStorageUsageAsync,
} from "./sessionStorageUsage.ts";

function msg(id: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
    timestamp: 1,
    ...extra,
  };
}

test("measureSessionStorageUsage keeps conversation text and local attachments separate", () => {
  const usage = measureSessionStorageUsage("s1", [
    msg("m1", {
      attachments: [
        { id: "blob-1", type: "image", mimeType: "image/png", name: "a.png", size: 40_000 },
        { type: "document", mimeType: "text/plain", name: "note.txt", text: "abc", size: 3, characterCount: 3 },
      ],
    }),
  ]);
  assert.equal(usage.attachmentCount, 2);
  assert.equal(usage.attachmentBytes, 40_003);
  assert.ok(usage.conversationBytes > 0);
  assert.ok(usage.conversationBytes < 40_000);
});

test("attachmentStoredBytes prefers recorded size and falls back to inline payload", () => {
  assert.equal(attachmentStoredBytes({ id: "b", type: "image", mimeType: "image/png", size: 12 }), 12);
  assert.ok(attachmentStoredBytes({ type: "image", mimeType: "image/png", base64: "data:image/png;base64,abc" }) > 0);
});

test("conversation fill is against the 4MB session cap, not the current local total", () => {
  const usage = measureSessionStorageUsage("s1", [msg("m1")]);
  assert.equal(usage.conversationLimitBytes, MAX_CHAT_SESSION_BYTES);
  assert.ok(usage.conversationBytes / usage.conversationLimitBytes < 0.05);
});

test("measureSessionStorageUsageAsync reads blob bytes when size is missing", async () => {
  const usage = await measureSessionStorageUsageAsync(
    "s1",
    [msg("m1", { attachments: [{ id: "blob-1", type: "image", mimeType: "image/png", name: "a.png" }] })],
    undefined,
    async (id) => (id === "blob-1" ? "data:image/png;base64,YWJjZGVmZ2hpams=" : null),
  );
  assert.equal(usage.attachmentCount, 1);
  assert.ok(usage.attachmentBytes > 20);
});
