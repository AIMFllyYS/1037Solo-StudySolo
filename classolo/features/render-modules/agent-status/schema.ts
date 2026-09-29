import { z } from 'zod'

export const agentStatusPropsSchema = z.object({
  status: z.string().min(1),
  detail: z.string().optional(),
})
