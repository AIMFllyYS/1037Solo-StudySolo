"use client";

import { useState, type ReactNode } from "react";
import { CONNECTOR_REGISTRY, type ConnectorId } from "@/lib/connectors/registry";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";
import GoogleConnectorScopes from "./GoogleConnectorScopes";
import { useGoogleConnectorScopes } from "@/lib/stores/googleConnectorScopes";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { useToast } from "@/lib/stores/toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import ActionButton from "@/components/ui/ActionButton";
import LearningAccountVerificationLink from "./LearningAccountVerificationLink";

/**
 * 学习服务的连接控件：左边一枚状态胶囊，右边操作；`trailing` 让卡片把「详情」放进同一行，
 * 所有服务卡片的底栏因此对齐成同一条线（以前状态文字、按钮、详情各占一行，卡片参差不齐）。
 */
export default function LearningConnectorControl({ provider, trailing }: { provider: ConnectorId; trailing?: ReactNode }) {
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
    const scopeOwner = useGoogleConnectorScopes.getState();
    setConfirmDisconnect(false);
    setBusy(true); setFailed(null); setRevocation(null);
    try {
      const result = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" });
      const data = await result.json();
      if (!result.ok || data.disconnected !== true) { setFailed(typeof data.code === "string" ? data.code : "CONNECTOR_UNAVAILABLE"); return; }
      if (provider === "google") useGoogleConnectorScopes.getState().clear(scopeOwner.owner, scopeOwner.epoch);
      const message = t(data.remoteRevocation === "revoked" ? "trace.tool.learningConnectors.disconnectedRevoked" : "trace.tool.learningConnectors.disconnectedLocal");
      setRevocation(message); useToast.getState().show(message);
      await refresh();
    } catch { setFailed("CONNECTOR_UNAVAILABLE"); } finally { setBusy(false); }
  };
  const unavailable = Boolean(error) || connection?.state === "unavailable";
  const needsReauth = connection?.state === "reauthorization_required";
  const statusKey = loading ? "agent.market.loading" : signInRequired ? "trace.tool.learningConnectors.signIn" : unavailable ? "agent.market.connection.unavailable" : publicService ? "trace.tool.learningConnectors.available" : connected ? "trace.tool.learningConnectors.connected" : needsReauth ? "trace.tool.learningConnectors.reauth" : "trace.tool.learningConnectors.disconnected";
  const tone: BadgeTone = loading || signInRequired ? "neutral" : unavailable ? "warn" : needsReauth ? "warn" : connected || publicService ? "accent" : "neutral";
  const status = <Badge role="status" tone={tone} dot>{t(statusKey)}</Badge>;
  return <div className="flex min-w-0 w-full flex-col gap-2.5 break-words text-xs [overflow-wrap:anywhere]" data-testid={`connection-${provider}`}>
    {publicService ? <>
      <p className="text-[11.5px] leading-relaxed text-[var(--ink-soft)]">{t(provider === "anki" ? "trace.tool.learningConnectors.exportHint" : "agent.market.connection.publicHint")}</p>
      <div className="flex items-center gap-2">{status}{trailing ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{trailing}</div> : null}</div>
    </> : <form method="post" action={`/api/connectors/${provider}/connect`} target="_blank" rel="noopener" className="flex flex-col gap-2.5">
      {provider === "google" && <GoogleConnectorScopes connection={connection} />}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        {status}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {canDisconnect && <ActionButton variant="ghost" size="sm" disabled={busy || loading || !!error} onClick={() => setConfirmDisconnect(true)}>{t("trace.tool.learningConnectors.disconnect")}</ActionButton>}
          <ActionButton type="submit" size="sm" variant={canDisconnect ? "secondary" : "primary"} data-testid={`plugins-connect-${provider}`} disabled={loading || !!error || busy}>{t(canDisconnect ? "trace.tool.learningConnectors.reconnect" : "agent.market.action.connect")}</ActionButton>
          {trailing}
        </div>
      </div>
    </form>}
    {(failed || connection?.error) && <p role="alert" className="rounded-lg bg-[var(--md-sys-color-error-container)] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-error-container)]">{t(connectorErrorKey(failed ?? connection?.error))}<LearningAccountVerificationLink code={failed ?? connection?.error} /></p>}
    {revocation && <p role="status" className="text-[11.5px] leading-relaxed text-[var(--ink-soft)]">{revocation}</p>}
    {confirmDisconnect && <ConfirmDialog title={`${descriptor.name} · ${t("trace.tool.learningConnectors.disconnect")}`} body={t("trace.tool.learningConnectors.disconnectConfirm")} cancelLabel={t("common.cancel")} confirmLabel={t("trace.tool.learningConnectors.disconnect")} onCancel={() => setConfirmDisconnect(false)} onConfirm={() => void disconnect()} />}
  </div>;
}
