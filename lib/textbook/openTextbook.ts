import { translateNow } from "@/lib/i18n";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

/** 内部教材窗的窗口 id：全局只有一个。 */
export const TEXTBOOK_WINDOW_ID = "internal-textbook";

function geometry() {
  if (typeof window === "undefined") return { pos: { x: 24, y: 64 }, size: { width: 560, height: 640 } };
  return {
    pos: { x: Math.max(16, Math.floor(window.innerWidth * 0.08)), y: Math.max(16, Math.floor(window.innerHeight * 0.08)) },
    size: {
      width: Math.min(620, Math.floor(window.innerWidth * 0.6)),
      height: Math.min(720, Math.floor(window.innerHeight * 0.84)),
    },
  };
}

/**
 * 打开「内部教材」窗（Agent 右栏的 managed window）。
 * 它只是教材文件夹树的只读浏览器：不注入对话上下文，也与 Agent 的工具无关；
 * 唯一的联动是把树里的栏目拖进输入框引用。
 */
export function openTextbookWindow(): string {
  const { pos, size } = geometry();
  return useWindowManager.getState().openWindow({
    id: TEXTBOOK_WINDOW_ID,
    type: "textbook",
    title: translateNow("window.textbook.windowTitle"),
    pos,
    size,
    data: {},
  });
}
