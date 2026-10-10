"use client";

import { motion } from "framer-motion";
import { useUiReducedMotion } from "@/lib/hooks/useUiReducedMotion";
import { WEB_SEARCH_PROVIDER_LABELS, type ProviderChip } from "@/lib/chat/webSearchDisplay";

/**
 * 分源状态点：Kimi / 智谱 / Perplexity 各自一颗。
 * running = 脉冲点（正在搜）；done = 实心点（已出结果）；skipped = 灰态 + title 给原因。
 */
export function WebSearchProviderChips({ chips }: { chips: readonly ProviderChip[] }) {
  const reducedMotion = useUiReducedMotion();
  if (!chips.length) return null;
  return (
    <span className="web-search-chips" role="list">
      {chips.map((chip) => (
        <span
          key={chip.provider}
          role="listitem"
          className="web-search-chip"
          data-state={chip.state}
          title={chip.reason || undefined}
        >
          <motion.span
            aria-hidden="true"
            className="web-search-chip-dot"
            animate={chip.state === "running" && !reducedMotion ? { opacity: [0.35, 1, 0.35], scale: [0.82, 1, 0.82] } : { opacity: 1, scale: 1 }}
            transition={chip.state === "running" && !reducedMotion ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
          />
          {WEB_SEARCH_PROVIDER_LABELS[chip.provider]}
        </span>
      ))}
    </span>
  );
}
