import {z} from 'zod'

export const formulaProposalSchema=z.object({
  sourceSegmentId:z.string().min(1).max(150),spokenText:z.string().min(1).max(500),
  latex:z.string().min(1).max(2000),alternatives:z.array(z.string().min(1).max(2000)).max(4).optional(),
})
export type FormulaProposal=z.infer<typeof formulaProposalSchema>
export const formulaPropsSchema=formulaProposalSchema.extend({
  id:z.string().min(1).max(150),sourceRevision:z.number().int().nonnegative(),
  renderStatus:z.enum(['valid','invalid']),renderError:z.string().max(220).optional(),
  sourceStatus:z.enum(['matched','unmatched']),semanticStatus:z.enum(['checked','invalid','unchecked','ambiguous']),
  semanticDetail:z.string().max(220),studentConfirmed:z.boolean().default(false),locked:z.boolean().default(false),
})
export type FormulaProps=z.infer<typeof formulaPropsSchema>
