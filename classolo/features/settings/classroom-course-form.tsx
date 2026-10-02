'use client'
import {useState} from 'react'
import {CLASS_SUBJECT_GROUPS,classCourseProfileSchema,type ClassCourseProfile} from '@/classolo/lib/course/profile'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'
import {parseCustomHotwordText} from '@/classolo/lib/providers/asr/custom-hotwords'
import {SUBJECT_REGISTRY,isSubjectId} from '@/lib/content-data/subjects.registry'

export function ClassroomCourseForm({profile,recording,onSave}:{profile:ClassCourseProfile;recording:boolean;onSave:(profile:ClassCourseProfile)=>void}){
  const [draft,setDraft]=useState(profile),[termsText,setTermsText]=useState(profile.customTerms.join('\n')),[error,setError]=useState('')
  const group=CLASS_SUBJECT_GROUPS.find(item=>item.id===draft.disciplineId)??CLASS_SUBJECT_GROUPS.at(-1)!
  const candidate=classCourseProfileSchema.safeParse({...draft,customTerms:parseCustomHotwordText(termsText)})
  const hotwords=candidate.success?planClassHotwords(candidate.data):null
  const inputClass='w-full rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] px-2.5 py-2 text-[13px] text-[color:var(--ink)]'
  return <form className="space-y-3 text-[13px]" onSubmit={event=>{
    event.preventDefault()
    if(!candidate.success){setError('课程或术语不符合要求：单词最多40字，本课最多60个。');return}
    setError('');onSave(candidate.data)
  }}>
    <h3 className="font-medium text-[color:var(--ink)]">课堂学科与转写语境</h3>
    <label className="block space-y-1">一级分类<select aria-label="课堂学科大类" className={inputClass} value={draft.disciplineId} onChange={event=>{
      const next=CLASS_SUBJECT_GROUPS.find(group=>group.id===event.target.value)
      if(next)setDraft({...draft,disciplineId:next.id,subdisciplineId:next.subjects[0][0],materialSubjectId:null})
    }}>{CLASS_SUBJECT_GROUPS.map(group=><option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
    <label className="block space-y-1">二级学科<select aria-label="课堂二级学科" className={inputClass} value={draft.subdisciplineId} onChange={event=>setDraft({...draft,subdisciplineId:event.target.value,materialSubjectId:null})}>{group.subjects.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label className="block space-y-1">课堂名称<input aria-label="课堂名称" className={inputClass} maxLength={120} value={draft.courseName} placeholder="例如：系统解剖学第3讲" onChange={event=>setDraft({...draft,courseName:event.target.value})}/></label>
    <label className="block space-y-1">授课语言<select aria-label="课堂授课语言" className={inputClass} value={draft.language} onChange={event=>setDraft({...draft,language:event.target.value as ClassCourseProfile['language']})}><option value="zh">中文</option><option value="en">英语</option><option value="mixed">中英混合</option></select></label>
    <label className="block space-y-1">关联现有教材（可选）<select aria-label="关联教材" className={inputClass} value={draft.materialSubjectId??''} onChange={event=>setDraft({...draft,materialSubjectId:isSubjectId(event.target.value)?event.target.value:null})}><option value="">按课堂分类归档</option>{SUBJECT_REGISTRY.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
    <label className="block space-y-1">本课专有名词（每行一个）<textarea aria-label="本课专有名词" className={inputClass} rows={3} value={termsText} placeholder="锁骨下动脉" onChange={event=>setTermsText(event.target.value)}/></label>
    <p className="text-[11px] text-[color:var(--ink-faint)]">下次录音将使用 {hotwords?.accepted.length??0} 个术语；{hotwords?.omitted.length?`${hotwords.omitted.length} 个超出上限：${hotwords.omitted.slice(0,4).join('、')}`:'没有被截掉的术语'}。{recording?'当前录音仍使用开始时的设置。':''}</p>
    {error&&<p role="alert" className="text-[color:var(--md-sys-color-error)]">{error}</p>}
    <button type="submit" className="ss-tool">保存课堂设置</button>
  </form>
}
