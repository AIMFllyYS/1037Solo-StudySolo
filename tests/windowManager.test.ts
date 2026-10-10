import assert from "node:assert/strict";
import { test } from "node:test";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

function resetWindowManager() {
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
}

test("useWindowManager opens windows with z order and per-type badges", () => {
  resetWindowManager();

  useWindowManager.getState().openWindow({
    id: "chat-1",
    type: "floating-chat",
    title: "AI 解释",
    pos: { x: 10, y: 20 },
    size: { width: 420, height: 480 },
    data: { sessionId: "s1" },
  });
  useWindowManager.getState().openWindow({
    id: "chat-2",
    type: "floating-chat",
    title: "AI 举例",
    pos: { x: 40, y: 60 },
    size: { width: 420, height: 480 },
    data: { sessionId: "s2" },
  });
  useWindowManager.getState().openWindow({
    id: "record-1",
    type: "record-preview",
    title: "记录到复习板",
    pos: { x: 80, y: 100 },
    size: { width: 420, height: 520 },
    data: { cardId: "card-1" },
  });

  const windows = useWindowManager.getState().windows;
  assert.deepEqual(
    windows.map((w) => ({ id: w.id, z: w.z, badge: w.badge })),
    [
      { id: "chat-1", z: 5001, badge: 1 },
      { id: "chat-2", z: 5002, badge: 2 },
      { id: "record-1", z: 5003, badge: 1 },
    ],
  );
});

test("useWindowManager minimizes, restores and brings windows to front", () => {
  resetWindowManager();

  useWindowManager.getState().openWindow({
    id: "chat-1",
    type: "floating-chat",
    title: "AI 解释",
    pos: { x: 0, y: 0 },
    size: { width: 420, height: 480 },
    data: { sessionId: "s1" },
  });
  useWindowManager.getState().minimizeWindow("chat-1");
  assert.equal(useWindowManager.getState().windows[0]?.minimized, true);
  assert.equal(useWindowManager.getState().windows[0]?.z, 5001);

  useWindowManager.getState().restoreWindow("chat-1");
  assert.equal(useWindowManager.getState().windows[0]?.minimized, false);
  assert.equal(useWindowManager.getState().windows[0]?.z, 5002);
});

test("useWindowManager fullscreen auto-minimizes other fullscreen windows", () => {
  resetWindowManager();

  for (const id of ["chat-1", "record-1"]) {
    useWindowManager.getState().openWindow({
      id,
      type: id.startsWith("chat") ? "floating-chat" : "record-preview",
      title: id,
      pos: { x: 0, y: 0 },
      size: { width: 420, height: 480 },
      data: id.startsWith("chat") ? { sessionId: "s1" } : { cardId: "card-1" },
    });
  }

  useWindowManager.getState().setFullscreen("chat-1", true);
  useWindowManager.getState().setFullscreen("record-1", true);

  const byId = Object.fromEntries(useWindowManager.getState().windows.map((w) => [w.id, w]));
  assert.equal(byId["chat-1"].fullscreen, false);
  assert.equal(byId["chat-1"].minimized, true);
  assert.equal(byId["record-1"].fullscreen, true);
  assert.equal(byId["record-1"].minimized, false);
});
