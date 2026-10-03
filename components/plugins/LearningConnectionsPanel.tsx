"use client";
import Link from "next/link";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";

export default function LearningConnectionsPanel() {
  const t = useT();
  const { loading, error, refresh } = useLearningConnections();
  const key = error === "CONNECTOR_PRODUCTION_DISABLED" ? "productionDisabled" : error === "ORIGIN_REJECTED" ? "originRejected" : error === "ACCOUNT_UNAVAILABLE" ? "accountUnavailable" : error === "MFA_REQUIRED" || error === "REAUTH_REQUIRED" ? "reauth" : "failed";
  return <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3 text-xs" data-testid="learning-connections">
    {error ? <p role="alert" className="text-[var(--ink-soft)]">{t(error === "SIGN_IN_REQUIRED" ? "trace.tool.learningConnectors.signIn" : `agent.market.connection.${key}`)}{error === "SIGN_IN_REQUIRED" && <Link href="/login" className="ml-2 text-[var(--accent)]">{t("trace.tool.learningConnectors.signIn")}</Link>}</p> : <p className="text-[var(--ink-faint)]">{t(loading ? "agent.market.loading" : "trace.tool.learningConnectors.manageHint")}</p>}
    <button type="button" disabled={loading} className="press text-[var(--accent)] disabled:opacity-50" onClick={() => void refresh()}>{t("trace.tool.learningConnectors.refresh")}</button>
  </section>;
}
