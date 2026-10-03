"use client";

import { useState } from "react";
import { CONNECTOR_REGISTRY, type ConnectorId } from "@/lib/connectors/registry";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";

const GOOGLE_SCOPES = [
  ["https://www.googleapis.com/auth/drive.readonly", "googleFiles"],
  ["https://www.googleapis.com/auth/calendar.readonly", "googleCalendar"],
  ["https://www.googleapis.com/auth/calendar.events", "googleCalendarWrite"],
  ["https://www.googleapis.com/auth/gmail.readonly", "googleMailRead"],
  ["https://www.googleapis.com/auth/gmail.send", "googleMailSend"],
  ["https://www.googleapis.com/auth/contacts.readonly", "googleContacts"],
] as const;

export default function LearningConnectorControl({ provider }: { provider: ConnectorId }) {
  const t = useT();
  const { connections, loading, error, refresh } = useLearningConnections();
  const connection = connections.find(item => item.provider === provider);
  const descriptor = CONNECTOR_REGISTRY[provider];
  const connected = connection?.state === "connected";
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const publicService = descriptor.auth === "public" || descriptor.auth === "local";
  const disconnect = async () => {
    if (!window.confirm(t("trace.tool.learningConnectors.disconnectConfirm"))) return;
    setBusy(true); setFailed(false);
    try { const result = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" }); if (!result.ok) throw new Error(); await refresh(); }
    catch { setFailed(true); } finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-2 text-xs" data-testid={`connection-${provider}`}>
    <span className="text-[11px] text-[var(--ink-faint)]" role="status">{t(loading ? "agent.market.loading" : error ? "agent.market.connection.unavailable" : publicService ? "trace.tool.learningConnectors.available" : connected ? "trace.tool.learningConnectors.connected" : connection?.state === "reauthorization_required" ? "trace.tool.learningConnectors.reauth" : "trace.tool.learningConnectors.disconnected")}</span>
    {publicService ? <p className="text-[11px] text-[var(--ink-soft)]">{t(provider === "anki" ? "trace.tool.learningConnectors.exportHint" : "agent.market.connection.publicHint")}</p> : <form method="post" action={`/api/connectors/${provider}/connect`} target="_blank" rel="noopener noreferrer" className="space-y-2">
      {provider === "google" && <details><summary className="cursor-pointer text-[11px]">{t("trace.tool.learningConnectors.scopes")}</summary><input type="hidden" name="scope_selection" value="1"/><div className="mt-2 space-y-1">{GOOGLE_SCOPES.map(([scope, label]) => <label key={scope} className="flex items-center gap-2 text-[11px]"><input type="checkbox" name="scope" value={scope} defaultChecked={connection?.scopes?.length ? connection.scopes.includes(scope) : ["googleFiles", "googleCalendar"].includes(label)}/>{t(`trace.tool.learningConnectors.${label}`)}</label>)}</div></details>}
      <div className="flex flex-wrap gap-2"><button type="submit" data-testid={`plugins-connect-${provider}`} disabled={loading || !!error || busy} className="press rounded-lg bg-[var(--md-sys-color-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-50">{t(connected ? "trace.tool.learningConnectors.reconnect" : "agent.market.action.connect")}</button>{connected && <button type="button" disabled={busy} onClick={() => void disconnect()} className="press text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.disconnect")}</button>}</div>
    </form>}
    {failed && <p role="alert">{t("trace.tool.learningConnectors.failed")}</p>}
  </div>;
}
