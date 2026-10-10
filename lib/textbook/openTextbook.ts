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
 * 正文阅读器与教材文件夹树共用 Studio 内容；只读浏览不注入对话上下文。
 * 树里的栏目仍可拖进输入框引用。
 */
export function openTextbookWindow(): string {
  const { pos, size } = geometry();
  const previous = useWindowManager.getState().windows.find((window) => window.id === TEXTBOOK_WINDOW_ID);
  return useWindowManager.getState().openWindow({
    id: TEXTBOOK_WINDOW_ID,
    type: "textbook",
    title: translateNow("window.textbook.windowTitle"),
    pos,
    size,
    data: previous?.data ?? {},
  });
}
