/** 本站划词助手：动作清单、默认可见性、系统划词拦截策略。 */

export const SELECTION_ASSISTANT_ACTIONS = ["copy", "explain", "record", "note", "ask", "quote"] as const;
export type SelectionAssistantAction = (typeof SELECTION_ASSISTANT_ACTIONS)[number];
export type SelectionAssistantActions = Record<SelectionAssistantAction, boolean>;

/**
 * 动作 → 文案 key（**不再存中文字面量**）。
 *
 * 为什么存 key：本模块是纯数据 + 纯函数，拿不到 locale。
 * 渲染方必须 `t(SELECTION_ASSISTANT_ACTION_LABELS[action])` 之后再显示；
 * 直接把 value 渲染出来只会看到 "common.copy"。
 */
export const SELECTION_ASSISTANT_ACTION_LABELS: Record<SelectionAssistantAction, string> = {
  copy: "common.copy",
  explain: "menu.selection.explain",
  record: "menu.selection.record",
  note: "menu.selection.note",
  ask: "menu.selection.ask",
  quote: "menu.selection.quote",
};

export const DEFAULT_SELECTION_ASSISTANT_ACTIONS: SelectionAssistantActions = {
  copy: true,
  explain: true,
  record: true,
  note: true,
  ask: true,
  quote: true,
};

export const FOREIGN_SELECTION_BLOCK_ATTR = "data-block-foreign-selection";

export function normalizeSelectionAssistantActions(value: unknown): SelectionAssistantActions {
  const src = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...DEFAULT_SELECTION_ASSISTANT_ACTIONS };
  for (const key of SELECTION_ASSISTANT_ACTIONS) {
    if (typeof src[key] === "boolean") next[key] = src[key];
  }
  return next;
}

export function isSelectionActionVisible(
  actions: SelectionAssistantActions | undefined,
  action: SelectionAssistantAction,
): boolean {
  const resolved = actions ?? DEFAULT_SELECTION_ASSISTANT_ACTIONS;
  return resolved[action] !== false;
}

export function hasVisibleSelectionActions(actions: SelectionAssistantActions | undefined): boolean {
  const resolved = actions ?? DEFAULT_SELECTION_ASSISTANT_ACTIONS;
  return SELECTION_ASSISTANT_ACTIONS.some((action) => resolved[action] !== false);
}

export function shouldPreventForeignSelectionMenu(
  blockForeign: boolean,
  selection: Pick<Selection, "isCollapsed" | "rangeCount"> | null,
): boolean {
  if (!blockForeign || !selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return true;
}

export function applyForeignSelectionBlockAttr(root: Pick<HTMLElement, "toggleAttribute"> | null, enabled: boolean): void {
  root?.toggleAttribute(FOREIGN_SELECTION_BLOCK_ATTR, enabled);
}
