"use client";

import { Link2 } from "lucide-react";
import { useAgentCenter } from "@/lib/stores/workspace/agentCenter";
import { useT } from "@/lib/i18n";

/**
 * 顶栏的「来源」开关（夹在分享与全屏之间）。
 *
 * 它只管那块**看起来像悬浮卡片、实际占真实宽度**的来源列显示与否；
 * 右栏（统一面板）有自己的开关，两者互不替代。
 */
export default function SourcesPanelToggle() {
  const t = useT();
  const open = useAgentCenter((state) => state.sourcesPanelOpen);
  const toggle = useAgentCenter((state) => state.toggleSourcesPanel);
  const label = open ? t("app.sourcesToggle.hide") : t("app.sourcesToggle.show");

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={open}
      data-testid="agent-sources-toggle"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
    >
      <Link2 size={17} />
    </button>
  );
}
