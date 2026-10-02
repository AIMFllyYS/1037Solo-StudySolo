import { z } from 'zod'

export const imagePropsSchema = z.object({
  query: z.string().min(1),
  alt: z.string().optional(),
  result: z.discriminatedUnion('status', [
    z.object({ status: z.literal('ready'), provider:z.enum(['course','unsplash']),url: z.string().min(1), alt: z.string(), pageUrl: z.string().min(1), author: z.string(), licenseUrl: z.string().optional(), requestId: z.string().uuid() }),
    z.object({ status: z.literal('empty'), requestId: z.string().uuid() }),
    z.object({ status: z.literal('error'), message: z.string(), requestId: z.string().uuid() }),
  ]).optional(),
}).superRefine((value,ctx)=>{
  const result=value.result
  if(result?.status!=='ready')return
  const local=result.provider==='course'&&result.url.startsWith('/images/')&&result.pageUrl.startsWith('/')&&!result.pageUrl.startsWith('//')
  const external=result.provider==='unsplash'&&(result.url.startsWith('https://images.unsplash.com/')||result.url.startsWith('https://plus.unsplash.com/'))&&result.pageUrl.startsWith('https://unsplash.com/')&&result.licenseUrl==='https://unsplash.com/license'
  if(!local&&!external)ctx.addIssue({code:'custom',path:['result'],message:'图片来源地址不受支持'})
})
