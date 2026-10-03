"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onBrowserSessionChange } from "@/lib/auth/browserSession";

type Installed = { packageId: string; version: string; digest: string };
type State = { ready: boolean; installed: Installed[]; refresh: () => Promise<void> };
const Context = createContext<State>({ ready: false, installed: [], refresh: async () => {} });
export function SkillPackagesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, installed: [] as Installed[] });
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    try {
      const response = await fetch("/api/agent/skills/", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!controller.signal.aborted) setState(response.ok && Array.isArray(data.installed) ? { ready: data.ready === true, installed: data.installed } : { ready: false, installed: [] });
    } catch { if (!controller.signal.aborted) setState({ ready: false, installed: [] }); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const off = onBrowserSessionChange(() => { pending.current?.abort(); setState({ ready: false, installed: [] }); void refresh(); });
    return () => { clearTimeout(timer); pending.current?.abort(); off(); };
  }, [refresh]);
  return <Context.Provider value={{ ...state, refresh }}>{children}</Context.Provider>;
}
export const useSkillPackages = () => useContext(Context);
