"use client";

import { useMemo, useState } from "react";
import { Blocks, SearchX } from "lucide-react";
import PluginEntryCard from "./PluginEntryCard";
import LearningConnectionsPanel from "@/components/plugins/LearningConnectionsPanel";
import { LearningConnectionsProvider } from "@/components/plugins/LearningConnectionsContext";
import { SkillPackagesProvider, useSkillPackages } from "./SkillPackagesContext";
import ActionButton from "@/components/ui/ActionButton";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import { EmptyState, PageHeader, PageShell, SearchField } from "@/components/ui/PageChrome";
import { PanelSkeleton } from "@/components/shared/LoadingStates";
import {
  filterMarketEntries,
  useMarketManifest,
  type MarketEntry,
  type MarketSection,
} from "@/lib/plugins/market";
import { useLocale, useT } from "@/lib/i18n";

/** 市场里对用户开放的两个板块（工具 / CLI 条目仍可经详情路由访问，但不在这里列出）。 */
const TAB_ORDER = ["mcp", "skills"] as const satisfies readonly MarketSection[];

/**
 * 插件市场（/agent/plugins）：板块标签 + 搜索 + 卡片网格。
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
  const [tab, setTab] = useState<(typeof TAB_ORDER)[number]>("mcp");
  const [query, setQuery] = useState("");

  /** 每个板块真正可见的条目：学习服务只列已接入连接器的；云端技能要等运行时核验通过。 */
  const listed = useMemo<Record<(typeof TAB_ORDER)[number], MarketEntry[]>>(
    () => ({
      mcp: manifest?.mcp.filter(entry => entry.connector || entry.id === "kitsolo") ?? [],
      skills: manifest?.skills.filter(entry => entry.runtime !== "cloud" || packages.ready) ?? [],
    }),
    [manifest, packages.ready],
  );
  const visible = useMemo(() => filterMarketEntries(listed[tab], query), [listed, tab, query]);

  return (
    <PageShell data-testid="agent-plugins-page">
      <PageHeader
        icon={Blocks}
        title={t("agent.market.title")}
        description={t("agent.market.subtitle")}
        actions={<SearchField testId="plugins-search" value={query} onChange={setQuery} placeholder={t("agent.market.search")} ariaLabel={t("agent.market.search")} />}
      />

      <SegmentedTabs
        ariaLabel={t("agent.market.title")}
        value={tab}
        onChange={setTab}
        tabs={TAB_ORDER.map((id) => ({ id, label: t(`agent.market.tabs.${id}`), count: listed[id].length, testId: `plugins-tab-${id}` }))}
        trailing={t("agent.market.count", { count: visible.length })}
        className="border-b border-[var(--line-soft)]"
      />

      <div data-testid="plugins-body" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col px-5 pb-8 pt-4">
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-faint)]">{t(`agent.market.tabHint.${tab}`)}</p>
          {tab === "mcp" && <LearningConnectionsPanel />}
          {loading ? (
            <div className="-mx-5 h-[320px]">
              <PanelSkeleton variant="cards" label={t("agent.market.loading")} />
            </div>
          ) : error || !manifest ? (
            <EmptyState title={t("agent.market.loadError")} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t("agent.market.empty", { query: query.trim() })}
              action={<ActionButton variant="secondary" onClick={() => setQuery("")}>{t("agent.market.clearSearch")}</ActionButton>}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4" data-testid="plugins-grid">
              {visible.map((entry) => (
                <PluginEntryCard key={entry.id} entry={entry} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
