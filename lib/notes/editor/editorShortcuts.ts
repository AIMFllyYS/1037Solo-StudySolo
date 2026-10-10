/** 笔记编辑器内保留复制 / 粘贴 / 剪切 / 撤销，避免被窗口快捷键吃掉。 */

const EDITOR_KEYS = new Set(["c", "v", "x", "z", "y"]);

export function isEditorShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  if (event.altKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  return EDITOR_KEYS.has(event.key.toLowerCase());
}

export function keepEditorShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; stopPropagation: () => void }): void {
  if (isEditorShortcut(event)) event.stopPropagation();
}
