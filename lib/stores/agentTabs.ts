import { createPersistedStore } from "./_persist";

/**
 * 右栏 Agent 顶部标签条的「已关闭」集合。
 *
 * 关闭标签 ≠ 删除对话：叉掉只是把它从标签条拿走，对话本身原样留在历史里，
 * 从历史/侧栏再点开（切成当前会话）就自动回到标签条。删除只走历史面板里
 * 带二次确认的删除按钮。
 */
const MAX_CLOSED = 500;

type AgentTabsState = {
  closedIds: string[];
  closeTab: (id: string) => void;
  reopenTab: (id: string) => void;
};

export const useAgentTabs = createPersistedStore<AgentTabsState>(
  (set, get) => ({
    closedIds: [],
    closeTab: (id) => {
      if (get().closedIds.includes(id)) return;
      set({ closedIds: [...get().closedIds, id].slice(-MAX_CLOSED) });
    },
    reopenTab: (id) => {
      if (!get().closedIds.includes(id)) return;
      set({ closedIds: get().closedIds.filter((item) => item !== id) });
    },
  }),
  {
    name: "studysolo-agent-closed-tabs",
    storage: "local",
    version: 1,
    partialize: (state) => ({ closedIds: state.closedIds }) as AgentTabsState,
  },
);
