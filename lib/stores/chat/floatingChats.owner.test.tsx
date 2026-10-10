import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateStorageOwner, getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { useStore } from "@/lib/stores/ui";

const history = vi.hoisted(() => ({
  sessionsMeta: [] as Array<{ id: string; title: string }>,
  createSession: vi.fn(() => "synthetic-session"),
  updateSessionTitle: vi.fn(),
}));
const manager = vi.hoisted(() => ({
  openWindow: vi.fn(() => "window"),
  restoreWindow: vi.fn(),
  closeWindow: vi.fn(),
  updateWindow: vi.fn(),
}));

vi.mock("@/lib/stores/chat/chatHistory", () => ({ useChatHistory: { getState: () => history } }));
vi.mock("@/lib/stores/workspace/windowManager", () => ({ useWindowManager: { getState: () => manager } }));

import { useFloatingChats } from "@/lib/stores/chat/floatingChats";

describe("floating chat owner boundaries", () => {
  let ownerBeforeTest: string | null = null;

  beforeEach(() => {
    ownerBeforeTest = getStorageOwner();
    activateStorageOwner(null);
    history.sessionsMeta = [];
    history.createSession.mockClear();
    history.updateSessionTitle.mockClear();
    manager.openWindow.mockClear();
    manager.restoreWindow.mockClear();
    useFloatingChats.setState({ windows: [] });
    useStore.setState({ loginOverlayOpen: false });
  });

  afterEach(() => {
    activateStorageOwner(ownerBeforeTest);
    useFloatingChats.setState({ windows: [] });
    useStore.setState({ loginOverlayOpen: false });
  });

  it.each(["selection", "blank"] as const)("guest %s opener asks for login without creating metadata or a window", (kind) => {
    const result = kind === "selection"
      ? useFloatingChats.getState().openWindow({ anchor: { x: 20, y: 30 }, seedMode: "ask", seedText: "synthetic selection" })
      : useFloatingChats.getState().openBlankWindow();

    expect(result).toBeNull();
    expect(useStore.getState().loginOverlayOpen).toBe(true);
    expect(history.createSession).not.toHaveBeenCalled();
    expect(history.sessionsMeta).toEqual([]);
    expect(useFloatingChats.getState().windows).toEqual([]);
    expect(manager.openWindow).not.toHaveBeenCalled();
  });

  it("guest restore asks for login and leaves the requested session and window list untouched", () => {
    history.sessionsMeta = [{ id: "owned-session", title: "Synthetic owned session" }];

    useFloatingChats.getState().restoreWindow("owned-session");

    expect(useStore.getState().loginOverlayOpen).toBe(true);
    expect(history.createSession).not.toHaveBeenCalled();
    expect(useFloatingChats.getState().windows).toEqual([]);
    expect(manager.openWindow).not.toHaveBeenCalled();
    expect(manager.restoreWindow).not.toHaveBeenCalled();
  });

  it("signed-in creation and restoration stamp every window with the live owner epoch", () => {
    activateStorageOwner("synthetic-owner");
    const expectedEpoch = getOwnerEpoch();
    const chats = useFloatingChats.getState();

    expect(chats.openWindow({ anchor: { x: 20, y: 30 }, seedMode: "ask", seedText: "synthetic selection" })).toBeTruthy();
    expect(chats.openBlankWindow()).toBeTruthy();
    chats.restoreWindow("existing-session");

    expect(history.createSession).toHaveBeenCalledTimes(2);
    expect(useFloatingChats.getState().windows).toHaveLength(3);
    expect(useFloatingChats.getState().windows.every((win) => win.ownerId === "synthetic-owner" && win.ownerEpoch === expectedEpoch)).toBe(true);
    expect(manager.openWindow).toHaveBeenCalledTimes(3);
  });
});
