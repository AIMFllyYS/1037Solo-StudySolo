import { z } from 'zod'

export const outlineNodeSchema = z.object({
  id: z.string().min(1).max(150),
  title: z.string().min(1).max(500),
  parentId: z.string().min(1).max(150).nullable().optional(),
  sourceSegmentIds: z.array(z.string().min(1).max(150)).max(100).optional(),
  origin:z.enum(['ai','manual']).optional(),
  locked:z.boolean().optional(),
})

export const outlineProgressSchema=z.record(z.string().min(1).max(150),z.object({chars:z.number().int().min(0).max(20000),fingerprint:z.string().max(80)})).refine(rows=>Object.keys(rows).length<=10000,'文稿处理记录过多')
export const outlineSchema = z.object({ nodes: z.array(outlineNodeSchema).max(300),processedSegments:outlineProgressSchema.optional() }).superRefine(({ nodes }, ctx) => {
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (byId.size !== nodes.length) ctx.addIssue({ code: 'custom', message: '导图节点ID重复' })
  for (const node of nodes) {
    const seen = new Set([node.id])
    let parent = node.parentId
    while (parent) {
      if (seen.has(parent)) { ctx.addIssue({ code: 'custom', message: '导图不能包含循环关系' }); break }
      seen.add(parent)
      const ancestor = byId.get(parent)
      if (!ancestor) { ctx.addIssue({ code: 'custom', message: '导图父节点不存在' }); break }
      parent = ancestor.parentId
    }
  }
})

export type PersistedOutline = z.infer<typeof outlineSchema>
