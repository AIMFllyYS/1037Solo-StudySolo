import { create } from "zustand";
import type { VideoEntry } from "@/lib/content/types";
import type { LayoutProfile, SubjectId } from "@/lib/types/content";
import type { TocItem } from "@/lib/types/toc";
import { getCategory, getContentItem } from "@/lib/content-data";
import { deriveActiveKeys } from "@/lib/content/categoryKeys";
import { layoutFlags, resolveLayoutProfile } from "@/lib/content/layoutProfile";
import type { LayoutRightTab } from "@/lib/content/layoutProfile";
import { DEFAULT_SUBJECT } from "@/lib/constants/subjects";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";

// 派生而非重复声明：`layoutProfile.ts` 决定每个档位显示哪些右栏 tab，但它不能 import 本文件
// （会成环 ui → layoutProfile → ui），所以类型的真相源放在那边、这里派生回来。
// 若两处各写一份同形字面量，新增第五个 tab 时这里不会报错，而 resolveRightTabs 永远不吐出它
// —— 那个 tab 会在所有档位下静默消失。派生掉了这种漂移的可能。
export type RightTab = LayoutRightTab;
export type MobileTab = "detail" | "review" | "ai" | "browser" | "settings";

/**
 * 中间「笔记展示区」上方的 Tab。
 *
 * `notes` 是默认叶子（页面 children 本身）；`video` / `interactive` / `browser`
 * 是以前挂在右栏的「阅读型内容」——它们和笔记争的是同一块阅读宽度，理应在中间切换，
 * 把右栏彻底留给对话 Agent。可用性沿用 routeLayout 的 rightTabs（去掉 `ai`）。
 */
export type CenterTab = "notes" | "video" | "interactive" | "browser";

/** rightTab 的媒体值 → centerTab 的映射（向后兼容旧的 setRightTab 调用路径）。 */
const RIGHT_TO_CENTER: Partial<Record<RightTab, CenterTab>> = {
  video: "video",
  interactive: "interactive",
  browser: "browser",
};

export interface OutboundMessage {
  /** 要发送给 AI 的完整内容（可能含划词引用） */
  content: string;
  /** 触发发送的递增序号；ChatPanel 监听其变化以发起请求 */
  nonce: number;
  /** Consistency binding only: a queued selection must not cross an Account owner switch. */
  ownerId: string | null;
  ownerEpoch: number;
  /** 记忆闭环第二步：确认后才把 commit 工具交给模型。 */
  memoryCommit?: "note" | "flashcards";
}

/** Layout 折叠状态持久化 key。 */
const LS_KEY_SIDEBAR = "gailvlun-sidebar-collapsed";
const LS_KEY_TOPBAR = "gailvlun-topbar-collapsed";
const LS_KEY_RIGHT_COLLAPSED = "gailvlun-right-collapsed-by-profile";
/** Agent 右栏新版显式用户偏好；旧无标记 key 保留但不再用于默认值判定。 */
const LS_KEY_AGENT_DOCK_V2 = "gailvlun-agent-dock-collapsed-v2";

const DEFAULT_RIGHT_COLLAPSED: Record<LayoutProfile, boolean> = {
  full: false,
  article: true,
  reference: false,
};

const RIGHT_COLLAPSE_PROFILES = ["full", "article", "reference"] as const satisfies readonly LayoutProfile[];

const DEFAULT_RIGHT_TABS: RightTab[] = ["ai", "video", "interactive", "browser"];

function writeRightCollapsedByProfile(value: Record<LayoutProfile, boolean>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY_RIGHT_COLLAPSED, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function writeBoolean(key: string, value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

/** Missing v2 preference means the independent Agent work area starts expanded. */
export function readAgentDockCollapsedPreference(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(LS_KEY_AGENT_DOCK_V2) === "true";
  } catch {
    return false;
  }
}

/** 同步 layout 折叠状态到 html 的 data 属性（供 CSS 在首屏 paint 前应用）。 */
function setLayoutAttr(name: string, value: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(name, String(value));
}

/** 从 DOM 属性读取 layout 折叠状态（由 app/layout.tsx 内联脚本在 paint 前应用）。 */
function domBoolean(name: string): boolean | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.getAttribute(name);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

interface AppState {
  // ── 导航（始终反映当前路由，由 AppShell 统一同步）──────────
  activeSubjectId: SubjectId;
  /** 当前分类（detail/recording/summary/textbook…），用于 AI 上下文 */
  activeCategoryId: string;
  /** 当前内容项原始 id（如 "1.1" / "rec-01"），用于 AI 上下文 */
  activeItemId: string;
  /** 仅 detail 分类下有意义；非 detail 为 ""，使右侧视频/交互/例题显示空态而非串科目 */
  activeChapterId: string;
  activeSectionId: string;
  setActiveSubject: (s: SubjectId) => void;
  /** 由路由 (subjectId, categoryId, itemId) 统一驱动导航状态 */
  setActiveRoute: (subjectId: SubjectId, categoryId: string, itemId: string) => void;

  // 侧边栏折叠（单一真相源，驱动 react-resizable-panels 的左面板）
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;


  // 顶部导航栏折叠
  topBarCollapsed: boolean;
  toggleTopBar: () => void;
  setTopBarCollapsed: (v: boolean) => void;

  /** 从 DOM 回填本地持久化的布局状态（首屏避免闪烁）。 */
  hydrateLayout: () => void;

  /** 已展开的科目/分类/章节键。科目用 `${subjectId}`，分类用 `${subjectId}-${categoryId}`，
   *  叶子用 `${subjectId}/${categoryId}/${itemId}`（命名空间化，避免跨学科碰撞）。 */
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;

  // ── 右侧面板 ──────────────────────────────────────────
  rightTab: RightTab;
  setRightTab: (t: RightTab) => void;
  /** 中间笔记区上方的 Tab（笔记 / 视频 / 可交互 / 浏览器）。 */
  centerTab: CenterTab;
  setCenterTab: (t: CenterTab) => void;
  /** 当前路由对应的布局档位（由 setActiveRoute 写入） */
  layoutProfile: LayoutProfile;
  /** 当前档位允许的右侧 tab */
  rightTabs: RightTab[];
  /** 用户按档位分别记忆的右栏折叠状态（仅 Studio 内容页） */
  rightCollapsedByProfile: Record<LayoutProfile, boolean>;
  setRightCollapsedForProfile: (profile: LayoutProfile, collapsed: boolean) => void;
  /** Agent 右栏（通顶工作区）是否收起。与 Studio 的档位右栏互不影响。 */
  agentDockCollapsed: boolean;
  /** 显式用户操作：更新当前值并保存为新版本偏好。 */
  setAgentDockCollapsed: (collapsed: boolean) => void;
  /** 路由/会话恢复用：只改当前开合，不把程序状态写成新的用户偏好。 */
  setAgentDockCollapsedTransient: (collapsed: boolean) => void;

  /** 页面正中的 Agent 设置层（左下角与 AI 助教共用）。 */
  agentSettingsOpen: boolean;
  openAgentSettings: () => void;
  closeAgentSettings: () => void;

  /** 页面正中的登录弹窗（设置 overlay 同款，不是 Mac 窗）。 */
  loginOverlayOpen: boolean;
  openLoginOverlay: () => void;
  closeLoginOverlay: () => void;

  // ── AI 对话 ───────────────────────────────────────────
  /** 划词 / 外部触发的待发送消息 */
  outbound: OutboundMessage | null;
  /** 把一段文本送入 AI 对话并切到 AI Tab（用于划词问答与建议追问） */
  sendToChat: (content: string, opts?: { memoryCommit?: OutboundMessage["memoryCommit"] }) => void;
  clearOutbound: () => void;

  // ── 手机端 ──────────────────────────────────────────────
  mobileTab: MobileTab;
  setMobileTab: (t: MobileTab) => void;
  mobileChapterPickerOpen: boolean;
  toggleMobileChapterPicker: () => void;
  setMobileChapterPickerOpen: (v: boolean) => void;
  /** 手机顶栏侧栏：页面右滑，左侧拉出文件夹树。 */
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (v: boolean) => void;
  toggleMobileSidebar: () => void;
  /** 非 AI/设置页右下角自绘小对话窗。 */
  mobileMiniChatOpen: boolean;
  setMobileMiniChatOpen: (v: boolean) => void;

  // ── 小窗视频（PiP）─────────────────────────────────────
  /** 当前在浮动小窗播放的视频；null 表示未打开 */
  pipVideo: VideoEntry | null;
  /** 小窗开始播放位置（秒），用于内嵌→小窗续播 */
  pipStartTime: number;
  /** 小窗关闭时记录的播放位置，供内嵌续播 */
  pipReturnTime: number | null;
  /** 浮窗几何状态记忆（跨视频关闭/打开持久化） */
  pipGeometry: { x: number; y: number; width: number; height: number } | null;
  /** 保存浮窗几何状态 */
  setPipGeometry: (g: { x: number; y: number; width: number; height: number }) => void;
  openPip: (v: VideoEntry, startTime?: number) => void;
  closePip: (returnTime?: number) => void;

  // ── 目录（TOC）──────────────────────────────────────────
  /** 侧边栏视图模式：false = 文件树, true = 目录树。作为用户视图偏好保留，不随路由重置；
   *  TOC 数据本身由内容页 useToc 重建，非内容页由 AppShell 清空。 */
  tocMode: boolean;
  toggleTocMode: () => void;
  /** 当前页面的标题树（由 useToc hook 从 DOM 提取） */
  tocItems: TocItem[];
  setTocItems: (items: TocItem[]) => void;
  /** 当前可见标题的 id（由 IntersectionObserver 驱动） */
  activeTocId: string | null;
  setActiveTocId: (id: string | null) => void;
  /** 合并更新 tocItems + activeTocId，单次 set 减少订阅者重渲染 */
  setTocData: (items: TocItem[], activeId: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  activeSubjectId: DEFAULT_SUBJECT,
  activeCategoryId: "detail",
  activeItemId: "1.1",
  activeChapterId: "ch01",
  activeSectionId: "1.1",
  setActiveSubject: (s) => set({ activeSubjectId: s }),
  setActiveRoute: (subjectId, categoryId, itemId) =>
    set((s) => {
      const cat = getCategory(subjectId, categoryId);
      const item = getContentItem(subjectId, categoryId, itemId);
      const profile = resolveLayoutProfile(cat, item);
      const flags = layoutFlags(profile, cat, item);
      const rightTabs = flags.rightTabs;
      const rightTab = rightTabs.includes(s.rightTab) ? s.rightTab : (rightTabs[0] ?? "ai");
      // centerTab 只在「当前值不再可用」时回落到笔记：切章保留用户停留的视图（若该章仍有该 tab）。
      const centerAvailable = s.centerTab === "notes" || rightTabs.includes(s.centerTab as RightTab);
      const centerTab: CenterTab = centerAvailable ? s.centerTab : "notes";
      return {
        activeSubjectId: subjectId,
        activeCategoryId: categoryId,
        activeItemId: itemId,
        // Quiz / 视频 / 交互 Tab 的查找 key：课堂材料优先用 item.quizRef（四材料共享一套题），
        // 否则由板块 capabilities + keyStrategy 推导。
        ...deriveActiveKeys(cat, itemId, item),
        layoutProfile: profile,
        rightTabs,
        rightTab,
        centerTab,
      };
    }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      writeBoolean(LS_KEY_SIDEBAR, next);
      setLayoutAttr("data-sidebar-collapsed", next);
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (v) => {
    writeBoolean(LS_KEY_SIDEBAR, v);
    setLayoutAttr("data-sidebar-collapsed", v);
    set({ sidebarCollapsed: v });
  },


  topBarCollapsed: false,
  toggleTopBar: () =>
    set((s) => {
      const next = !s.topBarCollapsed;
      writeBoolean(LS_KEY_TOPBAR, next);
      setLayoutAttr("data-topbar-collapsed", next);
      return { topBarCollapsed: next };
    }),
  setTopBarCollapsed: (v) => {
    writeBoolean(LS_KEY_TOPBAR, v);
    setLayoutAttr("data-topbar-collapsed", v);
    set({ topBarCollapsed: v });
  },

  hydrateLayout: () => {
    const topBar = domBoolean("data-topbar-collapsed");
    const sidebar = domBoolean("data-sidebar-collapsed");
    const agentDock = domBoolean("data-agent-dock-collapsed");
    const updates: Partial<AppState> = {};
    if (topBar !== null) updates.topBarCollapsed = topBar;
    if (sidebar !== null) updates.sidebarCollapsed = sidebar;
    if (agentDock !== null) updates.agentDockCollapsed = agentDock;
    const right = { ...DEFAULT_RIGHT_COLLAPSED };
    let hasRightAttr = false;
    for (const profile of RIGHT_COLLAPSE_PROFILES) {
      const v = domBoolean(`data-right-collapsed-${profile}`);
      if (v !== null) {
        right[profile] = v;
        hasRightAttr = true;
      }
    }
    if (hasRightAttr) updates.rightCollapsedByProfile = right;
    if (Object.keys(updates).length > 0) set(updates);
  },

  // 初始展开：概率论科目 + 其详解分类（catId 规则为 `${subjectId}-${categoryId}`）。
  expandedIds: new Set([DEFAULT_SUBJECT, `${DEFAULT_SUBJECT}-detail`]),
  toggleExpand: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),

  rightTab: "ai",
  /**
   * 向后兼容：老代码用 `setRightTab('video'|'interactive'|'browser')` 打开阅读型内容，
   * 现在这些内容住在**中间**的 tab 栏。把媒体值路由到 centerTab，`ai` 则把中间切回笔记
   * （表示「去看对话」——右栏 AI 常驻，中间回到笔记）。仍写回 rightTab 供其余订阅者读取。
   */
  setRightTab: (t) =>
    set((s) => {
      if (s.rightTabs.length !== 0 && !s.rightTabs.includes(t)) return s;
      const center = RIGHT_TO_CENTER[t];
      return {
        rightTab: t,
        centerTab: center ?? (t === "ai" ? "notes" : s.centerTab),
      };
    }),
  centerTab: "notes",
  setCenterTab: (t) =>
    set((s) => {
      if (t === "notes") return { centerTab: "notes" };
      // 只认当前路由允许的媒体 tab；不可用时忽略（等价于停在笔记）。
      return s.rightTabs.includes(t as RightTab) ? { centerTab: t } : s;
    }),
  layoutProfile: "full",
  rightTabs: DEFAULT_RIGHT_TABS,
  rightCollapsedByProfile: { ...DEFAULT_RIGHT_COLLAPSED },
  setRightCollapsedForProfile: (profile, collapsed) =>
    set((s) => {
      const next = { ...s.rightCollapsedByProfile, [profile]: collapsed };
      writeRightCollapsedByProfile(next);
      setLayoutAttr(`data-right-collapsed-${profile}`, collapsed);
      return { rightCollapsedByProfile: next };
    }),

  /** 全新账号默认展开 Agent 工作区；v2 中的显式偏好由 hydrateLayout 回填。 */
  agentDockCollapsed: false,
  setAgentDockCollapsed: (collapsed) => {
    writeBoolean(LS_KEY_AGENT_DOCK_V2, collapsed);
    setLayoutAttr("data-agent-dock-collapsed", collapsed);
    set({ agentDockCollapsed: collapsed });
  },
  setAgentDockCollapsedTransient: (collapsed) => {
    setLayoutAttr("data-agent-dock-collapsed", collapsed);
    set({ agentDockCollapsed: collapsed });
  },

  agentSettingsOpen: false,
  openAgentSettings: () => set({ agentSettingsOpen: true }),
  closeAgentSettings: () => set({ agentSettingsOpen: false }),

  loginOverlayOpen: false,
  openLoginOverlay: () => set({ loginOverlayOpen: true }),
  closeLoginOverlay: () => set({ loginOverlayOpen: false }),

  outbound: null,
  sendToChat: (content, opts) => {
    const ownerId = getStorageOwner();
    const ownerEpoch = getOwnerEpoch();
    set((s) => ({
      rightTab: "ai",
      // 划词 / 建议追问：AI 常驻右栏，中间回到笔记，让用户对照原文看回答。
      centerTab: "notes",
      mobileTab: "ai",
      outbound: { content, nonce: (s.outbound?.nonce ?? 0) + 1, ownerId, ownerEpoch, memoryCommit: opts?.memoryCommit },
    }));
  },
  clearOutbound: () => set({ outbound: null }),

  mobileTab: "detail",
  setMobileTab: (t) =>
    set((s) => ({
      mobileTab: t,
      mobileMiniChatOpen: t === "ai" || t === "settings" ? false : s.mobileMiniChatOpen,
    })),
  mobileChapterPickerOpen: false,
  toggleMobileChapterPicker: () =>
    set((s) => ({
      mobileChapterPickerOpen: !s.mobileChapterPickerOpen,
      mobileSidebarOpen: s.mobileChapterPickerOpen ? s.mobileSidebarOpen : false,
    })),
  setMobileChapterPickerOpen: (v) =>
    set((s) => ({
      mobileChapterPickerOpen: v,
      mobileSidebarOpen: v ? false : s.mobileSidebarOpen,
    })),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) =>
    set((s) => ({
      mobileSidebarOpen: v,
      mobileChapterPickerOpen: v ? false : s.mobileChapterPickerOpen,
    })),
  toggleMobileSidebar: () =>
    set((s) => ({
      mobileSidebarOpen: !s.mobileSidebarOpen,
      mobileChapterPickerOpen: !s.mobileSidebarOpen ? false : s.mobileChapterPickerOpen,
    })),
  mobileMiniChatOpen: false,
  setMobileMiniChatOpen: (v) => set({ mobileMiniChatOpen: v }),

  pipVideo: null,
  pipStartTime: 0,
  pipReturnTime: null,
  pipGeometry: null,
  setPipGeometry: (g) => set({ pipGeometry: g }),
  openPip: (v, startTime = 0) => set({ pipVideo: v, pipStartTime: startTime }),
  closePip: (returnTime) =>
    set({ pipVideo: null, pipReturnTime: returnTime ?? null }),

  tocMode: false,
  toggleTocMode: () => set((s) => ({ tocMode: !s.tocMode })),
  tocItems: [],
  setTocItems: (items) => set({ tocItems: items }),
  activeTocId: null,
  setActiveTocId: (id) => set({ activeTocId: id }),
  setTocData: (items, activeId) => set({ tocItems: items, activeTocId: activeId }),
}));
