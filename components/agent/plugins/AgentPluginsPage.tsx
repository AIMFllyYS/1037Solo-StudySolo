"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import PluginEntryCard from "./PluginEntryCard";
import LearningConnectionsPanel from "@/components/plugins/LearningConnectionsPanel";
import { LearningConnectionsProvider } from "@/components/plugins/LearningConnectionsContext";
import { SkillPackagesProvider, useSkillPackages } from "./SkillPackagesContext";
import {
  filterMarketEntries,
  useMarketManifest,
  type CliEntry,
  type MarketEntry,
  type MarketSection,
} from "@/lib/plugins/market";
import { useLocale, useT } from "@/lib/i18n";

type CliFilter = "all" | CliEntry["kind"];

const TAB_ORDER: readonly MarketSection[] = ["mcp", "skills"];

/**
 * 插件市场（/agent/plugins）：三板块 tab + 搜索 + 卡片网格。
 * 数据来自 public/plugins/market.json（useMarketManifest 模块级缓存一次请求）。
 */
export default function AgentPluginsPage() {
  return <LearningConnectionsProvider><SkillPackagesProvider><MarketContents /></SkillPackagesProvider></LearningConnectionsProvider>;
}

function MarketContents() {
  const t = useT();
  const locale = useLocale();
  const packages = useSkillPackages();
  const { manifest, loading, error } = useMarketManifest();
  const [tab, setTab] = useState<MarketSection>("mcp");
  const [query, setQuery] = useState("");
  /** 仅 CLI 板块内的二级筛选（工具 / skill 包），切走自动复位。 */
  const [cliKind, setCliKind] = useState<CliFilter>("all");

  const counts = useMemo(
    () => ({
      mcp: manifest?.mcp.filter(entry => entry.connector || entry.id === "kitsolo").length ?? 0,
      cli: manifest?.cli.length ?? 0,
      skills: manifest?.skills.filter(entry => entry.runtime !== "cloud" || packages.ready).length ?? 0,
    }),
    [manifest, packages.ready],
  );

  const visible = useMemo(() => {
    if (!manifest) return [];
    let entries = manifest[tab] as MarketEntry[];
    if (tab === "mcp") entries = manifest.mcp.filter(entry => entry.connector || entry.id === "kitsolo");
    if (tab === "skills") entries = manifest.skills.filter(entry => entry.runtime !== "cloud" || packages.ready);
    if (tab === "cli" && cliKind !== "all") {
      entries = (entries as CliEntry[]).filter((e) => e.kind === cliKind);
    }
    return filterMarketEntries(entries, query);
  }, [manifest, tab, cliKind, query, packages.ready]);

  const total = tab === "cli" && cliKind !== "all" ? visible.length : counts[tab];

  return (
    <section
      data-testid="agent-plugins-page"
      className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--agent-content-bg,var(--md-sys-color-surface-container-low))]"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2.5">
        <h1 className="text-[15px] font-semibold text-[var(--ink)]">{t("agent.market.title")}</h1>
        <span className="text-[11.5px] text-[var(--ink-faint)]">{t("agent.market.subtitle")}</span>
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-1.5">
          <label className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-[var(--line-soft)] px-2">
            <Search size={14} className="shrink-0 text-[var(--ink-faint)]" />
            <input
              data-testid="plugins-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("agent.market.search")}
              aria-label={t("agent.market.search")}
              className="min-w-0 w-[190px] max-w-full bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            />
          </label>
        </div>
      </header>

      <div
        className="hide-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--line-soft)] px-3 py-2"
        role="tablist"
        aria-label={t("agent.market.title")}
      >
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`plugins-tab-${id}`}
            onClick={() => {
              setTab(id);
              setCliKind("all");
            }}
            className={`press shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ${
              tab === id
                ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            }`}
          >
            {t(`agent.market.tabs.${id}`)}
            <span className="ml-1 text-[11px] text-[var(--ink-faint)]">{counts[id]}</span>
          </button>
        ))}
        {tab === "cli" ? (
          <div className="ml-1 flex items-center gap-1 border-l border-[var(--line-soft)] pl-2" role="group" aria-label="CLI 筛选">
            {(["all", "cli", "skill-pack"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                data-testid={`plugins-cli-filter-${kind}`}
                aria-pressed={cliKind === kind}
                onClick={() => setCliKind(kind)}
                className={`press shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] ${
                  cliKind === kind
                    ? "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--ink)]"
                    : "text-[var(--ink-faint)] hover:bg-[var(--bg-muted)]"
                }`}
              >
                {kind === "all" ? t("agent.market.filterAll") : t(kind === "cli" ? "agent.market.badge.cli" : "agent.market.badge.skillPack")}
              </button>
            ))}
          </div>
        ) : null}
        <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">{t("agent.market.count", { count: total })}</span>
      </div>

      <p className="shrink-0 border-b border-[var(--line-soft)] px-5 py-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
        {t(`agent.market.tabHint.${tab}`)}
      </p>

      <div data-testid="plugins-body" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {tab === "mcp" && <LearningConnectionsPanel />}
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4" role="status" aria-label={t("agent.market.loading")}>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex h-[150px] flex-col gap-2.5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
                <div className="h-9 w-9 animate-shimmer rounded-xl bg-[var(--bg-muted)]" />
                <div className="h-3.5 w-[70%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                <div className="h-3 w-[45%] animate-shimmer rounded bg-[var(--bg-muted)]" />
              </div>
            ))}
          </div>
        ) : error || !manifest ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-[var(--ink-soft)]">{t("agent.market.loadError")}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-[var(--ink-soft)]">{t("agent.market.empty", { query: query.trim() })}</p>
            <button type="button" onClick={() => setQuery("")} className="text-[12px] text-[var(--md-sys-color-primary)]">
              {t("agent.market.clearSearch")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4" data-testid="plugins-grid">
            {visible.map((entry) => (
              <PluginEntryCard key={entry.id} entry={entry} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
