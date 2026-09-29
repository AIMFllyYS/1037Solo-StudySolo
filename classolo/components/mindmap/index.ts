/**
 * 本目录是 @xyflow/react + @dagrejs/dagre 的唯一入口（ADR-0005）。
 * 业务代码禁止直接 import '@xyflow/react' / '@dagrejs/dagre'，一律经由此处。
 *
 * 增量更新铁律（ADR-0005）：
 *   1. 大纲解析为稳定 id 树（标题路径或模型输出 id）
 *   2. 与上一帧 diff：旧 id 原样保留 position，只为新 id 计算布局
 *   3. 禁止整图卸载重建 / 全量重算坐标（导图闪烁 = 违规）
 * 布局只用 @dagrejs/dagre；禁止引入 elkjs（copyleft）/ d3-flextree（停更）。
 */
export {
  ClassroomMindmap,
  type ClassroomMindmapProps,
} from './canvas'
export {
  ClassroomOutlineNode,
  type ClassroomOutlineFlowNode,
  type ClassroomOutlineNodeData,
} from './classroom-outline-node'
export { classroomMindmapKit, type ClassroomMindmapKit } from './kit'
export {
  diffOutlineLayout,
  layoutOutlineTree,
  OUTLINE_NODE_HEIGHT,
  OUTLINE_NODE_WIDTH,
  type LaidOutEdge,
  type LaidOutGraph,
  type LaidOutNode,
  type OutlineTreeNode,
} from './layout'
