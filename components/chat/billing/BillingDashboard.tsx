"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, PieChart as PieChartIcon, ArrowRightLeft } from "lucide-react";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useBillingStore, getProviderCategoryName } from "@/lib/stores/billing";
import { useSettings } from "@/lib/stores/settings";
import ManagedWindow from "@/components/window/ManagedWindow";
import { useVirtualizer } from "@tanstack/react-virtual";
import React from "react";
import clsx from "clsx";
import { refreshBillingFromLedger } from "@/lib/billing/syncUsageLedger";
import { costCnyToUsd, filterLedgerByRange } from "@/lib/billing/ledgerView";
import { useT } from "@/lib/i18n/index";

type TimeRange = "7d" | "30d" | "all";

export default function BillingDashboardLayer() {
  const windows = useWindowManager((s) => s.windows);
  const win = windows.find((w) => w.type === "billing-dashboard");

  if (!win) return null;

  return <BillingDashboardWindow winId={win.id} />;
}

function ProviderStatCard({
  stat,
  exchangeRate,
}: {
  stat: { category: string; name: string; cost: number; count: number; tokens: number };
  exchangeRate: number;
}) {
  const t = useT();
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="group relative min-w-[160px] shrink-0" style={{ perspective: "1000px" }}>
      {/* 3D 翻转容器 */}
      <div
        className="relative flex h-full w-full flex-col transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* 正面 (人民币) */}
        <div
          className="flex h-full flex-col rounded-lg border border-[var(--line)] bg-white p-3 dark:bg-[#222]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-[var(--ink-soft)]" title={stat.name}>
              {stat.name}
            </span>
            <button
              onClick={() => setFlipped(true)}
              className="shrink-0 rounded p-1 text-[var(--ink-faint)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--ink-soft)]"
            >
              <ArrowRightLeft size={12} />
            </button>
          </div>
          <span className="mt-1 text-lg font-semibold text-[var(--ink)]">
            ¥{stat.cost.toFixed(4)}
          </span>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--ink-faint)]">
            <span className="shrink-0">{t("panel.billing.calls", { count: stat.count })}</span>
            {stat.tokens > 0 && <span className="truncate">{(stat.tokens / 1000).toFixed(1)}k tokens</span>}
          </div>
        </div>

        {/* 背面 (美元) */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg border border-[var(--line)] bg-white p-3 dark:bg-[#222]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-[var(--ink-soft)]" title={stat.name}>
              {stat.name}
            </span>
            <button
              onClick={() => setFlipped(false)}
              className="shrink-0 rounded p-1 text-[var(--ink-faint)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--ink-soft)]"
            >
              <ArrowRightLeft size={12} />
            </button>
          </div>
          <span className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-500">
            ${costCnyToUsd(stat.cost, exchangeRate).toFixed(4)}
          </span>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--ink-faint)]">
            <span className="shrink-0">{t("panel.billing.calls", { count: stat.count })}</span>
            {stat.tokens > 0 && <span className="truncate">{(stat.tokens / 1000000).toFixed(2)}M tokens</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingDashboardWindow({ winId }: { winId: string }) {
  const t = useT();
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === winId));
  const closeWindow = useWindowManager((s) => s.closeWindow);

  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const { records, exportToCsv } = useBillingStore();
  const customGroups = useSettings((s) => s.customApiGroups);
  const usdExchangeRate = useSettings((s) => s.usdExchangeRate);

  useEffect(() => {
    void refreshBillingFromLedger();
  }, []);

  const filteredRecords = useMemo(
    () => filterLedgerByRange(records, timeRange),
    [records, timeRange],
  );

  const providerStats = useMemo(() => {
    const stats: Record<string, { cost: number; count: number; tokens: number }> = {};
    for (const r of filteredRecords) {
      if (!stats[r.providerCategory]) {
        stats[r.providerCategory] = { cost: 0, count: 0, tokens: 0 };
      }
      stats[r.providerCategory].cost += r.cost;
      stats[r.providerCategory].count += 1;
      stats[r.providerCategory].tokens += (r.totalTokens || 0);
    }
    return Object.entries(stats).map(([category, s]) => ({
      category,
      name: getProviderCategoryName(category, customGroups),
      ...s,
    })).sort((a, b) => b.cost - a.cost);
  }, [filteredRecords, customGroups]);

  // Chart data: 按日聚合（短跨度）或按月聚合（长跨度），key 含年份避免跨年碰撞
  const chartData = useMemo(() => {
    if (filteredRecords.length === 0) return [];

    const now = Date.now();
    let days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 0;

    if (days === 0) {
      const oldest = filteredRecords[filteredRecords.length - 1].timestamp;
      days = Math.max(7, Math.ceil((now - oldest) / (1000 * 60 * 60 * 24)));
    }

    // 跨度 > 60 天按月聚合，避免数百根 1px 柱无法辨认；否则按日
    const useMonthly = days > 60;
    const buckets: Record<string, number> = {};

    if (useMonthly) {
      const oldestTs = filteredRecords[filteredRecords.length - 1].timestamp;
      const start = new Date(oldestTs);
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now);
      while (cur <= end) {
        buckets[`${cur.getFullYear()}-${cur.getMonth() + 1}`] = 0;
        cur.setMonth(cur.getMonth() + 1);
      }
      for (const r of filteredRecords) {
        const d = new Date(r.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (buckets[key] !== undefined) buckets[key] += r.cost;
      }
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        buckets[key] = 0;
      }
      for (const r of filteredRecords) {
        const d = new Date(r.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        if (buckets[key] !== undefined) buckets[key] += r.cost;
      }
    }

    const maxVal = Math.max(...Object.values(buckets), 0.01);

    return Object.entries(buckets).map(([key, val]) => {
      const parts = key.split("-");
      // 月聚合显示 "YYYY/M"；日聚合显示 "M/D"（短跨度无需年份）
      const displayDate = useMonthly ? `${parts[0]}/${parts[1]}` : `${parts[1]}/${parts[2]}`;
      return { date: displayDate, val, pct: (val / maxVal) * 100 };
    });
  }, [filteredRecords, timeRange]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    useFlushSync: false,
    count: filteredRecords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  if (!managed) return null;

  return (
    <ManagedWindow
      windowId={winId}
      title={managed.title}
      icon={<PieChartIcon size={15} />}
      onClose={() => closeWindow(winId)}
      fullscreenTarget="viewport"
      minSize={{ minW: 500, minH: 350 }}
      overlayId="billing-dashboard"
      actions={
        <button
          type="button"
          data-no-drag
          onClick={() => exportToCsv(customGroups)}
          title={t("panel.billing.exportCsv")}
          className="press flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]"
        >
          <Download size={13} />
          <span className="hidden sm:inline">{t("panel.billing.exportRecords")}</span>
        </button>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
        <div className="flex h-full flex-col bg-[var(--bg-surface)] text-[var(--ink)]">
          {/* Header Controls */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-panel)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex rounded-md bg-[var(--bg-muted)] p-0.5">
                {(["7d", "30d", "all"] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={clsx(
                      "rounded px-3 py-1 text-xs font-medium transition-colors",
                      timeRange === range
                        ? "bg-white text-[var(--ink)] shadow-sm dark:bg-[#333]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                    )}
                  >
                    {range === "7d" ? t("panel.billing.range.d7") : range === "30d" ? t("panel.billing.range.d30") : t("panel.billing.range.all")}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-[var(--ink-faint)]">
              {t("panel.billing.recordCount", { count: filteredRecords.length })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 gap-4">
            {/* Top Cards: Provider Stats */}
            <div className="flex shrink-0 gap-3 overflow-x-auto scrollbar-thin">
              {providerStats.map((stat) => (
                <ProviderStatCard key={stat.category} stat={stat} exchangeRate={usdExchangeRate} />
              ))}
              {providerStats.length === 0 && (
                <div className="text-sm text-[var(--ink-faint)] p-2">{t("panel.billing.empty")}</div>
              )}
            </div>

            {/* Middle: Mini Chart */}
            {chartData.length > 0 && (
              <div className="shrink-0 rounded-lg border border-[var(--line)] bg-white p-4 dark:bg-[#222]">
                <div className="mb-2 text-xs font-medium text-[var(--ink-soft)]">{t("panel.billing.trend")}</div>
                <div className="flex h-24 items-end gap-[2px] sm:gap-1">
                  {chartData.map((d, i) => (
                    <div
                      key={i}
                      className="group relative flex flex-1 h-full flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t-[2px] bg-[var(--md-sys-color-primary)] opacity-80 transition-all hover:opacity-100"
                        style={{ height: `${Math.max(d.pct, 2)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white group-hover:block">
                        {d.date} - ¥{d.val.toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-faint)]">
                  <span>{chartData[0]?.date}</span>
                  <span>{chartData[chartData.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Bottom: Virtualized Table */}
            <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--line)] bg-white dark:bg-[#222] overflow-hidden">
              <div className="flex-1 overflow-x-auto scrollbar-thin relative">
                <div className="h-full flex flex-col min-w-[740px]">
                  <div className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2 text-xs font-medium text-[var(--ink-soft)]">
                    <div className="w-[120px] shrink-0">{t("panel.billing.column.time")}</div>
                    <div className="w-[160px] shrink-0">{t("panel.billing.column.model")}</div>
                    <div className="w-[80px] shrink-0">{t("panel.billing.column.type")}</div>
                    <div className="w-[140px] shrink-0 text-right">{t("panel.billing.column.tokens")}</div>
                    <div className="w-[100px] shrink-0 text-right">{t("panel.billing.column.cost")}</div>
                    <div className="min-w-[100px] flex-1 text-right">{t("panel.billing.column.provider")}</div>
                  </div>
                  <div ref={parentRef} className="flex-1 overflow-y-auto scrollbar-thin">
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                      }}
                    >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const record = filteredRecords[virtualRow.index];
                    const isImage = record.type === "image";
                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute left-0 top-0 flex w-full items-center border-b border-[var(--line)] px-3 text-xs hover:bg-[var(--bg-muted)]"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div className="w-[120px] shrink-0 text-[var(--ink-soft)]">
                          {new Date(record.timestamp).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "numeric",
                            minute: "numeric",
                          })}
                        </div>
                        <div className="w-[160px] shrink-0 truncate font-medium text-[var(--ink)]" title={record.modelLabel}>
                          {record.modelLabel}
                        </div>
                        <div className="w-[80px] shrink-0">
                          <span className={clsx(
                            "rounded px-1.5 py-0.5 text-[10px]",
                            isImage ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" 
                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          )}>
                            {t(isImage ? "panel.billing.typeImage" : "panel.billing.typeChat")}
                          </span>
                        </div>
                        <div className="w-[140px] shrink-0 text-right font-mono text-[11px] text-[var(--ink-faint)]">
                          {isImage ? (
                            // imageCount 在账单里是可选的：String() 让渲染结果与旧模板字面量逐字一致。
                            t("panel.billing.imageCount", { count: String(record.imageCount) })
                          ) : (
                            <>
                              <span className="text-[var(--ink-soft)]">{record.promptTokens}</span>/
                              <span className="text-[var(--ink-soft)]">{record.completionTokens}</span>/
                              <span className="text-emerald-600 dark:text-emerald-500">{record.cachedTokens}</span>
                            </>
                          )}
                        </div>
                        <div className="w-[100px] shrink-0 text-right font-mono text-[var(--ink)]">
                          ¥{record.cost.toFixed(6)}
                        </div>
                        <div className="min-w-[100px] flex-1 truncate text-right text-[11px] text-[var(--ink-faint)]" title={getProviderCategoryName(record.providerCategory, customGroups)}>
                          {getProviderCategoryName(record.providerCategory, customGroups)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                </div>
              </div>
            </div>
          </div>
        </div>

    </ManagedWindow>
  );
}
