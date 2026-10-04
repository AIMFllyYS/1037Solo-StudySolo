"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { CONNECTOR_REGISTRY, type ExternalActionView } from "@/lib/connectors/registry";
import { useT } from "@/lib/i18n";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { ankiTsv } from "@/lib/connectors/anki";
import { connectorErrorKey } from "@/lib/connectors/presentation";
function safeUrl(raw: string) { try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && ![...url.searchParams.keys()].some(key => /token|secret|authorization|code/i.test(key)) ? url.href : null; } catch { return null; } }
export default function LearningConnectorsCard({ part }: ResultCardProps<"learningConnectors">) {
  const t = useT(), output = part.state === "output-available" ? part.output : null;
  const [action, setAction] = useState<ExternalActionView | undefined>(output?.action), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const id = output?.action?.id;
  useEffect(() => {
    if (!id) return; const controller = new AbortController();
    fetch(`/api/connectors/actions/${id}`, { cache: "no-store", signal: controller.signal }).then(async response => { if (response.ok) setAction(await response.json()); }).catch(() => {});
    return () => controller.abort();
  }, [id]);
  const expiresAt = action?.expiresAt;
  useEffect(() => { if (!expiresAt) return; const timer = setTimeout(() => setNow(Date.now()), Math.max(0, expiresAt - Date.now() + 5)); return () => clearTimeout(timer); }, [expiresAt]);
  if (!output) return null;
  const act = async (kind: "confirm" | "cancel") => {
    if (!action || busy) return; setBusy(true); setError(null);
    try { const response = await fetch(`/api/connectors/actions/${action.id}/${kind}`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.code); setAction(data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "CONNECTOR_UNAVAILABLE"); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/connectors", { cache: "no-store" }), session = await response.json();
      if (!response.ok || session.ownerBinding !== output.ownerBinding) throw new Error("ACCOUNT_CHANGED");
      const byId = useReviewCards.getState().byId, cards = (output.exportCardIds ?? []).map(cardId => byId[cardId]);
      if (!cards.length || cards.some(card => !card || card.status !== "ready")) throw new Error("FLASHCARDS_NOT_AVAILABLE");
      const content = await ankiTsv(cards), url = URL.createObjectURL(new Blob([content], { type: "text/tab-separated-values;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "StudySolo-Anki.tsv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "EXPORT_FAILED"); } finally { setBusy(false); }
  };
  const failed = output.error ?? error;
  const displayError = failed === "ADDITIONAL_SCOPE_REQUIRED" ? t("trace.tool.learningConnectors.scopeRequired") : failed === "ACCOUNT_CHANGED" ? t("trace.tool.learningConnectors.accountChanged") : failed ? t(connectorErrorKey(failed)) : null;
  const state = action?.status;
  const status = state === "succeeded" ? t("trace.tool.learningConnectors.succeeded") : state === "executing" ? t("trace.tool.learningConnectors.executing") : state === "cancelled" ? t("trace.tool.learningConnectors.cancelled") : state === "uncertain" ? t("trace.tool.learningConnectors.uncertain") : state === "failed" ? t("trace.tool.learningConnectors.failed") : action && action.expiresAt <= now ? t("trace.tool.learningConnectors.expired") : t("trace.tool.learningConnectors.proposed");
  const data = action?.result?.data ?? output.data;
  return <section className="my-3 space-y-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] p-3 text-xs" aria-label={t("trace.tool.learningConnectors.result")}>
    <div className="flex min-w-0 flex-wrap justify-between gap-3"><strong className="min-w-0 break-words [overflow-wrap:anywhere]">{CONNECTOR_REGISTRY[output.provider].name}</strong><Link href="/agent/plugins" className="text-[var(--accent)]">{t("trace.tool.learningConnectors.manage")}</Link></div>
    {displayError && <p role="alert">{displayError}</p>}
    {action ? <><strong>{t("trace.tool.learningConnectors.proposal")}</strong><p role="status">{status}</p><p>{t("trace.tool.learningConnectors.parameters")}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(action.arguments, null, 2)}</pre>{state === "proposed" && action.expiresAt > now && <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void act("confirm")} className="press rounded-lg bg-[var(--accent)] px-3 py-1 text-white">{t("trace.tool.learningConnectors.approve")}</button><button disabled={busy} onClick={() => void act("cancel")} className="press rounded-lg border border-[var(--line-soft)] px-3 py-1">{t("trace.tool.learningConnectors.reject")}</button></div>}</> : !output.error && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{output.text.slice(0, 2000)}</p>}
    {data !== undefined && <details><summary className="cursor-pointer">{t("trace.tool.learningConnectors.result")}</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">{typeof data === "string" ? data.slice(0, 24000) : JSON.stringify(data, null, 2).slice(0, 24000)}</pre></details>}
    {(action?.result?.sourceUrls ?? output.sourceUrls ?? []).map(safeUrl).filter((url): url is string => !!url).map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-[var(--accent)]">{t("trace.tool.learningConnectors.source")} ↗</a>)}
    {output.exportCardIds && <button disabled={busy} onClick={() => void download()} className="press rounded-lg border border-[var(--line-soft)] px-3 py-1">{t("trace.tool.learningConnectors.download")}</button>}
  </section>;
}
