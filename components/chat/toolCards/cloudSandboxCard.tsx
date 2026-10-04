"use client";
import { useEffect, useState } from "react";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import type { SandboxInput, SandboxOutput } from "@/lib/sandbox/types";
import { appModeFromPathname } from "@/lib/constants/app-mode";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import LearningAccountVerificationLink from "@/components/plugins/LearningAccountVerificationLink";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { useToast } from "@/lib/stores/toast";

export default function CloudSandboxCard({ part }: ResultCardProps<"cloudSandbox">) {
  const t = useT();
  const [updated, setUpdated] = useState<SandboxOutput | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [confirmation, setConfirmation] = useState<"close" | "resume" | null>(null);
  const pushToast = useToast(s => s.show);
  const [savedRequest, setSavedRequest] = useState<SandboxInput | null>(null);
  const original = part.state === "output-available" ? part.output : null;
  useEffect(() => {
    if (!original?.authenticationBlocked || !original.retryId || !original.ownerBinding || !original.conversationId || appModeFromPathname(window.location.pathname) !== "agent") return;
    const controller = new AbortController();
    fetch(`/api/agent/sandbox/retry/${original.retryId}?conversation=${encodeURIComponent(original.conversationId)}`, { cache: "no-store", headers: { "X-StudySolo-Owner-Binding": original.ownerBinding }, signal: controller.signal }).then(async response => {
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setError(typeof data.code === "string" ? data.code : "SANDBOX_UNAVAILABLE"); return; }
      if (data.state === "proposed") setSavedRequest(data.input);
      else setUpdated(data.output ?? { conversationId: original.conversationId, error: "SANDBOX_RETRY_UNCERTAIN", state: "uncertain", text: t("trace.tool.learningConnectors.uncertain") });
    }).catch(() => { if (!controller.signal.aborted) setError("SANDBOX_UNAVAILABLE"); });
    return () => controller.abort();
  }, [original?.authenticationBlocked, original?.retryId, original?.ownerBinding, original?.conversationId, t]);
  if (part.state !== "output-available") return null;
  const output = updated ?? part.output;
  const inAgent = typeof window !== "undefined" && appModeFromPathname(window.location.pathname) === "agent";
  const returnPath = typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/agent" ? "/agent" : `/c/${encodeURIComponent(output.conversationId ?? "")}`;
  const canResume = inAgent && !!savedRequest && output.authenticationBlocked === true && !!output.retryId && !!output.ownerBinding && !!output.conversationId;
  const responseError = async (response: Response) => { const data = await response.json().catch(() => null); return typeof data?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.code) ? data.code : "SANDBOX_UNAVAILABLE"; };
  const resume = async () => {
    setConfirmation(null);
    if (!canResume || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/agent/sandbox/retry/${output.retryId}`, { method: "POST", headers: { "Content-Type": "application/json", "X-StudySolo-Owner-Binding": output.ownerBinding! }, body: JSON.stringify({ conversationId: output.conversationId }) });
      if (!response.ok) throw new Error(await responseError(response));
      // Replacement clears the original auth refusal. Server's durable ticket
      // prevents a reload or another tab from repeating this operation.
      const result: SandboxOutput = await response.json(); setUpdated(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "SANDBOX_UNAVAILABLE"); } finally { setBusy(false); }
  };
  const action = async (kind: "poll" | "cancel" | "close") => {
    if (!inAgent || !output.conversationId || !output.sessionId || busy) return;
    setConfirmation(null); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/agent/sandbox/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: output.conversationId, action: kind, sessionId: output.sessionId, ...(kind !== "close" ? { commandId: output.commandId } : {}) }) });
      if (!response.ok) throw new Error(await responseError(response));
      const result: SandboxOutput = await response.json();
      setUpdated({ ...output, ...result, error: result.error, logsTruncated: result.logsTruncated });
      if (kind === "close" && result.state === "closed") pushToast(t("trace.tool.cloudSandbox.closed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "SANDBOX_UNAVAILABLE"); } finally { setBusy(false); }
  };
  const download = async () => {
    if (!inAgent || !output.artifact || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(output.artifact.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const bytes = await response.blob();
      if (bytes.size > 20 * 1024 * 1024) throw new Error("SANDBOX_FILE_LIMIT");
      const url = URL.createObjectURL(bytes), anchor = document.createElement("a");
      anchor.href = url; anchor.download = output.artifact.filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "SANDBOX_UNAVAILABLE"); } finally { setBusy(false); }
  };
  return <section className="my-3 overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] text-xs" data-testid="cloud-sandbox-card">
    <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2"><strong>{t("trace.tool.cloudSandbox.title")}</strong>{output.state && <span className="text-[var(--ink-faint)]">{output.state}</span>}{output.exitCode !== undefined && <span className="ml-auto font-mono">exit {output.exitCode}</span>}</div>
    <div className="space-y-2 p-3">{!output.stdout && !output.stderr && <p className="whitespace-pre-wrap">{output.text}</p>}{output.stdout && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono">{output.stdout}</pre>}{output.stderr && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[var(--md-sys-color-error)]">{output.stderr}</pre>}
      {output.artifact && /^\/api\/agent\/sandbox\/artifacts\/[a-f0-9-]{36}\?conversation=/.test(output.artifact.downloadUrl) && inAgent && <button type="button" disabled={busy} onClick={() => void download()} className="text-[var(--accent)]">{t("trace.tool.cloudSandbox.download")} · {output.artifact.filename}</button>}
      {inAgent ? <div className="flex flex-wrap gap-3">{output.commandId && <><button type="button" disabled={busy} onClick={() => void action("poll")}>{t("trace.tool.cloudSandbox.refresh")}</button><button type="button" disabled={busy} onClick={() => void action("cancel")}>{t("trace.tool.cloudSandbox.cancel")}</button></>}{output.sessionId && output.state !== "closed" && <button type="button" disabled={busy} onClick={() => setConfirmation("close")}>{t("trace.tool.cloudSandbox.close")}</button>}{canResume && <button type="button" disabled={busy} onClick={() => setConfirmation("resume")}>{t("trace.tool.cloudSandbox.resume")}</button>}</div> : <p className="text-[var(--ink-faint)]">{t("trace.tool.cloudSandbox.expired")}</p>}
      {output.logsTruncated && output.commandId && <p className="text-[var(--ink-faint)]">{t("trace.tool.cloudSandbox.logExcerpt")}</p>}
      {(error || output.error) && <p role="alert">{["REAUTH_REQUIRED", "MFA_REQUIRED", "SESSION_MISSING", "SESSION_INVALID", "SESSION_EXPIRED", "SIGN_IN_REQUIRED", "ACCOUNT_CHANGED", "ACCOUNT_UNAVAILABLE"].includes(error ?? output.error ?? "") ? t(connectorErrorKey(error ?? output.error)) : t("trace.tool.cloudSandbox.failed")}<LearningAccountVerificationLink code={error ?? output.error} returnPath={returnPath} includeSignIn/></p>}
    </div>
    {confirmation && <ConfirmDialog title={t(confirmation === "close" ? "trace.tool.cloudSandbox.close" : "trace.tool.cloudSandbox.resume")} body={confirmation === "close" ? t("trace.tool.cloudSandbox.confirmClose") : <span className="block max-h-72 overflow-auto whitespace-pre-wrap break-words">{t("trace.tool.cloudSandbox.confirmResume")}{"\n"}{JSON.stringify(savedRequest, null, 2)}</span>} cancelLabel={t("common.cancel")} confirmLabel={t(confirmation === "close" ? "trace.tool.cloudSandbox.close" : "trace.tool.learningConnectors.approve")} onCancel={() => setConfirmation(null)} onConfirm={() => void (confirmation === "close" ? action("close") : resume())}/>}
  </section>;
}
