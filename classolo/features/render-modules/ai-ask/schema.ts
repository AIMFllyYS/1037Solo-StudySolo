import { z } from 'zod'

export const aiAskPropsSchema = z.object({
  question: z.string().min(1),
  choices: z.array(z.string()).optional(),
  assessmentId: z.string().max(150).optional(),
  questionType:z.enum(['choice','open']).optional(),
  attempts: z.array(z.object({
    id: z.string().uuid(),
    response: z.string().max(4000),
    answer: z.string().max(12000),
    evidenceIds: z.array(z.string().max(150)).max(20),
    sourceRevisions: z.record(z.string(),z.number().int().nonnegative()),
    atMs: z.number().int().nonnegative(),
  })).max(20).optional(),
}).superRefine((value,ctx)=>{
  if(value.questionType==='choice'&&(!value.choices||value.choices.length<2))ctx.addIssue({code:'custom',message:'选择题至少两个选项',path:['choices']})
  for(const [index,attempt] of (value.attempts??[]).entries())if(Object.keys(attempt.sourceRevisions).some(id=>!attempt.evidenceIds.includes(id)))ctx.addIssue({code:'custom',message:'答案版本包含无来源片段',path:['attempts',index,'sourceRevisions']})
})
