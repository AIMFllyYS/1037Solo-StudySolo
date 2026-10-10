import { create } from "zustand";
import { getStorageOwner, onStorageOwnerChange, ownedStorageKey, registerOwnerHydrator } from "@/lib/storage/ownerScope";

// UI preferences only. Keep the legacy unowned key untouched: its IDs cannot
// safely be assigned to whichever Account signs in first.
const STORAGE_KEY = "studysolo-agent-closed-tabs";
const MAX_CLOSED = 500;
type AgentTabsState = {
  ownerId: string | null;
  closedIds: string[];
  closeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  reopenTab: (id: string) => void;
};
function persistClosedIds(closedIds: string[]) {
  const key = ownedStorageKey(STORAGE_KEY);
  if (!key || typeof localStorage === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify({ closedIds })); } catch { /* UI remains usable when storage is full. */ }
}
export const useAgentTabs = create<AgentTabsState>((set, get) => ({
  ownerId: null,
  closedIds: [],
  closeTab: (id) => get().closeTabs([id]),
  closeTabs: (ids) => {
    if (!getStorageOwner() || get().ownerId !== getStorageOwner()) return;
    const closedIds = [...new Set([...ids, ...get().closedIds])].slice(0, MAX_CLOSED);
    set({ closedIds });
    persistClosedIds(closedIds);
  },
  reopenTab: (id) => {
    if (!getStorageOwner() || get().ownerId !== getStorageOwner() || !get().closedIds.includes(id)) return;
    const closedIds = get().closedIds.filter((item) => item !== id);
    set({ closedIds });
    persistClosedIds(closedIds);
  },
}));
export function hydrateAgentTabs(): void {
  const ownerId = getStorageOwner();
  let closedIds: string[] = [];
  const key = ownedStorageKey(STORAGE_KEY);
  if (key && typeof localStorage !== "undefined") {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null") as { closedIds?: unknown } | null;
      if (Array.isArray(value?.closedIds)) closedIds = [...new Set(value.closedIds.filter((id): id is string => typeof id === "string"))].slice(0, MAX_CLOSED);
    } catch { /* Corrupt UI preferences never affect conversation history. */ }
  }
  useAgentTabs.setState({ ownerId, closedIds });
}
onStorageOwnerChange(hydrateAgentTabs);
registerOwnerHydrator(async () => { hydrateAgentTabs(); });
