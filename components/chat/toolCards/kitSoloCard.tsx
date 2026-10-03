"use client";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import { useT } from "@/lib/i18n";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export default function KitSoloCard({ part }: ResultCardProps<"kitSolo">) {
  const t = useT();
  if (part.state !== "output-available") return null;
  const { output } = part, data = output.data;
  const items: Record<string, unknown>[] = Array.isArray(data?.tools) ? data.tools.filter(item => item && typeof item === "object") : data ? [data] : [];
  return <section className="my-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] p-3 text-[12px]" aria-label="KitSolo">
    <strong>KitSolo{output.error ? ` · ${t("trace.tool.kitSolo.failed")}` : ""}</strong>
    {items.map((item, index) => {
      const display = item.display && typeof item.display === "object" ? item.display as Record<string, unknown> : {};
      const url = safeUrl(item.url ?? display.url);
      return <div key={index} className="mt-2 space-y-2"><p>{String(item.name ?? display.title ?? "")}</p>{item.output !== undefined && <><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{typeof item.output === "string" ? item.output : JSON.stringify(item.output, null, 2)}</pre><button className="press rounded-lg border border-[var(--line-soft)] px-2 py-1" onClick={() => void copyTextToClipboard(typeof item.output === "string" ? item.output : JSON.stringify(item.output, null, 2))}>{t("trace.tool.kitSolo.copy")}</button></>}{url && <a href={url} target="_blank" rel="noopener noreferrer" className="block text-[var(--accent)]">{t("trace.tool.kitSolo.open")} ↗</a>}</div>;
    })}
    {!items.length && <p className="mt-2 whitespace-pre-wrap">{output.text}</p>}
  </section>;
}
