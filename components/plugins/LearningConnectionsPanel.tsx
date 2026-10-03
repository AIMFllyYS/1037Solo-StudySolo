"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CONNECTOR_REGISTRY, type ConnectorId } from "@/lib/connectors/registry";
import { useT } from "@/lib/i18n";
type Connection = { provider: ConnectorId; state: string; scopes?: string[]; kind: string };
const GOOGLE_SCOPES = [
  ["https://www.googleapis.com/auth/drive.readonly", "googleFiles"], ["https://www.googleapis.com/auth/calendar.readonly", "googleCalendar"], ["https://www.googleapis.com/auth/calendar.events", "googleCalendarWrite"], ["https://www.googleapis.com/auth/gmail.readonly", "googleMailRead"], ["https://www.googleapis.com/auth/gmail.send", "googleMailSend"], ["https://www.googleapis.com/auth/contacts.readonly", "googleContacts"],
] as const;
export default function LearningConnectionsPanel() {
  const t = useT();
  const [connections, setConnections] = useState<Connection[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch("/api/connectors", { cache: "no-store", signal }); const data = await response.json(); if (!response.ok) throw new Error(response.status === 401 ? "signIn" : "failed"); setConnections(data.connections); setError(null); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error && cause.message === "signIn" ? "signIn" : "failed"); }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); const visible = () => { if (document.visibilityState === "visible") void refresh(controller.signal); }; document.addEventListener("visibilitychange", visible); return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", visible); }; }, [refresh]);
  const disconnect = async (provider: ConnectorId) => {
    if (!window.confirm(t("trace.tool.learningConnectors.disconnectConfirm"))) return;
    setBusy(provider);
    try { const response = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" }); if (!response.ok) throw new Error(); await refresh(); }
    catch { setError("failed"); } finally { setBusy(null); }
  };
  const status = (state: string) => state === "connected" ? t("trace.tool.learningConnectors.connected") : state === "available" ? t("trace.tool.learningConnectors.available") : state === "reauthorization_required" ? t("trace.tool.learningConnectors.reauth") : t("trace.tool.learningConnectors.disconnected");
  return <section className="mb-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4" data-testid="learning-connections">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{t("trace.tool.learningConnectors.manage")}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.manageHint")}</p></div><button className="press text-xs text-[var(--accent)]" onClick={() => void refresh()}>{t("trace.tool.learningConnectors.refresh")}</button></div>
    {error && <p role="alert" className="mt-3 text-xs text-[var(--ink-soft)]">{t(error === "signIn" ? "trace.tool.learningConnectors.signIn" : "trace.tool.learningConnectors.failed")}{error === "signIn" && <Link href="/login" className="ml-2 text-[var(--accent)]">{t("trace.tool.learningConnectors.signIn")}</Link>}</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{connections.map(connection => {
      const provider = connection.provider, descriptor = CONNECTOR_REGISTRY[provider], connected = connection.state === "connected", local = descriptor.auth === "public" || descriptor.auth === "local";
      return <article key={provider} className="rounded-xl border border-[var(--line-soft)] p-3" data-testid={`connection-${provider}`}><div className="flex justify-between gap-2"><strong className="text-xs">{descriptor.name}</strong><span className="text-[11px] text-[var(--ink-faint)]">{status(connection.state)}</span></div><p className="mt-1 text-[10px] text-[var(--ink-faint)]">{t(descriptor.kind === "mcp" ? "trace.tool.learningConnectors.mcp" : descriptor.kind === "api" ? "trace.tool.learningConnectors.api" : "trace.tool.learningConnectors.local")}</p>
        {!local && <form method="post" action={`/api/connectors/${provider}/connect`} target="_blank" className="mt-2 space-y-2">
          {provider === "google" && <details><summary className="cursor-pointer text-xs">{t("trace.tool.learningConnectors.scopes")}</summary><input type="hidden" name="scope_selection" value="1"/><div className="mt-2 space-y-1">{GOOGLE_SCOPES.map(([scope, label]) => <label key={scope} className="flex items-center gap-2 text-[11px]"><input type="checkbox" name="scope" value={scope} defaultChecked={connection.scopes?.length ? connection.scopes.includes(scope) : ["googleFiles", "googleCalendar"].includes(label)}/>{t(`trace.tool.learningConnectors.${label}`)}</label>)}</div></details>}
          <div className="flex gap-3"><button type="submit" className="press rounded-lg bg-[var(--bg-muted)] px-2 py-1 text-xs">{t(connected ? "trace.tool.learningConnectors.reconnect" : "trace.tool.learningConnectors.connect")}</button>{connected && <button type="button" disabled={busy === provider} onClick={() => void disconnect(provider)} className="press text-xs text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.disconnect")}</button>}</div>
        </form>}
        {provider === "anki" && <p className="mt-2 text-[11px] text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.exportHint")}</p>}
      </article>;
    })}</div>
  </section>;
}
