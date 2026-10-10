"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { useT } from "@/lib/i18n";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { ankiTsv } from "@/lib/connectors/anki";
import { connectorErrorKey } from "@/lib/connectors/presentation";
function safeUrl(raw: string) { try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && ![...url.searchParams.keys()].some(key => /token|secret|authorization|code/i.test(key)) ? url.href : null; } catch { return null; } }
export default function LearningConnectorsCard({ part, onOutputChange, isStreaming }: ResultCardProps<"learningConnectors">) {
  const t = useT(), output = part.state === "output-available" ? part.output : null;
  const action = output?.action;
  const [busy, setBusy] = useState(false);
  const initialRead = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const id = output?.action?.id;
  useEffect(() => {
    if (!id || !output || isStreaming || !onOutputChange) return; const controller = new AbortController();
    initialRead.current = controller;
    fetch(`/api/connectors/actions/${id}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      onOutputChange(response.ok ? { ...output, action: data, error: undefined } : { ...output, error: typeof data.code === "string" ? data.code : "CONNECTOR_UNAVAILABLE" });
    }).catch(() => { if (!controller.signal.aborted) onOutputChange({ ...output, error: "CONNECTOR_UNAVAILABLE" }); });
    return () => controller.abort();
    // One read per mounted action ID; retain the request's owner-bound updater.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isStreaming]);
  const expiresAt = action?.expiresAt;
  useEffect(() => { if (!expiresAt || action?.status !== "proposed") return; const timer = setTimeout(() => { setNow(Date.now()); if (output) onOutputChange?.({ ...output }); }, Math.max(0, expiresAt - Date.now() + 5)); return () => clearTimeout(timer);
    // Expiration reprojects the existing fact; output changes do not reset its clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, action?.status]);
  if (!output) return null;
  const refresh = async () => {
    if (!action || busy || isStreaming || !onOutputChange) return;
    initialRead.current?.abort();
    setBusy(true);
    try {
      const response = await fetch(`/api/connectors/actions/${action.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      onOutputChange({ ...output, action: data, error: undefined });
    } catch (cause) { onOutputChange({ ...output, error: cause instanceof Error ? cause.message : "CONNECTOR_UNAVAILABLE" }); }
    finally { setBusy(false); }
  };
  const act = async (kind: "confirm" | "cancel") => {
    if (!action || busy || isStreaming || !onOutputChange) return; initialRead.current?.abort(); setBusy(true);
    try { const response = await fetch(`/api/connectors/actions/${action.id}/${kind}`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.code); onOutputChange({ ...output, action: data, error: undefined }); }
    catch (cause) { onOutputChange?.({ ...output, error: cause instanceof Error ? cause.message : "CONNECTOR_UNAVAILABLE" }); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/connectors", { cache: "no-store" }), session = await response.json();
      if (!response.ok || session.ownerBinding !== output.ownerBinding) throw new Error("ACCOUNT_CHANGED");
      const byId = useReviewCards.getState().byId, cards = (output.exportCardIds ?? []).map(cardId => byId[cardId]);
      if (!cards.length || cards.some(card => !card || card.status !== "ready")) throw new Error("FLASHCARDS_NOT_AVAILABLE");
      const content = await ankiTsv(cards), url = URL.createObjectURL(new Blob([content], { type: "text/tab-separated-values;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "StudySolo-Anki.tsv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { onOutputChange?.({ ...output, error: cause instanceof Error ? cause.message : "EXPORT_FAILED" }); } finally { setBusy(false); }
  };
  const failed = output.error ?? action?.error ?? action?.result?.error;
  const displayError = failed === "ADDITIONAL_SCOPE_REQUIRED" ? t("trace.tool.learningConnectors.scopeRequired") : failed === "ACCOUNT_CHANGED" ? t("trace.tool.learningConnectors.accountChanged") : failed ? t(connectorErrorKey(failed)) : null;
  const state = action?.status;
  const status = state === "succeeded" ? t("trace.tool.learningConnectors.succeeded") : state === "executing" ? t("trace.tool.learningConnectors.executing") : state === "cancelled" ? t("trace.tool.learningConnectors.cancelled") : state === "uncertain" ? t("trace.tool.learningConnectors.uncertain") : state === "failed" ? t("trace.tool.learningConnectors.failed") : action && action.expiresAt <= now ? t("trace.tool.learningConnectors.expired") : t("trace.tool.learningConnectors.proposed");
  const data = action?.result?.data ?? output.data;
  const inputAction = part.input?.action ?? (["status", "discover", "export"].includes(output.operation) ? output.operation : "read");
  const summary = inputAction === "status" ? t("trace.tool.learningConnectors.statusChecked") : inputAction === "discover" ? t("trace.tool.learningConnectors.capabilitiesReady") : inputAction === "export" ? output.text.slice(0, 600) : t("trace.tool.learningConnectors.readCompleted");
  const detail = data ?? (!action && inputAction !== "export" ? output.text : undefined);
  const serviceTitle = inputAction === "status" && !part.input?.provider ? t("trace.tool.learningConnectors.manage") : CONNECTOR_REGISTRY[output.provider].name;
  return <section className="agent-trace-subdetail min-w-0 space-y-2 text-xs" aria-label={t("trace.tool.learningConnectors.result")}>
    <div className="flex min-w-0 flex-wrap justify-between gap-3"><strong className="min-w-0 break-words [overflow-wrap:anywhere]">{serviceTitle}</strong><Link href="/agent/plugins" className="text-[var(--accent)]">{t("trace.tool.learningConnectors.manage")}</Link></div>
    {displayError && <p role="alert">{displayError}</p>}
    {action && !isStreaming && !!onOutputChange && <button type="button" disabled={busy} onClick={() => void refresh()}>{t("trace.tool.learningConnectors.refresh")}</button>}
    {action ? <><strong>{t("trace.tool.learningConnectors.proposal")}</strong><p role="status">{status}</p><p>{t("trace.tool.learningConnectors.parameters")}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(action.arguments, null, 2)}</pre>{state === "proposed" && action.expiresAt > now && !output.error && !isStreaming && !!onOutputChange && <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void act("confirm")} className="press rounded-lg bg-[var(--accent)] px-3 py-1 text-white">{t("trace.tool.learningConnectors.approve")}</button><button disabled={busy} onClick={() => void act("cancel")} className="press rounded-lg border border-[var(--line-soft)] px-3 py-1">{t("trace.tool.learningConnectors.reject")}</button></div>}</> : !output.error && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{summary}</p>}
    {detail !== undefined && <details><summary className="cursor-pointer">{t("trace.tool.learningConnectors.result")}</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">{typeof detail === "string" ? detail.slice(0, 24000) : JSON.stringify(detail, null, 2).slice(0, 24000)}</pre></details>}
    {(action?.result?.sourceUrls ?? output.sourceUrls ?? []).map(safeUrl).filter((url): url is string => !!url).map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-[var(--accent)]">{t("trace.tool.learningConnectors.source")} ↗</a>)}
    {output.exportCardIds && !isStreaming && !!onOutputChange && <button disabled={busy} onClick={() => void download()} className="press rounded-lg border border-[var(--line-soft)] px-3 py-1">{t("trace.tool.learningConnectors.download")}</button>}
  </section>;
}
