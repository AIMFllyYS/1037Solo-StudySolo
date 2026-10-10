import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLASS_CONTEXT_LIMITS,
  classAgentContextSchema,
  formatClassContextBlock,
  getClassAgentContext,
  setClassAgentContextProvider,
  tailSegments,
} from "./agentContext";
import { collectCitationCatalog } from "@/lib/chat/sources/citationCatalog";

const SESSION = "11111111-1111-4111-8111-111111111111";

test("tailSegments keeps the newest segments within the char budget, oldest first", () => {
  const big = "字".repeat(CLASS_CONTEXT_LIMITS.segmentChars);
  const segments = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, seq: i, text: big }));
  const tail = tailSegments(segments);
  assert.ok(tail.length * CLASS_CONTEXT_LIMITS.segmentChars <= CLASS_CONTEXT_LIMITS.recentTotalChars);
  assert.equal(tail.at(-1)?.id, "s9");
  assert.ok(tail[0].seq < tail.at(-1)!.seq);
});

test("the provider is scoped to the class workbench and survives a throwing getter", () => {
  setClassAgentContextProvider(() => ({ sessionId: SESSION, title: "导数", live: false, outline: [], recent: [] }));
  assert.equal(getClassAgentContext()?.title, "导数");
  setClassAgentContextProvider(() => {
    throw new Error("boom");
  });
  assert.equal(getClassAgentContext(), null);
  setClassAgentContextProvider(null);
  assert.equal(getClassAgentContext(), null);
});

test("the prompt block names the class and tells the model to search before citing", () => {
  const ctx = classAgentContextSchema.parse({ sessionId: SESSION, title: "导数", live: true, outline: ["定义"], recent: [{ id: "a", seq: 1, text: "可导一定连续" }] });
  const block = formatClassContextBlock(ctx);
  assert.match(block, /《导数》/);
  assert.match(block, /searchClassTranscript/);
  assert.match(block, /可导一定连续/);
});

test("transcript hits become citations that jump back to the class segment", () => {
  const catalog = collectCitationCatalog([
    {
      type: "tool-searchClassTranscript",
      toolCallId: "t1",
      state: "output-available",
      input: { query: "可导" },
      output: {
        text: "",
        scope: "current",
        hits: [{ sessionId: SESSION, sessionTitle: "导数", segmentId: "seg-1", text: "可导一定连续", citeIndex: 1 }],
      },
    },
  ] as never);
  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0].classSegment, { sessionId: SESSION, segmentId: "seg-1" });
  assert.equal(catalog[0].index, 1);
});
