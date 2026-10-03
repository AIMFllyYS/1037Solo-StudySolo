/**
 * 右栏的「每个对话各自记一份」的内存表。
 *
 * 不落盘：窗口本身不持久化，刷新后没有可恢复的内容；显式开合偏好另由 ui store 版本化保存。
 * 因此刷新按用户偏好初始化面板，但不会恢复空窗口内容。
 */

export interface AgentDockSessionState {
  collapsed: boolean;
  /** 右栏「全屏（接管工作区）」状态。 */
  global: boolean;
  /** 离开时正在看的那个窗口。 */
  activeWindowId: string | null;
}

const memory = new Map<string, AgentDockSessionState>();

export function rememberAgentDockState(sessionId: string, state: AgentDockSessionState): void {
  if (!sessionId) return;
  memory.set(sessionId, state);
}

export function readAgentDockState(sessionId: string | null | undefined): AgentDockSessionState | null {
  if (!sessionId) return null;
  return memory.get(sessionId) ?? null;
}

/** Prefer a remembered chat-specific state; an unseen/new chat follows the user's current default. */
export function resolveAgentDockCollapsed(
  sessionState: AgentDockSessionState | null,
  userPreference: boolean,
): boolean {
  return sessionState?.collapsed ?? userPreference;
}

/** 只给测试用：清空内存表，避免用例之间互相污染。 */
export function __resetAgentDockMemoryForTests(): void {
  memory.clear();
}
