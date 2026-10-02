import dagre, { type Graph } from '@dagrejs/dagre'

export const OUTLINE_NODE_WIDTH = 180
export const OUTLINE_NODE_HEIGHT = 52

export interface OutlineTreeNode {
  id: string
  title: string
  parentId?: string | null
}

export interface LaidOutNode {
  id: string
  title: string
  position: { x: number; y: number }
}

export interface LaidOutEdge {
  id: string
  source: string
  target: string
}

export interface LaidOutGraph {
  nodes: readonly LaidOutNode[]
  edges: readonly LaidOutEdge[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readCenter(graph: Graph, id: string): { x: number; y: number } {
  const raw: unknown = graph.node(id)
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`dagre missing node ${id}`)
  }
  const record = raw as { x?: unknown; y?: unknown }
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) {
    throw new Error(`dagre node ${id} missing coordinates`)
  }
  return { x: record.x, y: record.y }
}

export function layoutOutlineTree(
  nodes: readonly OutlineTreeNode[],
): LaidOutGraph {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  // 思维导图约定俗成是「根在左、分支向右」：同级要点纵向排列。
  // 原来的 TB 布局会把一节课 10+ 个顶层要点排成一整行，fitView 后节点缩到看不清。
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 14,
    ranksep: 56,
    marginx: 16,
    marginy: 16,
  })

  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    graph.setNode(node.id, {
      width: OUTLINE_NODE_WIDTH,
      height: OUTLINE_NODE_HEIGHT,
    })
  }

  const edges: LaidOutEdge[] = []
  for (const node of nodes) {
    const parentId = node.parentId
    if (!parentId || parentId === node.id || !byId.has(parentId)) continue
    graph.setEdge(parentId, node.id)
    edges.push({
      id: `e-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
    })
  }

  dagre.layout(graph)

  const laidOut: LaidOutNode[] = nodes.map((node) => {
    const center = readCenter(graph, node.id)
    return {
      id: node.id,
      title: node.title,
      position: {
        x: center.x - OUTLINE_NODE_WIDTH / 2,
        y: center.y - OUTLINE_NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: laidOut, edges }
}

export function diffOutlineLayout(
  previous: readonly LaidOutNode[],
  nextNodes: readonly OutlineTreeNode[],
): { graph: LaidOutGraph; enteredIds: readonly string[] } {
  const fresh = layoutOutlineTree(nextNodes)
  const previousIds=new Set(previous.map(node=>node.id))
  // All coordinates belong to the same layout pass; mixing passes can overlap new siblings.
  return {graph:fresh,enteredIds:fresh.nodes.filter(node=>!previousIds.has(node.id)).map(node=>node.id)}
}
