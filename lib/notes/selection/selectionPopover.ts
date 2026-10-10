/** 划词助手：关掉浮层的时机。Agent 虚拟列表在 wrapRange 后会回调整滚动，不能把那次 scroll 当成用户划走。 */

export const SELECTION_POPOVER_SCROLL_GRACE_MS = 480;
export const SELECTION_POPOVER_COLLAPSE_GRACE_MS = 320;

export function shouldIgnoreSelectionDismiss(now: number, ignoreUntil: number): boolean {
  return now < ignoreUntil;
}

/**
 * 选区还在对话气泡里时，输入框 / 工具栏的 mousedown 不该抢焦点（否则跨行松手会清掉选区）。
 */
type SelectionLike = {
  isCollapsed: boolean;
  rangeCount: number;
  anchorNode: { nodeType: number } | null;
};

export function shouldBlockFocusSteal(
  selection: SelectionLike | null,
  target: unknown,
): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const anchor = selection.anchorNode;
  if (!anchor) return true;
  if (!target || typeof (target as { contains?: unknown }).contains !== "function") return true;
  return !(target as { contains: (node: unknown) => boolean }).contains(anchor);
}
