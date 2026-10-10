import { create } from "zustand";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { SubjectId } from "@/lib/types/content";

// 全站消息右键菜单（复制 / 引用 / 追问 / 记录）的临时态。
// 用户消息与 AI 输出（主面板 / 浮窗 / 思考过程 / 题目深度解析）右键时打开。

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  /** 右键目标的文本（若右键时有选区，则取选区）。 */
  text: string;
  /** 复习板等场景强制记录到的科目。 */
  subjectOverride?: SubjectId;
  openAt: (p: { x: number; y: number; text: string; subjectOverride?: SubjectId }) => void;
  closeMenu: () => void;
}

export const useContextMenu = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  text: "",
  subjectOverride: undefined,
  openAt: (p) => set({ open: true, x: p.x, y: p.y, text: p.text, subjectOverride: p.subjectOverride }),
  closeMenu: () => set({ open: false, text: "" }),
}));

/** 给任意承载文本的元素挂在 onContextMenu 上：优先取选区，否则取整段文本。 */
export function openMessageMenu(
  e: ReactMouseEvent,
  fullText: string,
  subjectOverride?: SubjectId,
): void {
  if (!fullText || !fullText.trim()) return;
  e.preventDefault();
  e.stopPropagation();
  let text = fullText;
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (sel && !sel.isCollapsed) {
    const t = sel.toString().trim();
    if (t.length >= 2) text = t;
  }
  useContextMenu.getState().openAt({ x: e.clientX, y: e.clientY, text, subjectOverride });
}
