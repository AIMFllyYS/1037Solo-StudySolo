import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { partitionTaskbarWindows } from "@/components/window/WindowTaskbar";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("citation and document viewers are mounted in the global app shell window layer", () => {
  const chatPanel = readWorkspaceFile("components/chat/ChatPanel.tsx");
  const appShell = readWorkspaceFile("components/layout/AppShell.tsx");
  const layers = readWorkspaceFile("components/window/DeferredWindowLayers.tsx");

  assert.doesNotMatch(chatPanel, /NoteCitationViewer/, "Citation windows must outlive the AI tab.");
  assert.doesNotMatch(chatPanel, /SourcePreviewViewer/, "Source preview windows must outlive the AI tab.");
  assert.doesNotMatch(chatPanel, /UserNoteLayer/, "Personal note windows must outlive the AI tab.");
  assert.doesNotMatch(chatPanel, /FlashcardCiteWindow/, "Flashcard cite windows must outlive the AI tab.");
  assert.match(appShell, /DeferredWindowLayers/);
  assert.match(appShell, /<DeferredWindowLayers\s*\/>/);
  assert.match(layers, /components\/chat\/sources\/NoteCitationViewer/);
  assert.match(layers, /<NoteCitationViewer\s*\/>/);
  assert.match(layers, /components\/chat\/sources\/SourceTraceViewer/);
  assert.match(layers, /<SourceTraceViewer\s*\/>/);
  assert.match(layers, /components\/chat\/sources\/SourcePreviewViewer/);
  assert.match(layers, /<SourcePreviewViewer\s*\/>/);
  assert.match(layers, /components\/chat\/products\/DocumentViewer/);
  assert.match(layers, /<DocumentViewerLayer\s*\/>/);
  assert.match(layers, /components\/notes\/UserNoteLayer/);
  assert.match(layers, /<UserNoteLayer\s*\/>/);
  assert.match(layers, /components\/notes\/FlashcardCiteWindow/);
  assert.match(layers, /<FlashcardCiteWindow\s*\/>/);
  assert.match(layers, /components\/agent\/AgentProductPickerWindow/);
  assert.match(layers, /<AgentProductPickerWindow\s*\/>/);
  assert.match(layers, /components\/memory\/MemoryInboxLayer/);
  assert.match(layers, /<MemoryInboxLayer\s*\/>/);
  assert.match(layers, /components\/quiz\/QuizExplainLayer/);
  assert.match(layers, /<QuizExplainLayer\s*\/>/);
  assert.doesNotMatch(appShell, /DevNoteHarness/);
  assert.doesNotMatch(layers, /DevNoteHarness/);
  assert.match(appShell, /components\/shared\/ToastHost/);
  assert.match(appShell, /<ToastHost\s*\/>/);
});

test("artifact viewer is mounted in the global app shell window layer", () => {
  const chatPanel = readWorkspaceFile("components/chat/ChatPanel.tsx");
  const appShell = readWorkspaceFile("components/layout/AppShell.tsx");
  const layers = readWorkspaceFile("components/window/DeferredWindowLayers.tsx");

  assert.doesNotMatch(
    chatPanel,
    /ArtifactViewer/,
    "ChatPanel is tab-scoped; artifact windows must not unmount when the AI tab unmounts.",
  );
  assert.match(appShell, /DeferredWindowLayers/);
  assert.match(
    layers,
    /components\/chat\/products\/ArtifactViewer/,
    "Deferred window layers should dynamically import the artifact viewer as a global floating window.",
  );
  assert.match(
    layers,
    /<ArtifactViewer\s*\/>/,
    "Deferred window layers should render the artifact viewer alongside the other global window layers.",
  );
});

function windowFixture(id: string): ManagedWindow {
  return {
    id,
    type: "floating-chat",
    title: id,
    pos: { x: 0, y: 0 },
    size: { width: 420, height: 480 },
    z: 5001,
    fullscreen: false,
    minimized: false,
    data: { sessionId: id },
  };
}

test("taskbar overflow does not show fixed fallback icons before width is available", () => {
  const windows = ["one", "two", "three"].map(windowFixture);
  const { visible, overflow } = partitionTaskbarWindows(windows, 0);

  assert.equal(visible.length, 0);
  assert.deepEqual(overflow.map((win) => win.id), ["one", "two", "three"]);
});

test("taskbar overflow uses the full measured host width before collapsing", () => {
  const windows = ["one", "two", "three", "four", "five", "six"].map(windowFixture);
  const { visible, overflow } = partitionTaskbarWindows(windows, 128);

  assert.deepEqual(visible.map((win) => win.id), ["one", "two", "three"]);
  assert.deepEqual(overflow.map((win) => win.id), ["four", "five", "six"]);
});

test("taskbar overflow reserves room for the overflow menu when icons exceed capacity", () => {
  const windows = ["one", "two", "three", "four"].map(windowFixture);
  const { visible, overflow } = partitionTaskbarWindows(windows, 96);

  assert.deepEqual(visible.map((win) => win.id), ["one", "two"]);
  assert.deepEqual(overflow.map((win) => win.id), ["three", "four"]);
});

test("taskbar window tooltip uses one responsive custom label instead of native title", () => {
  const taskbar = readWorkspaceFile("components/window/WindowTaskbar.tsx");

  assert.doesNotMatch(
    taskbar,
    /title=\{win\.title\}/,
    "Native title and custom tooltip render as two competing hover labels.",
  );
  assert.match(taskbar, /aria-label=\{win\.title\}/);
  assert.match(taskbar, /whitespace-nowrap/);
  assert.match(taskbar, /max-w-\[min\(70vw,28rem\)\]/);
});

test("taskbar window tooltip is portaled above tab and toolbar stacking contexts", () => {
  const taskbar = readWorkspaceFile("components/window/WindowTaskbar.tsx");

  assert.match(
    taskbar,
    /createPortal/,
    "Window tooltip should render through a body portal instead of staying inside the taskbar button.",
  );
  assert.match(taskbar, /position:\s*"fixed"/);
  assert.match(taskbar, /z-\[11000\]/);
  assert.doesNotMatch(
    taskbar,
    /absolute right-0 top-8 z-\[7000\]/,
    "Inline absolute tooltip can be trapped behind the content tab bar stacking context.",
  );
});
