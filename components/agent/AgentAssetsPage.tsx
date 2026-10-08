"use client";

import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiReducedMotion } from "@/lib/hooks/useUiReducedMotion";
import { LayoutGrid, List, RefreshCw, Search } from "lucide-react";
import AgentAssetCard from "./AgentAssetCard";
import SharedLinksPanel from "@/components/share/SharedLinksPanel";
import CloudFilesPanel from './CloudFilesPanel';
import AssetTrashPanel from './AssetTrashPanel';
import AssetSyncIssues from './AssetSyncIssues';
import {useAssetIndex} from '@/lib/assets/library';
import { useAgentAssets } from "@/lib/hooks/useAgentAssets";
import { useIsClient } from "@/lib/hooks/useIsClient";
import { useMinimumSkeleton } from "@/lib/hooks/useMinimumSkeleton";
import { LAYOUT_REFLOW, reflowItemProps } from "@/lib/motion";
import {
  ASSET_KINDS,
  ASSET_KIND_LABELS,
  assetCounts,
  filterAssets,
  type AssetKind,
  type AssetSort,
} from "@/lib/agent/assetCatalog";
import { useT } from "@/lib/i18n";
import { useCloudFileLibrary } from '@/lib/files/library';
import { useClassroomAssets } from '@/lib/agent/classroomAssets';
import { useToast } from '@/lib/stores/toast';

type ViewMode = "grid" | "list";
type KindFilter = AssetKind | "all";
/**
 * 顶级标签：本机资产的六类 + 「全部」，再加一个**不是资产**的「分享的链接」。
 * 分享只借这一行标签的位置，不参与 filterAssets / assetCounts —— 硬塞进 ASSET_KINDS
 * 会让「六类本机产物」的计数与筛选一起变形（详见 SharedLinksPanel 顶部注释）。
 */
type AssetsTab = KindFilter | "share" | 'cloud' | 'trash';

const VIEW_STORAGE_KEY = "agent-assets-view";

const SORT_LABELS: Record<AssetSort, string> = { recent: "最近更新", title: "按名称" };

/** 视图偏好只在本机生效；读不到就用橱窗（隐私模式下 localStorage 会抛）。 */
function readStoredView(): ViewMode {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw === "grid" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return "grid";
}

function writeStoredView(view: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

/**
 * 我的资产：顶部标签（全部 + 六类 + 分享的链接）+ 最右视图切换/搜索/排序，主体是橱窗或列表。
 * 橱窗**不预览内容**：只给图标与标题，点卡片跳到 /agent/assets/{kind}/{id} 详情页。
 *
 * 合并本机产物、云端文件和课堂元数据，以来源角标说明保存状态。
 * 「分享的链接」例外：那是云端数据，选中它时整块换成 SharedLinksPanel，
 * 视图切换 / 搜索 / 排序 / 刷新这些**只对本机产物有意义**的控件同时收起
 * ——留着它们既筛不动分享列表，点了还会悄悄改一个看不见的资产筛选状态。
 */
export default function AgentAssetsPage() {
  const t = useT();
  const mounted = useIsClient();
  const assets = useAgentAssets();
  const cloud = useCloudFileLibrary();
  const assetIndex=useAssetIndex();
  const classrooms = useClassroomAssets();
  const refreshClassrooms = classrooms.refresh;
  useEffect(() => { void refreshClassrooms(); }, [refreshClassrooms]);
  const [activeTabChoice, setActiveTab] = useState<AssetsTab | null>(null);
  const requestedTab = mounted ? new URLSearchParams(window.location.search).get('tab') : null;
  const activeTab: AssetsTab = activeTabChoice ?? (requestedTab === 'cloud' || requestedTab === 'trash' ? requestedTab : 'all');
  const onShareTab = activeTab === "share";
  const onCloudTab = activeTab === 'cloud';
  const remoteTab = onShareTab;
  /** 分享标签下不筛资产；这里固定成 all 只是让下面 useMemo 的依赖保持稳定。 */
  const kind: KindFilter = onShareTab || onCloudTab || activeTab==='trash' ? "all" : activeTab;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AssetSort>("recent");
  /**
   * 视图偏好是纯 UI 选择：放 localStorage，不动 store。
   * 不在 effect 里 setState（会触发级联渲染，也过不了 lint）：挂载前固定按橱窗渲染，
   * 挂载后按持久化偏好，用户点过就以点击结果为准。
   */
  const [viewChoice, setViewChoice] = useState<ViewMode | null>(null);
  const view: ViewMode = viewChoice ?? (mounted ? readStoredView() : "grid");
  const [refreshing, setRefreshing] = useState(false);
  /** 系统开了「减少动态效果」就退回静态：不加 layout 动画、不做进出场。 */
  const reducedMotion = useUiReducedMotion();

  const chooseView = (next: ViewMode) => {
    setViewChoice(next);
    writeStoredView(next);
  };

  /** 数据就绪后再压一小段（约 1 秒）骨架：本机水合太快，直接换内容会显得跳。 */
  const showSkeleton = useMinimumSkeleton({ ready: assets !== null });
  const remoteLoading = !!cloud.owner && (cloud.phase === 'idle' || cloud.phase === 'loading' || classrooms.phase === 'idle' || classrooms.phase === 'loading' || assetIndex.loading);
  const counts = useMemo(() => assetCounts(assets ?? []), [assets]);
  const visible = useMemo(
    () => filterAssets(assets ?? [], { kind, query, sort }),
    [assets, kind, query, sort],
  );

  /** 刷新只做一件事：重新拉一次云端行，让同步角标变准（内容本来就在本机）。 */
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.all([cloud.refresh(), useAssetIndex.getState().refresh(), classrooms.refresh(), import('@/lib/sync/schedule').then(mod => mod.refreshCloudSyncNow())])
      .catch(() => { useToast.getState().show('部分资产来源刷新失败，已有数据保留，请查看错误提示。'); })
      .finally(() => setRefreshing(false));
  };

  /**
   * 卡片渲染器：外层一律是 motion.div + layout —— 切标签时同一张卡在新版式里的位置变了，
   * framer-motion 会把它从旧位置**滑**到新位置；进出的卡由 AnimatePresence 接管（popLayout：
   * 退场的先脱离文档流，剩下的立刻开始重排，不会先卡一下再动）。
   */
  const renderCards = (mode: "grid" | "list") => (
    <AnimatePresence initial={false} mode="popLayout">
      {visible.map((item) => (
        <motion.div
          key={`${item.kind}-${item.id}`}
          data-testid={`asset-cell-${item.kind}-${item.id}`}
          {...reflowItemProps(reducedMotion)}
          className="min-w-0"
        >
          <AgentAssetCard item={item} view={mode} />
        </motion.div>
      ))}
    </AnimatePresence>
  );

  const tabs: { id: AssetsTab; label: string; count?: number }[] = [
    { id: "all", label: "全部", count: counts.all },
    ...ASSET_KINDS.map((item) => ({ id: item as AssetsTab, label: ASSET_KIND_LABELS[item], count: counts.byKind[item] })),
    // 分享不是本机资产：独立顶级标签，也没有本地计数（条数得联网才知道，不在这里假装有）。
    { id: "share", label: t("share.assets.tab") },
    { id: 'trash', label: '回收站' },
    { id: 'cloud', label: '云端文件', count: cloud.files.filter(file => file.state === 'ready' || file.state === 'pending').length },
  ];

  return (
    <section data-testid="agent-assets-page" className="flex h-full min-h-0 flex-col bg-[var(--agent-content-bg,var(--md-sys-color-surface-container-low))]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2.5">
        <h1 className="text-[15px] font-semibold text-[var(--ink)]">我的资产</h1>
        {remoteTab ? null : (
          <span className="text-[11.5px] text-[var(--ink-faint)]">
            {counts.all} 项 · 本机与云端资产，来源角标显示保存状态
          </span>
        )}
        {remoteTab ? null : (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--line-soft)] p-0.5">
              <button
                type="button"
                data-testid="assets-view-grid"
                aria-pressed={view === "grid"}
                aria-label="橱窗视图"
                title="橱窗视图"
                onClick={() => chooseView("grid")}
                className={`flex h-7 w-7 items-center justify-center rounded-md ${view === "grid" ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                data-testid="assets-view-list"
                aria-pressed={view === "list"}
                aria-label="列表视图"
                title="列表视图"
                onClick={() => chooseView("list")}
                className={`flex h-7 w-7 items-center justify-center rounded-md ${view === "list" ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"}`}
              >
                <List size={15} />
              </button>
            </div>
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-soft)] px-2">
              <Search size={14} className="shrink-0 text-[var(--ink-faint)]" />
              <input
                data-testid="assets-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、科目、路径或网址"
                aria-label="搜索资产"
                className="w-[min(190px,40vw)] min-w-0 bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
              />
            </label>
            <select
              data-testid="assets-sort"
              value={sort}
              aria-label="排序方式"
              onChange={(event) => setSort(event.target.value as AssetSort)}
              className="h-8 rounded-lg border border-[var(--line-soft)] bg-transparent px-2 text-[12.5px] text-[var(--ink-soft)] outline-none"
            >
              {(Object.keys(SORT_LABELS) as AssetSort[]).map((key) => (
                <option key={key} value={key}>{SORT_LABELS[key]}</option>
              ))}
            </select>
            <button
              type="button"
              data-testid="assets-refresh"
              onClick={refresh}
              title="重新对齐云端状态"
              aria-label="重新对齐云端状态"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
            </button>
          </div>
        )}
      </header>

      <div className="hide-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--line-soft)] px-3 py-2" role="tablist" aria-label="资产类型">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`assets-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`press shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ${
              activeTab === tab.id
                ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            }`}
          >
            {tab.label}
            {/* 分享标签不挂本地计数：条数得联网才知道，不在这里假装有。 */}
            {tab.count === undefined ? null : (
              <span className="ml-1 text-[11px] text-[var(--ink-faint)]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div
        data-testid="assets-body"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        // 骨架只描述本机资产的水合；分享面板自带加载态，别让两者互相等。
        aria-busy={(onShareTab ? false : onCloudTab ? cloud.phase === 'loading' : showSkeleton || remoteLoading) || undefined}
      >
        {!onShareTab && !onCloudTab && assetIndex.error ? <p role="alert" className="mb-3 text-xs">{assetIndex.error} 本机内容保留。</p> : null}
        {!onShareTab && <AssetSyncIssues />}
        {!onShareTab && !onCloudTab && cloud.error ? <p role="alert" className="mb-3 text-xs text-[var(--md-sys-color-error)]">{cloud.error} 已有本机资产仍可查看。</p> : null}
        {!onShareTab && !onCloudTab && remoteLoading ? <p role="status" className="mb-3 text-xs text-[var(--ink-soft)]">正在读取云端资产，已有本机内容可继续查看；当前计数尚未完整。</p> : null}
        {!onShareTab && !onCloudTab && classrooms.error ? <p role="alert" className="mb-3 text-xs text-[var(--md-sys-color-error)]">{classrooms.error}</p> : null}
        {activeTab === 'trash' ? <AssetTrashPanel /> : onCloudTab ? <CloudFilesPanel query={query} sort={sort} view={view} /> : onShareTab ? (
          <SharedLinksPanel />
        ) : showSkeleton ? (
          // 五个 store（笔记/闪卡/长文/演示/导入记录）要等 IndexedDB 水合完才给数据；
          // 这段骨架**跟着视图走**：橱窗给卡片骨架，列表给行骨架，切过来不会先闪一下另一种版式。
          <div
            role="status"
            aria-label="资产加载中"
            data-testid="assets-skeleton"
            className="animate-fade-up"
          >
            {view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className="flex h-[188px] flex-col gap-2.5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4"
                  >
                    <div className="h-11 w-11 animate-shimmer rounded-xl bg-[var(--bg-muted)]" />
                    <div className="h-3.5 w-[70%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                    <div className="h-3.5 w-[45%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                    <div className="mt-auto flex items-center justify-between">
                      <div className="h-3 w-[38%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                      <div className="h-4 w-12 animate-shimmer rounded-full bg-[var(--bg-muted)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 10 }, (_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <div className="h-8 w-8 animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="h-3 w-[42%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                      <div className="h-3 w-[26%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                    </div>
                    <div className="h-3 w-16 animate-shimmer rounded bg-[var(--bg-muted)]" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-[var(--ink-soft)]">
              {query.trim()
                ? `没有匹配「${query.trim()}」的资产`
                : remoteLoading ? '云端资产仍在加载，请稍候。' : cloud.error || classrooms.error || assetIndex.error ? '当前来源未完整读取，请重试刷新。' : kind === "all"
                  ? "还没有资产。让 Agent 整理笔记、出闪卡、写长文或生成演示，就会出现在这里。"
                  : `还没有${ASSET_KIND_LABELS[kind as AssetKind]}。`}
            </p>
            {query.trim() ? (
              <button type="button" onClick={() => setQuery("")} className="text-[12px] text-[var(--md-sys-color-primary)]">
                清空搜索
              </button>
            ) : null}
          </div>
        ) : view === "grid" ? (
          <motion.div
            layout={!reducedMotion}
            transition={LAYOUT_REFLOW}
            className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"
            data-testid="assets-grid"
          >
            {renderCards("grid")}
          </motion.div>
        ) : (
          <motion.div
            layout={!reducedMotion}
            transition={LAYOUT_REFLOW}
            className="flex flex-col gap-0.5"
            data-testid="assets-list"
          >
            {renderCards("list")}
          </motion.div>
        )}
      </div>
    </section>
  );
}
