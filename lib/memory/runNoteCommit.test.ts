import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNoteCommitSideTurn } from "./runNoteCommit.ts";
import { NOTE_COMMIT_STYLE } from "./noteCommitPrompt.ts";
import { buildChatRequestBody } from "@/lib/chat/request/buildChatRequestBody";
import type { ChatMessage } from "@/lib/types/chat";

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, parts: [{ type: "text", text }], timestamp: 1 };
}

test("buildNoteCommitSideTurn 复用历史、末尾追加撰写指令、不要求改主 thread", () => {
  const history = [
    message("u1", "user", "什么是渗透压？"),
    message("a1", "assistant", "渗透压是溶液的一种依数性。"),
  ];
  const turn = buildNoteCommitSideTurn({ historyMessages: history, title: "渗透压" });

  assert.equal(turn.persistToThread, false);
  assert.equal(turn.memoryCommit, "note");
  assert.match(turn.commitPrompt, /commitNotes/);
  assert.match(turn.commitPrompt, /渗透压/);
  assert.match(turn.commitPrompt, /有序列表/);
  assert.match(turn.commitPrompt, /短记忆提纲/);
  assert.ok(NOTE_COMMIT_STYLE.includes("有序列表"));

  assert.equal(turn.latestMessages.length, 4);
  assert.equal(turn.latestMessages[0], history[0]);
  assert.equal(turn.latestMessages[1], history[1]);
  assert.equal(turn.latestMessages[2], turn.userMessage);
  assert.equal(turn.latestMessages[3], turn.assistant);
  assert.equal(turn.userMessage.role, "user");
  assert.equal(turn.assistant.role, "assistant");
  assert.notEqual(turn.userMessage.id, "u1");
  assert.equal(history.length, 2);
});

test("buildNoteCommitSideTurn 标题缺省时仍带 memoryCommit=note", () => {
  const turn = buildNoteCommitSideTurn({ historyMessages: [] });
  assert.equal(turn.memoryCommit, "note");
  assert.match(turn.commitPrompt, /课堂要点/);
  assert.equal(turn.latestMessages.length, 2);

  const body = buildChatRequestBody(
    { subjectId: "math", categoryId: "textbook", itemId: "ch1", currentTopic: "极限" },
    {
      customApiGroups: [],
      customBaseUrl: "",
      customApiKey: "",
      customModelId: "",
      defaultImageModelId: null,
      imageModeTextModel: "mimo-v2.5",
      imageModeTextModelFallback: "mimo-v2.5",
      disabledTools: [],
      globalContext: "",
      memoryCommit: turn.memoryCommit,
    },
    {
      effectiveModelId: "mimo-v2.5",
      model: undefined,
      enableThinking: false,
      thinkingEffort: undefined,
      enableSearch: false,
      contextMode: "full",
    },
    { limit: 8000, estimated: 100, softLimitReached: false },
    [],
    "freshman-2",
  );
  assert.equal(body.memoryCommit, "note");
});
