import { describe, expect, it } from "vitest";
import { resolveAgentDockCollapsed, type AgentDockSessionState } from "./agentDockSession";

describe("Agent dock session fallback", () => {
  it("a new chat without memory uses the open default", () => {
    expect(resolveAgentDockCollapsed(null, false)).toBe(false);
  });

  it("a new chat keeps an explicit user collapse preference", () => {
    expect(resolveAgentDockCollapsed(null, true)).toBe(true);
  });

  it("a remembered session state takes priority over the user default", () => {
    const saved: AgentDockSessionState = {
      collapsed: true,
      global: false,
      activeWindowId: null,
    };
    expect(resolveAgentDockCollapsed(saved, false)).toBe(true);
    expect(resolveAgentDockCollapsed({ ...saved, collapsed: false }, true)).toBe(false);
  });
});
