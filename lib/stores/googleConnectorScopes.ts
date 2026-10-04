import { create } from "zustand";
import { GOOGLE_SCOPE_OPTIONS } from "@/lib/connectors/google-scopes";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange, ownedStorageKeyFor } from "@/lib/storage/ownerScope";

const KEY = "google-connector-scope-draft-v1";
const defaults = () => GOOGLE_SCOPE_OPTIONS.filter(([, label]) => label === "googleFiles" || label === "googleCalendar").map(([scope]) => scope as string);
const approved = (scopes: readonly string[]) => GOOGLE_SCOPE_OPTIONS.map(([scope]) => scope as string).filter(scope => scopes.includes(scope));
function parseDraft(raw: string | null): string[] | null {
  if (raw === null || raw.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 5 || value.some(scope => typeof scope !== "string" || !GOOGLE_SCOPE_OPTIONS.some(([allowed]) => allowed === scope))) return null;
    return approved(value);
  } catch { return null; }
}
function readDraft(owner: string | null): string[] | null {
  if (!owner || typeof window === "undefined") return null;
  try { return parseDraft(localStorage.getItem(ownedStorageKeyFor(owner, KEY))); } catch { return null; }
}
function persistDraft(owner: string | null, scopes: string[] | null) {
  if (!owner || typeof window === "undefined") return;
  try {
    const key = ownedStorageKeyFor(owner, KEY);
    // Only the approved scope list is persisted; no tokens or grant identity.
    if (scopes === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(scopes));
  } catch { /* Memory still preserves a draft when browser storage is blocked. */ }
}

type ScopeState = {
  owner: string | null; epoch: number; scopes: string[]; dirty: boolean;
  actualScopes: string[] | null; observedGrant: string | null | undefined;
  choose: (scope: string, checked: boolean, owner: string | null, epoch: number) => void;
  observe: (connection: { state: string; scopes?: string[]; grantVersion?: string }, owner: string | null, epoch: number, returnedFromOAuth?: boolean) => void;
  clear: (owner: string | null, epoch: number) => void;
};
function snapshot(owner: string | null, epoch: number) {
  const draft = readDraft(owner);
  return { owner, epoch, scopes: draft ?? defaults(), dirty: draft !== null, actualScopes: null, observedGrant: undefined };
}
const current = (state: ScopeState, owner: string | null, epoch: number) => state.owner === owner && state.epoch === epoch && getStorageOwner() === owner && getOwnerEpoch() === epoch;

export const useGoogleConnectorScopes = create<ScopeState>((set, get) => ({
  ...snapshot(getStorageOwner(), getOwnerEpoch()),
  choose: (scope, checked, owner, epoch) => {
    const state = get();
    if (!current(state, owner, epoch) || !GOOGLE_SCOPE_OPTIONS.some(([allowed]) => allowed === scope)) return;
    const scopes = approved(checked ? [...state.scopes, scope] : state.scopes.filter(item => item !== scope));
    persistDraft(owner, scopes); set({ scopes, dirty: true });
  },
  observe: (connection, owner, epoch, returnedFromOAuth = false) => {
    const state = get();
    if (!current(state, owner, epoch)) return;
    if (connection.state === "disconnected") {
      // Initial/disrupted status is not a completed disconnect. Preserve the
      // pending choice through MFA until a real old grant has been removed.
      if (state.observedGrant != null) { persistDraft(owner, null); set({ scopes: defaults(), dirty: false, actualScopes: null, observedGrant: null }); }
      else set({ actualScopes: null, observedGrant: null });
      return;
    }
    if (!["connected", "reauthorization_required"].includes(connection.state) || !Array.isArray(connection.scopes)) return;
    const actualScopes = approved(connection.scopes);
    const version = connection.grantVersion && /^[a-f0-9]{64}$/.test(connection.grantVersion) ? connection.grantVersion : `legacy:${actualScopes.join(" ")}`;
    const newGrant = state.observedGrant !== undefined && state.observedGrant !== version;
    // A callback hint only reconciles after a live connected response. It does
    // not establish authorization; old servers without a version stay usable.
    if (newGrant || returnedFromOAuth && connection.state === "connected" || !state.dirty) {
      persistDraft(owner, null); set({ scopes: actualScopes, dirty: false, actualScopes, observedGrant: version });
    } else set({ actualScopes, observedGrant: version });
  },
  clear: (owner, epoch) => {
    if (!current(get(), owner, epoch)) return;
    persistDraft(owner, null); set({ scopes: defaults(), dirty: false, actualScopes: null, observedGrant: null });
  },
}));

// Same-owner token/MFA renewal does not advance this established owner epoch.
onStorageOwnerChange((_previous, owner, epoch) => useGoogleConnectorScopes.setState(snapshot(owner, epoch)));
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  const state = useGoogleConnectorScopes.getState();
  if (!state.owner || event.key !== ownedStorageKeyFor(state.owner, KEY) || !current(state, state.owner, state.epoch)) return;
  const draft = parseDraft(event.newValue);
  useGoogleConnectorScopes.setState({ scopes: draft ?? state.actualScopes ?? defaults(), dirty: draft !== null });
});
