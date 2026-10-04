"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";
import { connectorId, CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { useToast } from "@/lib/stores/toast";
import LearningAccountVerificationLink from "./LearningAccountVerificationLink";

export default function LearningConnectionsPanel() {
  const t = useT();
  const { connections, loading, error, refresh } = useLearningConnections();
  const [notice, setNotice] = useState<{ message: string; failed: boolean; code?: string | null } | null>(null);
  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    const returned = connectorId(url.searchParams.get("connected"));
    const failedProvider = connectorId(url.searchParams.get("connection"));
    const failure = url.searchParams.get("connection_error");
    if (!url.searchParams.has("connected") && !url.searchParams.has("connection_error")) return;
    // A navigation hint never establishes authority: require the live status.
    const verified = !error && returned && connections.some(item => item.provider === returned && item.state === "connected");
    const message = failedProvider && failure ? t(connectorErrorKey(failure)) : verified ? t("trace.tool.learningConnectors.authorizationSaved", { provider: CONNECTOR_REGISTRY[returned].name }) : t(error ? connectorErrorKey(error) : "trace.tool.learningConnectors.authorizationRetry");
    // StrictMode may cancel the first effect. Consume the URL only when this
    // notice actually commits, so a cancelled setup cannot lose the result.
    const timer = setTimeout(() => {
      for (const key of ["connected", "connection", "connection_error"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      setNotice({ message, failed: !verified, code: failedProvider && failure ? failure : error }); useToast.getState().show(message);
    }, 0);
    return () => clearTimeout(timer);
  }, [connections, loading, error, t]);
  return <section className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3 text-xs" data-testid="learning-connections">
    <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
      {error ? <p role="alert" className="text-[var(--ink-soft)]">{error === "SIGN_IN_REQUIRED" || error.startsWith("SESSION_") ? <Link href="/login" className="text-[var(--accent)]">{t("trace.tool.learningConnectors.signIn")}</Link> : t(connectorErrorKey(error))}<LearningAccountVerificationLink code={error} /></p> : <p className="text-[var(--ink-faint)]">{t(loading ? "agent.market.loading" : "trace.tool.learningConnectors.manageHint")}</p>}
      {notice && (!error || notice.code !== error) && <p role={notice.failed ? "alert" : "status"} className="mt-1 text-[var(--ink-soft)]">{notice.message}<LearningAccountVerificationLink code={notice.code} /></p>}
    </div>
    <button type="button" disabled={loading} className="press shrink-0 text-[var(--accent)] disabled:opacity-50" onClick={() => { setNotice(null); void refresh(); }}>{t("trace.tool.learningConnectors.refresh")}</button>
  </section>;
}
