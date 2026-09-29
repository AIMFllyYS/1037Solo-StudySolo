import { z } from 'zod'

export const aiAskPropsSchema = z.object({
  question: z.string().min(1),
  choices: z.array(z.string()).optional(),
})
