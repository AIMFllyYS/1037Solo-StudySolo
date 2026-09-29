export const WORKBENCH_MIN_WIDTH_PX = 720
export const WORKBENCH_LAYOUT_STORAGE_PREFIX = 'react-resizable-panels:'

export function isWorkbenchNarrow(width: number): boolean {
  return width < WORKBENCH_MIN_WIDTH_PX
}
