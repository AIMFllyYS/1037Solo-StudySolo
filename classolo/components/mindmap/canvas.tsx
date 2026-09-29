'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { cn } from '@/classolo/lib/utils'

import { ClassroomOutlineNode } from './classroom-outline-node'
import { diffOutlineLayout, type OutlineTreeNode } from './layout'

const nodeTypes = {
  classroomOutline: ClassroomOutlineNode,
} satisfies NodeTypes

export interface ClassroomMindmapProps {
  nodes: readonly OutlineTreeNode[]
  className?: string
  onNodeClick?: (id: string) => void
}

function treeSignature(nodes: readonly OutlineTreeNode[]): string {
  return nodes
    .map((node) => `${node.id}\0${node.title}\0${node.parentId ?? ''}`)
    .join('\n')
}

/** 跟随 StudySolo 的主题（html[data-theme]），而不是操作系统——否则浅色主题下会出现深色画布。 */
function subscribeHostTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
function readHostTheme(): 'dark' | 'light' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function MindmapFlow({ nodes, className, onNodeClick }: ClassroomMindmapProps) {
  const signature = treeSignature(nodes)
  const [seenSignature, setSeenSignature] = useState(signature)
  const [diffed, setDiffed] = useState(() => diffOutlineLayout([], nodes))
  if (signature !== seenSignature) {
    setSeenSignature(signature)
    setDiffed(diffOutlineLayout(diffed.graph.nodes, nodes))
  }

  const colorMode = useSyncExternalStore(subscribeHostTheme, readHostTheme, () => 'light' as const)
  const { fitView } = useReactFlow()
  // 大纲是增量长出来的：fitView 只在首帧生效，后续新增节点会跑出视口。签名变化后重新适配。
  useEffect(() => {
    const id = requestAnimationFrame(() => { void fitView({ padding: 0.15, duration: 240, maxZoom: 1 }) })
    return () => cancelAnimationFrame(id)
  }, [signature, fitView])

  const flowNodes: Node[] = useMemo(() => {
    const entered = new Set(diffed.enteredIds)
    return diffed.graph.nodes.map((node) => ({
      id: node.id,
      type: 'classroomOutline',
      position: node.position,
      data: { title: node.title, entering: entered.has(node.id) },
      draggable: false,
    }))
  }, [diffed])
  const flowEdges: Edge[] = useMemo(
    () =>
      diffed.graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    [diffed],
  )

  return (
    <div className={cn('h-full min-h-64 w-full', className)}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.25}
        maxZoom={2}
        colorMode={colorMode}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        onNodeClick={(_event, node) => {
          onNodeClick?.(node.id)
        }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function ClassroomMindmap(props: ClassroomMindmapProps) {
  return (
    <ReactFlowProvider>
      <MindmapFlow {...props} />
    </ReactFlowProvider>
  )
}
