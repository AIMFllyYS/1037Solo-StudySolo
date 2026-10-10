import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownLinks } from "./markdown-links.mjs";

test("Markdown links exclude inline and fenced code but keep real broken destinations", () => {
  const markdown = ["`[example](images/...)`", "```md", "[example](not-a-file.md)", "```", "[real](missing.md)"].join("\n");
  assert.deepEqual(markdownLinks(markdown), [{ target: "missing.md", line: 5, kind: "link" }]);
});

test("Markdown references and images resolve definitions and keep usage line numbers", () => {
  const markdown = "[guide][DOC]\n![image](<folder with spaces/pic.png>)\n\n[doc]: ./guide.md#part\n";
  assert.deepEqual(markdownLinks(markdown), [
    { target: "./guide.md#part", line: 1, kind: "linkReference" },
    { target: "folder with spaces/pic.png", line: 2, kind: "image" },
  ]);
});

test("Markdown escaped parentheses remain part of a real link destination", () => {
  assert.equal(markdownLinks("[guide](folder/chapter\\(1\\).md)")[0].target, "folder/chapter(1).md");
});
