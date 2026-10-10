import { useAppMode } from "@/lib/stores/appMode";

/** Agent 模式检测。模式真相源是 `useAppMode`，窗口坞化只读这个函数。 */
export function isAgentWorkspace(): boolean {
  if (useAppMode.getState().mode === "agent") return true;
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.getAttribute("data-app-mode") === "agent" ||
    Boolean(document.querySelector("[data-agent-workspace]"))
  );
}
