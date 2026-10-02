'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
  layoutKey?: string | null
}

function treeSignature(nodes: readonly OutlineTreeNode[]): string {
  return nodes
    .map((node) => `${node.id}\0${node.title}\0${node.parentId ?? ''}`)
    .join('\n')
}

function readManualPositions(layoutKey?:string|null):Record<string,{x:number;y:number}>{
  if(!layoutKey||typeof localStorage==='undefined')return {}
  try{
    const raw=JSON.parse(localStorage.getItem(`ss-class-map-layout:${layoutKey}`)||'{}') as Record<string,{x:number;y:number}>
    return Object.fromEntries(Object.entries(raw).filter(([,position])=>Number.isFinite(position?.x)&&Number.isFinite(position?.y)&&Math.abs(position.x)<5000&&Math.abs(position.y)<5000))
  }catch{return {}}
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

function MindmapFlow({ nodes, className, onNodeClick, layoutKey }: ClassroomMindmapProps) {
  const signature = treeSignature(nodes)
  const [seenSignature, setSeenSignature] = useState(signature)
  const [diffed, setDiffed] = useState(() => diffOutlineLayout([], nodes))
  if (signature !== seenSignature) {
    setSeenSignature(signature)
    setDiffed(diffOutlineLayout(diffed.graph.nodes, nodes))
  }

  const colorMode = useSyncExternalStore(subscribeHostTheme, readHostTheme, () => 'light' as const)
  const { fitView } = useReactFlow()
  const fitted=useRef(false)
  const [manualPositions,setManualPositions]=useState<Record<string,{x:number;y:number}>>(()=>readManualPositions(layoutKey))
  const manualRef=useRef(manualPositions)
  const nodeCount=nodes.length,rootId=nodes.find(node=>!node.parentId)?.id??nodes[0]?.id
  // Start at a readable root for large maps; later updates respect the learner's viewport.
  useEffect(() => {
    if(fitted.current||!nodeCount)return
    const id = requestAnimationFrame(() => { fitted.current=true;void fitView(nodeCount>4?{nodes:[{id:rootId!}],padding:0.55,duration:240,minZoom:0.7,maxZoom:1}:{padding:0.15,duration:240,maxZoom:1}) })
    return () => cancelAnimationFrame(id)
  }, [nodeCount,rootId,fitView])

  const flowNodes: Node[] = useMemo(() => {
    const entered = new Set(diffed.enteredIds)
    return diffed.graph.nodes.map((node) => ({
      id: node.id,
      type: 'classroomOutline',
      position: manualPositions[node.id]??node.position,
      data: { title: node.title, entering: entered.has(node.id) },
      draggable: true,
    }))
  }, [diffed,manualPositions])
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
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeDragStop={(_event,node)=>{
          const next={...manualRef.current,[node.id]:node.position}
          manualRef.current=next;setManualPositions(next)
          if(layoutKey)try{localStorage.setItem(`ss-class-map-layout:${layoutKey}`,JSON.stringify(next))}catch{}
        }}
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
    <ReactFlowProvider key={props.layoutKey??'unsaved-map'}>
      <MindmapFlow {...props} />
    </ReactFlowProvider>
  )
}
