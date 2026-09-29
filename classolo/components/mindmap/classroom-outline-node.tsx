'use client'

import { motion } from 'framer-motion'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import { cn } from '@/classolo/lib/utils'
import { DURATION, EASE } from '@/lib/motion'

export type ClassroomOutlineNodeData = {
  title: string
  entering?: boolean
}

export type ClassroomOutlineFlowNode = Node<
  ClassroomOutlineNodeData,
  'classroomOutline'
>

export function ClassroomOutlineNode({
  data,
  selected,
}: NodeProps<ClassroomOutlineFlowNode>) {
  return (
    <motion.div
      className={cn(
        'w-[180px] rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm',
        selected && 'ring-2 ring-ring',
      )}
      initial={data.entering ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.normal, ease: EASE.decelerate }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-primary"
      />
      <p className="line-clamp-2 font-medium leading-snug" title={data.title}>{data.title}</p>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-primary"
      />
    </motion.div>
  )
}
