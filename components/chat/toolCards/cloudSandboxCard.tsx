"use client";
import { useState } from "react";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import type { SandboxOutput } from "@/lib/sandbox/types";
import { appModeFromPathname } from "@/lib/constants/app-mode";
import { useT } from "@/lib/i18n";

export default function CloudSandboxCard({ part }: ResultCardProps<"cloudSandbox">) {
  const t = useT();
  const [updated, setUpdated] = useState<SandboxOutput | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  if (part.state !== "output-available") return null;
  const output = updated ?? part.output;
  const inAgent = typeof window !== "undefined" && appModeFromPathname(window.location.pathname) === "agent";
  const action = async (kind: "poll" | "cancel" | "close") => {
    if (!inAgent || !output.conversationId || !output.sessionId || busy) return;
    if (kind === "close" && !window.confirm(t("trace.tool.cloudSandbox.confirmClose"))) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/agent/sandbox/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: output.conversationId, action: kind, sessionId: output.sessionId, ...(kind !== "close" ? { commandId: output.commandId } : {}) }) });
      if (!response.ok) throw new Error();
      const result: SandboxOutput = await response.json();
      setUpdated({ ...output, ...result, error: result.error, logsTruncated: result.logsTruncated });
    } catch { setError(true); } finally { setBusy(false); }
  };
  const download = async () => {
    if (!inAgent || !output.artifact || busy) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(output.artifact.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const bytes = await response.blob();
      if (bytes.size > 20 * 1024 * 1024) throw new Error();
      const url = URL.createObjectURL(bytes), anchor = document.createElement("a");
      anchor.href = url; anchor.download = output.artifact.filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <section className="my-3 overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] text-xs" data-testid="cloud-sandbox-card">
    <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2"><strong>{t("trace.tool.cloudSandbox.title")}</strong>{output.state && <span className="text-[var(--ink-faint)]">{output.state}</span>}{output.exitCode !== undefined && <span className="ml-auto font-mono">exit {output.exitCode}</span>}</div>
    <div className="space-y-2 p-3">{!output.stdout && !output.stderr && <p className="whitespace-pre-wrap">{output.text}</p>}{output.stdout && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono">{output.stdout}</pre>}{output.stderr && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[var(--md-sys-color-error)]">{output.stderr}</pre>}
      {output.artifact && /^\/api\/agent\/sandbox\/artifacts\/[a-f0-9-]{36}\?conversation=/.test(output.artifact.downloadUrl) && inAgent && <button type="button" disabled={busy} onClick={() => void download()} className="text-[var(--accent)]">{t("trace.tool.cloudSandbox.download")} · {output.artifact.filename}</button>}
      {inAgent ? <div className="flex flex-wrap gap-3">{output.commandId && <><button type="button" disabled={busy} onClick={() => void action("poll")}>{t("trace.tool.cloudSandbox.refresh")}</button><button type="button" disabled={busy} onClick={() => void action("cancel")}>{t("trace.tool.cloudSandbox.cancel")}</button></>}{output.sessionId && output.state !== "closed" && <button type="button" disabled={busy} onClick={() => void action("close")}>{t("trace.tool.cloudSandbox.close")}</button>}</div> : <p className="text-[var(--ink-faint)]">{t("trace.tool.cloudSandbox.expired")}</p>}
      {output.logsTruncated && output.commandId && <p className="text-[var(--ink-faint)]">{t("trace.tool.cloudSandbox.logExcerpt")}</p>}
      {(error || output.error) && <p role="alert">{t("trace.tool.cloudSandbox.failed")}{output.error ? ` · ${output.error}` : ""}</p>}
    </div>
  </section>;
}
