import { create } from "zustand";

/**
 * Agent 执行模式：
 * - ask：生成笔记修改 / 闪卡 / 调用工具前先征得用户同意（现有行为）；
 * - auto（完全同意）：这些动作自动执行，不再逐次确认。删除类操作仍单独确认。
 *
 * 只存本机 localStorage；首帧一律 "ask"，水合完成后再读盘，避免 SSR/水合不一致。
 */
export type AgentApprovalMode = "ask" | "auto";
const KEY = "studysolo-agent-approval-mode";

interface AgentApprovalState {
  mode: AgentApprovalMode;
  setMode: (mode: AgentApprovalMode) => void;
}

export const useAgentApproval = create<AgentApprovalState>((set) => ({
  mode: "ask",
  setMode: (mode) => {
    try {
      window.localStorage.setItem(KEY, mode);
    } catch {
      /* 隐私模式：记不住不影响使用 */
    }
    set({ mode });
  },
}));

export function hydrateAgentApprovalMode(): void {
  try {
    const raw = window.localStorage.getItem(KEY);
    if ((raw === "auto" || raw === "ask") && raw !== useAgentApproval.getState().mode) useAgentApproval.setState({ mode: raw });
  } catch {
    /* ignore */
  }
}
