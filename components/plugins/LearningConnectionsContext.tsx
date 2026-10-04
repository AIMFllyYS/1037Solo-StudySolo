"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onBrowserSessionChange } from "@/lib/auth/browserSession";
import { connectorId, type ConnectorConnectionStatus } from "@/lib/connectors/registry";
import { getStorageOwner, getOwnerEpoch, onStorageOwnerChange } from "@/lib/storage/ownerScope";
import { useGoogleConnectorScopes } from "@/lib/stores/googleConnectorScopes";

export type LearningConnection = Pick<ConnectorConnectionStatus, "provider" | "state" | "scopes" | "error" | "canDisconnect" | "grantVersion">;
type State = { connections: LearningConnection[]; loading: boolean; error: string | null; refresh: () => Promise<void> };
const Context = createContext<State | null>(null);

export function LearningConnectionsProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<LearningConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const sessionOwner = useRef(getStorageOwner());
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    if (sessionOwner.current !== owner) return; // Wait for verified owner activation.
    try {
      const response = await fetch("/api/connectors", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted || getStorageOwner() !== owner || getOwnerEpoch() !== epoch || sessionOwner.current !== owner) return;
      if (!response.ok) {
        setConnections([]);
        setError(response.status === 401 ? "SIGN_IN_REQUIRED" : typeof data.code === "string" ? data.code : "CONNECTOR_UNAVAILABLE");
      } else {
        if (!Array.isArray(data.connections)) throw new Error();
        // Cookies may change in another tab before AuthProvider finishes its
        // focus reconciliation. Never hydrate that account's status into the
        // old verified owner's draft. This binding remains UI metadata only.
        if (owner && typeof data.ownerBinding === "string") {
          const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner));
          const binding = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
          if (controller.signal.aborted || getStorageOwner() !== owner || getOwnerEpoch() !== epoch || sessionOwner.current !== owner) return;
          if (binding !== data.ownerBinding) { setConnections([]); setError("ACCOUNT_CHANGED"); return; }
        }
        const next: LearningConnection[] = data.connections.filter((item: LearningConnection) => connectorId(item?.provider));
        const google = next.find(item => item.provider === "google");
        if (google) useGoogleConnectorScopes.getState().observe(google, owner, epoch, new URL(window.location.href).searchParams.get("connected") === "google");
        setConnections(next);
        setError(null);
      }
    } catch { if (!controller.signal.aborted) { setConnections([]); setError("CONNECTOR_UNAVAILABLE"); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const changed = onBrowserSessionChange(next => {
      const owner = next?.user.id ?? null;
      request.current?.abort();
      if (owner !== sessionOwner.current) { sessionOwner.current = owner; setConnections([]); setError(null); setLoading(true); }
      // Same-account token/MFA refresh does not clear connection snapshots.
      if (owner === getStorageOwner()) void refresh();
    });
    const ownerChanged = onStorageOwnerChange((_previous, owner) => {
      request.current?.abort(); sessionOwner.current = owner; setConnections([]); setError(null); void refresh();
    });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { clearTimeout(timer); request.current?.abort(); changed(); ownerChanged(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [refresh]);
  return <Context.Provider value={{ connections, loading, error, refresh }}>{children}</Context.Provider>;
}

export function useLearningConnections() {
  const state = useContext(Context);
  if (!state) throw new Error("LearningConnectionsProvider required");
  return state;
}
