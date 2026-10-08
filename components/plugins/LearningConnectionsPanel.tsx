"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useLearningConnections } from "./LearningConnectionsContext";
import { useT } from "@/lib/i18n";
import { connectorId, CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { useToast } from "@/lib/stores/toast";
import ActionButton from "@/components/ui/ActionButton";
import LearningAccountVerificationLink from "./LearningAccountVerificationLink";

/** 学习服务连接的总状态条：一句话说明当前账号的连接情况 + 刷新；授权回跳的结果也在这里落地。 */
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
  return <section className="mb-4 flex min-w-0 items-start gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-[12px]" data-testid="learning-connections">
    <ShieldCheck size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-[var(--accent)]" />
    <div className="min-w-0 flex-1 break-words leading-relaxed [overflow-wrap:anywhere]">
      {error ? <p role="alert" className="text-[var(--ink-soft)]">{error === "SIGN_IN_REQUIRED" || error.startsWith("SESSION_") ? <Link href="/login" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">{t("trace.tool.learningConnectors.signIn")}</Link> : t(connectorErrorKey(error))}<LearningAccountVerificationLink code={error} /></p> : <p className="text-[var(--ink-soft)]">{t(loading ? "agent.market.loading" : "trace.tool.learningConnectors.manageHint")}</p>}
      {notice && (!error || notice.code !== error) && <p role={notice.failed ? "alert" : "status"} className="mt-1 text-[var(--ink-soft)]">{notice.message}<LearningAccountVerificationLink code={notice.code} /></p>}
    </div>
    <ActionButton variant="ghost" size="sm" disabled={loading} icon={<RefreshCw size={12} className={loading ? "animate-spin" : undefined} />} onClick={() => { setNotice(null); void refresh(); }}>{t("trace.tool.learningConnectors.refresh")}</ActionButton>
  </section>;
}
