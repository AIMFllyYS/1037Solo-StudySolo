"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onBrowserSessionChange } from "@/lib/auth/browserSession";
import { connectorId, type ConnectorId } from "@/lib/connectors/registry";

export type LearningConnection = { provider: ConnectorId; state: string; scopes?: string[] };
type State = { connections: LearningConnection[]; loading: boolean; error: string | null; refresh: () => Promise<void> };
const Context = createContext<State | null>(null);

export function LearningConnectionsProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<LearningConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/connectors", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setConnections([]);
        setError(response.status === 401 ? "SIGN_IN_REQUIRED" : typeof data.code === "string" ? data.code : "CONNECTOR_UNAVAILABLE");
      } else {
        if (!Array.isArray(data.connections)) throw new Error();
        setConnections(data.connections.filter((item: LearningConnection) => connectorId(item?.provider)));
        setError(null);
      }
    } catch { if (!controller.signal.aborted) { setConnections([]); setError("CONNECTOR_UNAVAILABLE"); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const changed = onBrowserSessionChange(() => { request.current?.abort(); setConnections([]); void refresh(); });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { clearTimeout(timer); request.current?.abort(); changed(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [refresh]);
  return <Context.Provider value={{ connections, loading, error, refresh }}>{children}</Context.Provider>;
}

export function useLearningConnections() {
  const state = useContext(Context);
  if (!state) throw new Error("LearningConnectionsProvider required");
  return state;
}
