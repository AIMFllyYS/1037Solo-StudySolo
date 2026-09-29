/**
 * 本目录是 react-resizable-panels 的唯一入口（ADR-0008）。
 * 业务代码禁止直接 import 'react-resizable-panels'。
 * shadcn 的 Resizable 组件（pnpm dlx shadcn add resizable）生成后也收口到本目录。
 *
 * 约定：工作台四区布局比例经 useDefaultLayout 持久化到 localStorage（设备级偏好，不进 PGlite）。
 */
export { PanelGroup as Group, Panel, PanelResizeHandle as Separator } from 'react-resizable-panels'
export { layoutStorage } from './layout-storage'
export {
  isWorkbenchNarrow,
  WORKBENCH_MIN_WIDTH_PX,
} from './narrow'
export { AppChrome } from './app-chrome'
export { WorkbenchShell, type WorkbenchShellProps } from './workbench-shell'
