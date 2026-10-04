"use client";

import { ExternalLink, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n";
import { safeHttpUrl } from "@/components/browser/safeUrl";

export default function EmbedFallback({
  url,
  reason,
  onForce,
  title,
  actionLabel,
}: {
  url: string;
  reason?: string;
  onForce: () => void;
  title?: string;
  actionLabel?: string;
}) {
  const t = useT();
  const probeNetworkBlocked = reason === "blocked-probe-network";
  const titleText = probeNetworkBlocked
    ? t("window.browser.embedProbeNetworkTitle")
    : title ?? t("window.browser.embedBlockedTitle");
  const actionText = actionLabel ?? t("window.browser.openOriginal");

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep original */
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--ink-soft)]">
        <ShieldAlert size={28} />
      </div>
      <p className="text-[15px] font-semibold text-[var(--ink)]">{titleText}</p>
      <p className="mt-1 max-w-[320px] text-[12px] leading-relaxed text-[var(--ink-soft)]">
        <span className="font-medium text-[var(--ink)]">{host}</span>{" "}
        {t(probeNetworkBlocked ? "window.browser.embedProbeNetworkBody" : "window.browser.embedBlockedBody")}
      </p>
      {reason && !probeNetworkBlocked ? (
        <p className="mt-2 max-w-[320px] text-[11px] leading-relaxed text-[var(--ink-faint)]">{reason}</p>
      ) : null}

      <a
        href={safeHttpUrl(url) || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="press mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)]"
      >
        <ExternalLink size={15} /> {actionText}
      </a>

      <button
        type="button"
        onClick={onForce}
        className="press mt-3 text-[11.5px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
      >
        {t("window.browser.forceEmbed")}
      </button>
    </div>
  );
}
