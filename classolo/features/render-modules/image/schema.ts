import { z } from 'zod'

export const imagePropsSchema = z.object({
  query: z.string().min(1),
  alt: z.string().optional(),
})
