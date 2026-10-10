import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { windowZh } from "../lib/i18n/messages/parts/zh/window";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function standaloneRule(css: string, selector: string): string {
  const re = /([^{}]+)\{([^}]+)\}/g;
  const hits: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    if (match[1].trim() === selector) hits.push(match[2]);
  }
  assert.equal(hits.length, 1, `expected one standalone ${selector} rule, got ${hits.length}`);
  return hits[0];
}

test("tool action text uses the existing toolbar button, without underline", () => {
  const tools = readWorkspaceFile("app/styles/chat-tools.css");
  const prose = readWorkspaceFile("app/styles/prose.css");
  const flashcards = readWorkspaceFile("components/notes/FlashcardCiteWindow.tsx");
  const cloud = readWorkspaceFile("components/memory/MemoryProposalCloud.tsx");
  const noteEditor = readWorkspaceFile("components/notes/UserNoteEditorWindow.tsx");
  const recordPreview = readWorkspaceFile("components/review/RecordPreviewWindow.tsx");
  const chrome = readWorkspaceFile("components/window/WindowChrome.tsx");

  const linkRule = standaloneRule(tools, ".user-note-toolbar-link");
  assert.match(linkRule, /text-decoration:\s*none/);
  assert.doesNotMatch(linkRule, /underline/);

  assert.match(standaloneRule(prose, ".prose-notes a"), /text-decoration:\s*underline/);
  assert.match(standaloneRule(prose, ".chat-prose a"), /text-decoration:\s*underline/);

  assert.equal((flashcards.match(/className="user-note-toolbar-link"/g) || []).length, 4);
  // 文案已搬进 window 词典分片：这里同时钉住「组件引用 key」与「zh 分片里仍是原句」，
  // 两边都断言，既不丢文案，也不允许组件绕过词典写死中文。
  assert.match(flashcards, /t\("window\.note\.flashcard\.downloadOne"\)/);
  assert.equal(windowZh.note.flashcard.downloadOne, "下载这张");
  assert.match(flashcards, /t\("window\.note\.flashcard\.downloadCsv"\)/);
  assert.equal(windowZh.note.flashcard.downloadCsv, "下载 CSV");
  assert.match(flashcards, /t\("window\.note\.flashcard\.openBoard"\)/);
  assert.equal(windowZh.note.flashcard.openBoard, "打开复习板");
  assert.match(flashcards, /t\("window\.note\.flashcard\.edit"\)/);
  assert.equal(windowZh.note.flashcard.edit, "编辑");
  assert.match(cloud, /className="user-note-toolbar-link"[\s\S]{0,180}t\("window\.memory\.dismiss"\)/);
  assert.equal(windowZh.memory.dismiss, "不用了");

  assert.doesNotMatch(noteEditor, /user-note-toolbar-link/);
  assert.match(noteEditor, /user-note-chrome-btn/);
  assert.doesNotMatch(recordPreview, /textDecoration:\s*["']underline["']/);
  assert.doesNotMatch(recordPreview, /user-note-toolbar-link/);
  assert.doesNotMatch(chrome, /text-decoration:\s*underline|underline/);
});
