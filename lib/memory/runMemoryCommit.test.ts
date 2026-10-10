import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMemoryCommitSideTurn } from "./runMemoryCommit.ts";
import { buildFlashcardCommitPrompt } from "./flashcardCommitPrompt.ts";
import { buildChatRequestBody } from "@/lib/chat/request/buildChatRequestBody";
import type { ChatMessage } from "@/lib/types/chat";

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, parts: [{ type: "text", text }], timestamp: 1 };
}

test("buildMemoryCommitSideTurn 闪卡复用历史、末尾追加撰写指令、不要求改主 thread", () => {
  const history = [
    message("u1", "user", "什么是渗透压？"),
    message("a1", "assistant", "渗透压是溶液的一种依数性。"),
  ];
  const turn = buildMemoryCommitSideTurn({
    historyMessages: history,
    memoryCommit: "flashcards",
    mode: "cloze",
  });

  assert.equal(turn.persistToThread, false);
  assert.equal(turn.memoryCommit, "flashcards");
  assert.match(turn.commitPrompt, /commitFlashcards/);
  assert.match(turn.commitPrompt, /cloze/);
  assert.match(turn.commitPrompt, /按约定模式/);
  assert.equal(turn.commitPrompt, buildFlashcardCommitPrompt("cloze"));

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

test("buildMemoryCommitSideTurn 闪卡缺省模式仍带 memoryCommit=flashcards", () => {
  const turn = buildMemoryCommitSideTurn({ historyMessages: [], memoryCommit: "flashcards" });
  assert.equal(turn.memoryCommit, "flashcards");
  assert.match(turn.commitPrompt, /cloze/);
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
  assert.equal(body.memoryCommit, "flashcards");
});
