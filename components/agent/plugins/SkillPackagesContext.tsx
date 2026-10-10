"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onBrowserSessionChange } from "@/lib/auth/sessions/browserSession";
import { getStorageOwner, getOwnerEpoch, onStorageOwnerChange } from "@/lib/storage/ownerScope";

type Installed = { packageId: string; version: string; digest: string };
type State = { ready: boolean; installed: Installed[]; error: string | null; refresh: () => Promise<void> };
const Context = createContext<State>({ ready: false, installed: [], error: null, refresh: async () => {} });
export function SkillPackagesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, installed: [] as Installed[], error: null as string | null });
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    const current = () => !controller.signal.aborted && getStorageOwner() === owner && getOwnerEpoch() === epoch;
    try {
      const response = await fetch("/api/agent/skills/", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!current()) return;
      if (!response.ok || !Array.isArray(data.installed)) { setState({ ready: false, installed: [], error: typeof data.code === "string" ? data.code : "SANDBOX_UNAVAILABLE" }); return; }
      if (!owner) { setState({ ready: false, installed: [], error: "SIGN_IN_REQUIRED" }); return; }
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner));
      const binding = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!current()) return;
      if (binding !== data.ownerBinding) { setState({ ready: false, installed: [], error: "ACCOUNT_CHANGED" }); return; }
      setState({ ready: data.ready === true, installed: data.installed, error: data.ready === true ? null : "SKILL_RUNTIME_NOT_READY" });
    } catch { if (current()) setState({ ready: false, installed: [], error: "SANDBOX_UNAVAILABLE" }); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const off = onBrowserSessionChange(() => { pending.current?.abort(); void refresh(); });
    const ownerChanged = onStorageOwnerChange(() => { pending.current?.abort(); setState({ ready: false, installed: [], error: null }); void refresh(); });
    const focused = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focused); document.addEventListener("visibilitychange", focused);
    return () => { clearTimeout(timer); pending.current?.abort(); off(); ownerChanged(); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); };
  }, [refresh]);
  return <Context.Provider value={{ ...state, refresh }}>{children}</Context.Provider>;
}
export const useSkillPackages = () => useContext(Context);
