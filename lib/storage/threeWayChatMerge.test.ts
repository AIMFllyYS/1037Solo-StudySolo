import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "@/lib/types/chat";
import { mergeChatSnapshots } from "./threeWayChatMerge.ts";

const m = (id: string, text = id): ChatMessage => ({ id, role: "user", parts: [{ type: "text", text }], timestamp: 1 });

test("three-way merge retains remote append while respecting a local compact replacement", () => {
  const base = [m("old"), m("recent")];
  const local = [m("summary", "compacted old"), m("recent")];
  const remote = [...base, m("other-tab")];
  assert.deepEqual(mergeChatSnapshots(base, local, remote)?.map((row) => row.id), ["summary", "recent", "other-tab"]);
});

test("three-way merge keeps independent same-session edits and refuses ambiguous divergent edits", () => {
  const base = [m("a"), m("b")];
  const local = [m("a", "local edit"), m("b")];
  const remote = [m("a"), m("b", "remote edit"), m("c")];
  const merged = mergeChatSnapshots(base, local, remote);
  assert.deepEqual(merged?.map((row) => (row.parts[0] as { text: string }).text), ["local edit", "remote edit", "c"]);
  assert.equal(mergeChatSnapshots(base, local, [m("a", "different remote edit"), m("b")]), null);
  assert.equal(mergeChatSnapshots(base, [m("b")], [m("a", "remote changed"), m("b")]), null);
});
