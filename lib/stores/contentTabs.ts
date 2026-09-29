import { create } from "zustand";

/**
 * 内容页（正文 / 例题 / 题目测试）的标签状态。
 *
 * 内容页嵌在中间工作区（CenterWorkspace）里时，这些标签和「视频 / 可交互 / 浏览器」
 * 合并进同一条 Tab 栏：工作区负责渲染，内容页负责内容。两边通过这个 store 共享
 * 「有哪些标签、当前是哪个」，内容页自己不再画第二条栏。
 */
export type ContentTabId = "content" | "examples" | "quiz";

export interface ContentTabDef {
  id: ContentTabId;
  label: string;
}

interface ContentTabsState {
  /** 当前内容页可见的标签；空 = 当前路由不是内容页。 */
  tabs: ContentTabDef[];
  active: ContentTabId;
  setTabs: (tabs: ContentTabDef[]) => void;
  setActive: (id: ContentTabId) => void;
}

function sameTabs(a: readonly ContentTabDef[], b: readonly ContentTabDef[]): boolean {
  return a.length === b.length && a.every((tab, i) => tab.id === b[i].id && tab.label === b[i].label);
}

export const useContentTabs = create<ContentTabsState>((set, get) => ({
  tabs: [],
  active: "content",
  setTabs: (tabs) => {
    if (sameTabs(get().tabs, tabs)) return;
    set({ tabs });
  },
  setActive: (id) => {
    if (get().active !== id) set({ active: id });
  },
}));
