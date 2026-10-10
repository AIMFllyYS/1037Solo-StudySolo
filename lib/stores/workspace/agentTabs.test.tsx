import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activateStorageOwner, ownedStorageKeyFor } from "@/lib/storage/ownerScope";
import { hydrateAgentTabs, useAgentTabs } from "./agentTabs";

beforeEach(() => { activateStorageOwner(null); localStorage.clear(); });
afterEach(() => activateStorageOwner(null));
describe("Agent conversation tab UI persistence", () => {
  it("restores each owner independently and leaves unowned legacy preferences untouched", () => {
    const legacy = JSON.stringify({ state: { closedIds: ["unowned"] }, version: 1 });
    localStorage.setItem("studysolo-agent-closed-tabs", legacy);
    activateStorageOwner("owner-a");
    expect(useAgentTabs.getState().closedIds).toEqual([]);
    useAgentTabs.getState().closeTabs(["a1", "a2"]);
    hydrateAgentTabs();
    expect(useAgentTabs.getState().closedIds).toEqual(["a1", "a2"]);
    activateStorageOwner("owner-b");
    expect(useAgentTabs.getState().closedIds).toEqual([]);
    useAgentTabs.getState().closeTab("b1");
    activateStorageOwner("owner-a");
    expect(useAgentTabs.getState().closedIds).toEqual(["a1", "a2"]);
    useAgentTabs.getState().reopenTab("a1");
    hydrateAgentTabs();
    expect(useAgentTabs.getState().closedIds).toEqual(["a2"]);
    expect(localStorage.getItem("studysolo-agent-closed-tabs")).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(ownedStorageKeyFor("owner-b", "studysolo-agent-closed-tabs"))!)).toEqual({ closedIds: ["b1"] });
  });
  it("anonymous actions do not persist or inherit an owner's tab state", () => {
    activateStorageOwner("owner-a");
    useAgentTabs.getState().closeTab("a1");
    activateStorageOwner(null);
    useAgentTabs.getState().closeTab("anonymous");
    expect(useAgentTabs.getState().closedIds).toEqual([]);
  });
});
