import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { openCitationSource } from "./openCitation.ts";
import { useNoteCitations } from "@/lib/stores/learning/noteCitations";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

afterEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useNoteCitations.getState().closeViewer();
});

test("openCitationSource：网页打开预览窗", () => {
  openCitationSource({
    index: 1,
    kind: "web",
    title: "课程",
    url: "https://example.edu/a",
    snippet: "摘要",
  });
  const windows = useWindowManager.getState().windows.filter((win) => win.type === "source-preview");
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.title, "课程");
});

test("openCitationSource：教材路径打开笔记引用窗", () => {
  openCitationSource({
    index: 2,
    kind: "note",
    title: "被覆上皮",
    path: "histology/textbook/ch02-1",
    snippet: "单层扁平",
  });
  assert.equal(useNoteCitations.getState().activePath, "histology/textbook/ch02-1");
  assert.ok(useWindowManager.getState().windows.some((win) => win.type === "note-citation-viewer"));
});
