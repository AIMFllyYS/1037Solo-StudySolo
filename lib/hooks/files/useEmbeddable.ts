"use client";

import { useEffect, useState } from "react";
import { getCachedEmbed, probeCanEmbed } from "@/lib/browser/canEmbed";

export function useEmbeddable(url: string | null) {
  const [forced, setForced] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ url: string; embeddable: boolean; reason?: string } | null>(null);

  const skip = !url || forced === url;
  const cached = !skip && url ? getCachedEmbed(url) : undefined;
  const live = cached ?? (probe && url && probe.url === url
    ? { embeddable: probe.embeddable, reason: probe.reason }
    : undefined);

  useEffect(() => {
    if (!url || forced === url) return;
    if (getCachedEmbed(url)) return;
    let alive = true;
    probeCanEmbed(url).then((verdict) => {
      if (!alive || forced === url) return;
      setProbe({ url, embeddable: verdict.embeddable, reason: verdict.reason });
    });
    return () => {
      alive = false;
    };
  }, [url, forced]);

  return {
    blocked: skip ? false : live ? !live.embeddable : false,
    reason: skip ? undefined : live?.reason,
    forceEmbed: () => {
      if (url) setForced(url);
    },
  };
}
