"use client";

import { useState } from "react";
import { CONNECTOR_REGISTRY, type ConnectorId } from "@/lib/connectors/registry";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";
import { GOOGLE_SCOPE_OPTIONS } from "@/lib/connectors/google-scopes";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { useToast } from "@/lib/stores/toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import LearningAccountVerificationLink from "./LearningAccountVerificationLink";

export default function LearningConnectorControl({ provider }: { provider: ConnectorId }) {
  const t = useT();
  const { connections, loading, error, refresh } = useLearningConnections();
  const connection = connections.find(item => item.provider === provider);
  const descriptor = CONNECTOR_REGISTRY[provider];
  const connected = connection?.state === "connected";
  const canDisconnect = connected || connection?.state === "reauthorization_required" && connection.canDisconnect === true;
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<string | null>(null);
  const [revocation, setRevocation] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const publicService = descriptor.auth === "public" || descriptor.auth === "local";
  const signInRequired = error === "SIGN_IN_REQUIRED" || error?.startsWith("SESSION_");
  const disconnect = async () => {
    setConfirmDisconnect(false);
    setBusy(true); setFailed(null); setRevocation(null);
    try {
      const result = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" });
      const data = await result.json();
      if (!result.ok || data.disconnected !== true) { setFailed(typeof data.code === "string" ? data.code : "CONNECTOR_UNAVAILABLE"); return; }
      const message = t(data.remoteRevocation === "revoked" ? "trace.tool.learningConnectors.disconnectedRevoked" : "trace.tool.learningConnectors.disconnectedLocal");
      setRevocation(message); useToast.getState().show(message);
      await refresh();
    } catch { setFailed("CONNECTOR_UNAVAILABLE"); } finally { setBusy(false); }
  };
  return <div className="flex min-w-0 w-full flex-col gap-2 break-words text-xs [overflow-wrap:anywhere]" data-testid={`connection-${provider}`}>
    <span className="text-[11px] text-[var(--ink-faint)]" role="status">{t(loading ? "agent.market.loading" : signInRequired ? "trace.tool.learningConnectors.signIn" : error || connection?.state === "unavailable" ? "agent.market.connection.unavailable" : publicService ? "trace.tool.learningConnectors.available" : connected ? "trace.tool.learningConnectors.connected" : connection?.state === "reauthorization_required" ? "trace.tool.learningConnectors.reauth" : "trace.tool.learningConnectors.disconnected")}</span>
    {publicService ? <p className="text-[11px] text-[var(--ink-soft)]">{t(provider === "anki" ? "trace.tool.learningConnectors.exportHint" : "agent.market.connection.publicHint")}</p> : <form method="post" action={`/api/connectors/${provider}/connect`} target="_blank" rel="noopener" className="space-y-2">
      {provider === "google" && <details><summary className="cursor-pointer text-[11px]">{t("trace.tool.learningConnectors.scopes")}</summary><input type="hidden" name="scope_selection" value="1"/><div key={connection?.scopes?.join(" ") ?? "default"} className="mt-2 space-y-1">{GOOGLE_SCOPE_OPTIONS.map(([scope, label]) => <label key={scope} className="flex items-start gap-2 text-[11px]"><input className="mt-0.5 shrink-0" type="checkbox" name="scope" value={scope} defaultChecked={connection?.scopes?.length ? connection.scopes.includes(scope) : ["googleFiles", "googleCalendar"].includes(label)}/><span className="min-w-0">{t(`trace.tool.learningConnectors.${label}`)}</span></label>)}</div></details>}
      <div className="flex flex-wrap gap-2"><button type="submit" data-testid={`plugins-connect-${provider}`} disabled={loading || !!error || busy} className="press rounded-lg bg-[var(--md-sys-color-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-50">{t(canDisconnect ? "trace.tool.learningConnectors.reconnect" : "agent.market.action.connect")}</button>{canDisconnect && <button type="button" disabled={busy || loading || !!error} onClick={() => setConfirmDisconnect(true)} className="press text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.disconnect")}</button>}</div>
    </form>}
    {(failed || connection?.error) && <p role="alert">{t(connectorErrorKey(failed ?? connection?.error))}<LearningAccountVerificationLink code={failed ?? connection?.error} /></p>}
    {revocation && <p role="status" className="text-[var(--ink-soft)]">{revocation}</p>}
    {confirmDisconnect && <ConfirmDialog title={`${descriptor.name} · ${t("trace.tool.learningConnectors.disconnect")}`} body={t("trace.tool.learningConnectors.disconnectConfirm")} cancelLabel={t("common.cancel")} confirmLabel={t("trace.tool.learningConnectors.disconnect")} onCancel={() => setConfirmDisconnect(false)} onConfirm={() => void disconnect()} />}
  </div>;
}
