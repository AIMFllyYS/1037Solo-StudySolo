import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { getActiveManagedWindow, closeManagedWindow } from "@/lib/keyboard/windowActions";

beforeEach(() => {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

test("openWindow sets activeWindowId", () => {
  useWindowManager.getState().openWindow({
    id: "win-1",
    type: "billing-dashboard",
    title: "计费",
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    data: {},
  });
  assert.equal(useWindowManager.getState().activeWindowId, "win-1");
});

test("bringToFront updates activeWindowId to top window", () => {
  useWindowManager.getState().openWindow({
    id: "win-1",
    type: "billing-dashboard",
    title: "A",
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    data: {},
  });
  useWindowManager.getState().openWindow({
    id: "win-2",
    type: "billing-dashboard",
    title: "B",
    pos: { x: 10, y: 10 },
    size: { width: 400, height: 300 },
    data: {},
  });
  useWindowManager.getState().bringToFront("win-1");
  assert.equal(useWindowManager.getState().activeWindowId, "win-1");
});

test("getActiveManagedWindow returns highest z visible window", () => {
  useWindowManager.getState().openWindow({
    id: "win-1",
    type: "billing-dashboard",
    title: "A",
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    data: {},
  });
  useWindowManager.getState().openWindow({
    id: "win-2",
    type: "billing-dashboard",
    title: "B",
    pos: { x: 10, y: 10 },
    size: { width: 400, height: 300 },
    data: {},
  });
  const active = getActiveManagedWindow();
  assert.equal(active?.id, "win-2");
});

test("closeManagedWindow removes source and attachment windows from the manager", () => {
  useWindowManager.getState().openWindow({
    id: "attachment-preview:pdf",
    type: "attachment-preview",
    title: "a.pdf",
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    data: { name: "a.pdf", mimeType: "application/pdf", kind: "pdf", content: "blob:n/a" },
  });
  const win = useWindowManager.getState().windows[0];
  assert.ok(win);
  closeManagedWindow(win!);
  assert.equal(useWindowManager.getState().windows.length, 0);
});

test("closeWindow falls back activeWindowId to next top window", () => {
  useWindowManager.getState().openWindow({
    id: "win-1",
    type: "billing-dashboard",
    title: "A",
    pos: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    data: {},
  });
  useWindowManager.getState().openWindow({
    id: "win-2",
    type: "billing-dashboard",
    title: "B",
    pos: { x: 10, y: 10 },
    size: { width: 400, height: 300 },
    data: {},
  });
  useWindowManager.getState().closeWindow("win-2");
  assert.equal(useWindowManager.getState().activeWindowId, "win-1");
});
