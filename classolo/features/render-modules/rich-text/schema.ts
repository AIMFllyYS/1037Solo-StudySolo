import { z } from 'zod'

export const richTextPropsSchema = z.object({
  markdown: z.string(),
})
