import {z} from 'zod'
import {isSubjectId,type SubjectId} from '@/lib/content-data/subjects.registry'

export const CLASS_SUBJECT_GROUPS=[
  {id:'language',label:'语言与文学',subjects:[['chinese','语文／中文文学'],['english','通用英语'],['academic-english','学术英语'],['medical-english','医学英语']]},
  {id:'mathematics',label:'数学与统计',subjects:[['calculus','高等数学'],['linear-algebra','线性代数'],['probability','概率论'],['medical-statistics','医学统计']]},
  {id:'physics',label:'物理与工程',subjects:[['mechanics','力学'],['electromagnetism','电磁学'],['optics','光学'],['circuits','电路']]},
  {id:'chemistry-life',label:'化学与生命科学',subjects:[['organic-chemistry','有机化学'],['instrumental-analysis','仪器分析'],['biochemistry','生化'],['cell-biology','细胞生物学']]},
  {id:'medicine',label:'医学',subjects:[['anatomy','解剖'],['histology','组胚'],['physiology','生理'],['pathology','病理'],['pharmacology','药理'],['microbiology-immunology','微生物与免疫'],['clinical','临床分科']]},
  {id:'humanities',label:'人文与社会科学',subjects:[['history','历史'],['politics','政治'],['philosophy','哲学'],['law','法律'],['economics','经济']]},
  {id:'computer',label:'计算机与信息技术',subjects:[['programming','编程'],['algorithms','算法'],['databases','数据库'],['systems','计算机系统']]},
  {id:'other',label:'其他／跨学科',subjects:[['general','通用记录'],['interdisciplinary','跨学科']]},
] as const
const groupIds=CLASS_SUBJECT_GROUPS.map(group=>group.id)
const materialSubjectSchema=z.string().refine(isSubjectId,'未知教材学科')
export const classCourseProfileSchema=z.object({
  version:z.literal(1).default(1),
  disciplineId:z.string().refine(id=>groupIds.includes(id as typeof groupIds[number]),'未知课堂分类'),
  subdisciplineId:z.string().min(1).max(60),
  language:z.enum(['zh','en','mixed']),
  courseName:z.string().trim().max(120).default(''),
  materialSubjectId:materialSubjectSchema.nullable().optional(),
  customTerms:z.array(z.string().trim().min(1).max(40)).max(60).default([]),
}).superRefine((value,ctx)=>{
  const group=CLASS_SUBJECT_GROUPS.find(group=>group.id===value.disciplineId)
  if(!group?.subjects.some(([id])=>id===value.subdisciplineId))ctx.addIssue({code:'custom',path:['subdisciplineId'],message:'二级学科不属于所选分类'})
})
export type ClassCourseProfile=z.infer<typeof classCourseProfileSchema>
export const DEFAULT_CLASS_COURSE_PROFILE:ClassCourseProfile=Object.freeze({version:1,disciplineId:'other',subdisciplineId:'general',language:'zh',courseName:'',materialSubjectId:null,customTerms:[]})
const derivedMaterial:Record<string,SubjectId>={
  'medical-english':'medical-english',probability:'probability','medical-statistics':'medical-statistics',
  mechanics:'physics',electromagnetism:'physics',optics:'physics',circuits:'physics',
  'organic-chemistry':'chemistry','instrumental-analysis':'instrumental-analysis',
  biochemistry:'biochemistry','cell-biology':'cell-biology',anatomy:'anatomy',histology:'histology',
  history:'modern-history',politics:'maogai',
}
export function reviewSubjectForClass(profile:ClassCourseProfile):SubjectId{return (profile.materialSubjectId||derivedMaterial[profile.subdisciplineId]||'other') as SubjectId}
export function classSubjectLabel(profile:ClassCourseProfile):string{
  const group=CLASS_SUBJECT_GROUPS.find(item=>item.id===profile.disciplineId)
  const subject=group?.subjects.find(([id])=>id===profile.subdisciplineId)
  return [group?.label,subject?.[1]].filter(Boolean).join(' · ')
}
export function parseClassCourseProfile(raw:unknown):ClassCourseProfile{
  const parsed=classCourseProfileSchema.safeParse(raw)
  return parsed.success?parsed.data:DEFAULT_CLASS_COURSE_PROFILE
}
