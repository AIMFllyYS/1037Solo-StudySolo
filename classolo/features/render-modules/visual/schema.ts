import {z} from 'zod'

/** A frozen explanatory diagram, never presented as a photographed classroom source. */
export const visualPropsSchema=z.object({
  kind:z.enum(['svg','plot','molecule']),
  title:z.string().min(1).max(160),
  content:z.string().min(1).max(30000),
  sourceSegmentId:z.string().max(150).optional(),
  sourceRevision:z.number().int().nonnegative().optional(),
  plot:z.object({xmin:z.number().finite().min(-100000).max(100000).optional(),xmax:z.number().finite().min(-100000).max(100000).optional()}).optional(),
})
export type VisualProps=z.infer<typeof visualPropsSchema>
