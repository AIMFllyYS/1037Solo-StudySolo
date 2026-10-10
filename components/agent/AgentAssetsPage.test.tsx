import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n";
import type { AssetItem } from "@/lib/agent/assetCatalog";

const fixtures: AssetItem[] = [
  { id: "n1", kind: "note", title: "组胚笔记", subtitle: "组织学 · 个人笔记", updatedAt: 300, origin: "both" },
  { id: "c1", kind: "flashcard", title: "被覆上皮怎么分？", subtitle: "组织学 · 已就绪", updatedAt: 200, origin: "local" },
  { id: "i1", kind: "file", title: "lecture.pdf", subtitle: "application/pdf", updatedAt: 100, origin: "local", meta: { absPath: "D:\\课件\\lecture.pdf" } },
];

const assetsRef: { value: AssetItem[] | null } = { value: fixtures };

vi.mock("@/lib/hooks/files/useAgentAssets", () => ({ useAgentAssets: () => assetsRef.value }));
vi.mock("@/lib/hooks/runtime/useIsClient", () => ({ useIsClient: () => true }));
/** 最小骨架时长：默认在本文件里关掉（否则每个用例都要等 900ms），单独一条用例再打开。 */
const skeletonOn = { value: false };
vi.mock("@/lib/hooks/layout/useMinimumSkeleton", () => ({ useMinimumSkeleton: () => skeletonOn.value }));
const scheduleCloudPull = vi.fn();
vi.mock("@/lib/sync/schedule", () => ({ scheduleCloudPull: () => scheduleCloudPull(), refreshCloudSyncNow: () => scheduleCloudPull() }));

import AgentAssetsPage from "./AgentAssetsPage";

afterEach(() => {
  cleanup();
  assetsRef.value = fixtures;
  skeletonOn.value = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AgentAssetsPage", () => {
  it("顶部标签带计数，默认显示全部", () => {
    render(<AgentAssetsPage />);
    expect(screen.getByTestId("agent-assets-page")).toBeInTheDocument();
    expect(screen.getByTestId("assets-tab-all")).toHaveTextContent("全部");
    expect(screen.getByTestId("assets-tab-note")).toHaveTextContent("笔记");
    expect(screen.getByTestId("assets-tab-url")).toHaveTextContent("网址");
    expect(screen.getByTestId("assets-grid")).toBeInTheDocument();
    expect(screen.getByText("组胚笔记")).toBeInTheDocument();
  });

  it("切标签只看那一类；搜索能过滤并清空", async () => {
    render(<AgentAssetsPage />);
    fireEvent.click(screen.getByTestId("assets-tab-note"));
    expect(screen.getByText("组胚笔记")).toBeInTheDocument();
    // 退场的卡由 AnimatePresence 收尾：动画跑完才从 DOM 里摘掉，所以这里等一等。
    await waitFor(() => expect(screen.queryByText("lecture.pdf")).toBeNull());
    fireEvent.click(screen.getByTestId("assets-tab-all"));
    await waitFor(() => expect(screen.getByText("lecture.pdf")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("assets-search"), { target: { value: "lecture" } });
    expect(screen.getByText("lecture.pdf")).toBeInTheDocument();
    // 同上：被筛掉的卡要等退场动画结束才离开 DOM。
    await waitFor(() => expect(screen.queryByText("组胚笔记")).toBeNull());

    fireEvent.change(screen.getByTestId("assets-search"), { target: { value: "找不到的东西" } });
    expect(screen.getByText(/没有匹配/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("清空搜索"));
    expect(screen.getByText("组胚笔记")).toBeInTheDocument();
  });

  it("橱窗 / 列表切换，并且记住选择", () => {
    render(<AgentAssetsPage />);
    fireEvent.click(screen.getByTestId("assets-view-list"));
    expect(screen.getByTestId("assets-list")).toBeInTheDocument();
    expect(window.localStorage.getItem("agent-assets-view")).toBe("list");
    fireEvent.click(screen.getByTestId("assets-view-grid"));
    expect(screen.getByTestId("assets-grid")).toBeInTheDocument();
  });

  it("切标签时卡片走「重排」动画容器，不是整块重渲", async () => {
    render(<AgentAssetsPage />);
    // 每张卡外面套一层 motion 容器（layout 动画的载体），key 与 testid 都稳定可寻
    expect(screen.getByTestId("asset-cell-note-n1")).toBeInTheDocument();
    expect(screen.getByTestId("asset-cell-file-i1")).toBeInTheDocument();
    expect(document.querySelector('[data-testid="assets-grid"]')).toBeInTheDocument();

    // 切到「笔记」：留下来的那张卡仍然是同一个节点（同一个 key），于是能就地滑到新位置
    const cell = screen.getByTestId("asset-cell-note-n1");
    fireEvent.click(screen.getByTestId("assets-tab-note"));
    expect(screen.getByTestId("asset-cell-note-n1")).toBe(cell);
    await waitFor(() => expect(screen.queryByTestId("asset-cell-file-i1")).toBeNull());
  });

  it("卡片是通往详情页的链接（不当场预览）", () => {
    render(<AgentAssetsPage />);
    const card = screen.getByTestId("asset-card-note-n1");
    expect(card).toHaveAttribute("href", "/agent/assets/note/n1");
    expect(screen.getByTestId("asset-card-file-i1")).toHaveAttribute("href", "/agent/assets/file/i1");
  });

  it("数据没水合完时给骨架，不显示空态", () => {
    assetsRef.value = null;
    skeletonOn.value = true;
    render(<AgentAssetsPage />);
    expect(screen.getByTestId("assets-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/还没有资产/)).toBeNull();
  });

  it("数据已就绪但还压在最小骨架时长里：仍然显示骨架（约 1 秒后再换内容）", () => {
    skeletonOn.value = true;
    render(<AgentAssetsPage />);
    expect(screen.getByLabelText("资产加载中")).toBeInTheDocument();
    expect(screen.queryByText("组胚笔记")).toBeNull();
  });

  it("分享标签：整块换成分享面板，本机资产的视图/搜索/排序控件同时收起", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ shares: [] }) }));
    render(<AgentAssetsPage />);

    fireEvent.click(screen.getByTestId("assets-tab-share"));

    // 分享列表不适用这些控件：留着它们既筛不动分享，又会悄悄改一个看不见的资产筛选状态。
    expect(screen.queryByTestId("assets-grid")).toBeNull();
    expect(screen.queryByTestId("assets-list")).toBeNull();
    expect(screen.queryByTestId("assets-view-grid")).toBeNull();
    expect(screen.queryByTestId("assets-search")).toBeNull();
    expect(screen.queryByTestId("assets-sort")).toBeNull();
    expect(screen.queryByTestId("assets-refresh")).toBeNull();
    expect(screen.queryByText("组胚笔记")).toBeNull();

    expect(await screen.findByTestId("shared-links-empty")).toHaveTextContent(translate("zh", "share.assets.empty"));
  });

  it("刷新只重新对齐云端状态", async () => {
    render(<AgentAssetsPage />);
    fireEvent.click(screen.getByTestId("assets-refresh"));
    // 刷新走动态 import（不把同步引擎打进资产页 chunk）
    await waitFor(() => expect(scheduleCloudPull).toHaveBeenCalledTimes(1));
  });
});
