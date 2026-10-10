import assert from "node:assert/strict";
import { test } from "node:test";
import { canSendNow, type ChatSendGate } from "./canSendNow.ts";

function gate(partial: Partial<ChatSendGate> = {}): ChatSendGate {
  return {
    _hasHydrated: true,
    activeSessionId: null,
    messagesById: {},
    sessionLoadState: {},
    ...partial,
  };
}

test("canSendNow：未水合拒绝发送", () => {
  assert.equal(canSendNow(gate({ _hasHydrated: false })), false);
});

test("canSendNow：已水合且无会话可以发送", () => {
  assert.equal(canSendNow(gate()), true);
});

test("canSendNow：会话已点名但消息未加载则拒绝", () => {
  assert.equal(
    canSendNow(
      gate({
        activeSessionId: "s1",
        sessionLoadState: { s1: "loading" },
      }),
    ),
    false,
  );
});

test("canSendNow：会话已 loaded 即使 messagesById 暂缺也放行", () => {
  assert.equal(
    canSendNow(
      gate({
        activeSessionId: "s1",
        sessionLoadState: { s1: "loaded" },
      }),
    ),
    true,
  );
});

test("canSendNow：浮窗 ovSessionId 优先于主会话", () => {
  assert.equal(
    canSendNow(
      gate({
        activeSessionId: "main",
        messagesById: { main: [{}] },
        sessionLoadState: { float: "loading" },
      }),
      "float",
    ),
    false,
  );
  assert.equal(
    canSendNow(
      gate({
        activeSessionId: "main",
        messagesById: { float: [{}] },
      }),
      "float",
    ),
    true,
  );
});
