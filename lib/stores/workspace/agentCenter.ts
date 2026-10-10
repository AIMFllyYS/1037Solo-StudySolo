import { create } from "zustand";

/**
 * Agent 中央区当前在看的视图（Perplexity 式的顶部分段：回答 / 来源 / 图片）。
 *
 * 它只是**视图开关**，不落盘：来源与图片都是「这条对话」的附属视图，
 * 换对话就回到回答，所以持久化它只会制造「打开就看不到对话」的困惑。
 */
export type AgentCenterTab = "answer" | "links" | "images";

/**
 * 来源列的默认尺寸与可调范围。
 *
 * **反直觉点（写死口径，别再被它骗一次）**：它看起来像悬浮卡片（圆角 + 阴影 + 可拖动改大小），
 * 但**占掉真实宽度** —— 正文会真的让出一列，而不是被浮层压在底下。
 * 演进路径是「浮层卡片 → 右侧固定栏 → 占宽的浮层卡片（最终）」，「像浮层」不等于「是浮层」。
 */
/** 卡片四周留白：卡片是浮起来的（圆角 + 阴影），但**占的是真实宽度**，所以留白也算进那一列的宽度。 */
export const SOURCES_PANEL_INSET = 12;
/**
 * 来源列的默认尺寸（**回到用户口径的「好看」档**）。
 *
 * 曾经按视口折算成 30%（≈576px@1920），理由是"太窄"；但走马灯（WebSourceCarousel）
 * 进来以后，那一列已经不需要那么宽——400 宽时卡片横跨整列显得空、标题被拉成一条长线，
 * 反而不如窄一点紧凑。用户明确要求回到"加内容之前"的尺寸，故此处写死为原默认值。
 * 用户拖过的尺寸照旧读盘恢复（`readSavedSize`），这里只兜「从没拖过」的情形。
 */
export const SOURCES_PANEL_DEFAULT_SIZE = { width: 300, height: 420 } as const;
export const SOURCES_PANEL_MIN_SIZE = { width: 220, height: 200 } as const;
export const SOURCES_PANEL_MAX_SIZE = { width: 720, height: 1200 } as const;
const SOURCES_PANEL_SIZE_KEY = "studysolo-agent-sources-panel-size";

export function clampSourcesPanelSize(size: { width: number; height: number }): { width: number; height: number } {
  return {
    width: Math.min(SOURCES_PANEL_MAX_SIZE.width, Math.max(SOURCES_PANEL_MIN_SIZE.width, Math.round(size.width))),
    height: Math.min(SOURCES_PANEL_MAX_SIZE.height, Math.max(SOURCES_PANEL_MIN_SIZE.height, Math.round(size.height))),
  };
}

/** 默认尺寸的唯一入口（SSR / 单测 / 首访都走它）。 */
export function defaultSourcesPanelSize(): { width: number; height: number } {
  return clampSourcesPanelSize({ ...SOURCES_PANEL_DEFAULT_SIZE });
}

function readSavedSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { ...SOURCES_PANEL_DEFAULT_SIZE };
  try {
    const raw = window.localStorage.getItem(SOURCES_PANEL_SIZE_KEY);
    if (!raw) return defaultSourcesPanelSize();
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = typeof parsed.width === "number" ? parsed.width : 0;
    const height = typeof parsed.height === "number" ? parsed.height : 0;
    if (width < SOURCES_PANEL_MIN_SIZE.width || height < SOURCES_PANEL_MIN_SIZE.height) {
      return defaultSourcesPanelSize();
    }
    return { width, height };
  } catch {
    return defaultSourcesPanelSize();
  }
}

interface AgentCenterState {
  centerTab: AgentCenterTab;
  setCenterTab: (tab: AgentCenterTab) => void;
  /** 来源列是否显示。用户口径：默认显示，顶栏有开关。 */
  sourcesPanelOpen: boolean;
  toggleSourcesPanel: () => void;
  /** 用户拖出来的尺寸；只记尺寸，位置恒为右上角。 */
  sourcesPanelSize: { width: number; height: number };
  setSourcesPanelSize: (size: { width: number; height: number }) => void;
}

export const useAgentCenter = create<AgentCenterState>((set) => ({
  centerTab: "answer",
  setCenterTab: (tab) => set((state) => (state.centerTab === tab ? state : { centerTab: tab })),

  sourcesPanelOpen: true,
  toggleSourcesPanel: () => set((state) => ({ sourcesPanelOpen: !state.sourcesPanelOpen })),

  sourcesPanelSize: defaultSourcesPanelSize(),
  setSourcesPanelSize: (size) => {
    const next = clampSourcesPanelSize(size);
    try {
      window.localStorage.setItem(SOURCES_PANEL_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式 / 配额：记不住尺寸不影响使用。 */
    }
    set({ sourcesPanelSize: next });
  },
}));

/** 首帧之后把上次拖出来的尺寸读回来（SSR 期没有 localStorage，不能放进初始 state）。 */
export function hydrateSourcesPanelSize(): void {
  const saved = readSavedSize();
  const current = useAgentCenter.getState().sourcesPanelSize;
  if (saved.width === current.width && saved.height === current.height) return;
  useAgentCenter.setState({ sourcesPanelSize: saved });
}
