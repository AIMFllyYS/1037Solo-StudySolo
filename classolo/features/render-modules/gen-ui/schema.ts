import { z } from 'zod'

export const genUiPropsSchema = z.object({
  dsl: z.unknown(),
})
