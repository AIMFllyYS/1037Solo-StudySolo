import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {setClassUserId} from '@/classolo/lib/db'
import {CLASS_SUBJECT_GROUPS,DEFAULT_CLASS_COURSE_PROFILE,reviewSubjectForClass,classCourseProfileSchema} from '@/classolo/lib/course/profile'
import {getClassCourseDraft,saveClassCourseDraft} from '@/classolo/lib/course/preference'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{localStorage.clear();setClassUserId(A)})
afterEach(()=>setClassUserId(null))
describe('course classification and scoped terminology',()=>{
  it('offers clear Chinese, English, and medical branches while defaulting to neutral other',()=>{
    expect(CLASS_SUBJECT_GROUPS).toHaveLength(8)
    expect(CLASS_SUBJECT_GROUPS.find(group=>group.id==='language')?.subjects.some(([id])=>id==='chinese')).toBe(true)
    expect(CLASS_SUBJECT_GROUPS.find(group=>group.id==='language')?.subjects.some(([id])=>id==='english')).toBe(true)
    expect(CLASS_SUBJECT_GROUPS.find(group=>group.id==='medicine')?.subjects.some(([id])=>id==='anatomy')).toBe(true)
    expect(getClassCourseDraft().disciplineId).toBe('other')
    expect(planClassHotwords(DEFAULT_CLASS_COURSE_PROFILE).accepted).toEqual([])
  })
  it('rejects a second-level subject under the wrong family',()=>{
    expect(classCourseProfileSchema.safeParse({...DEFAULT_CLASS_COURSE_PROFILE,disciplineId:'medicine',subdisciplineId:'calculus'}).success).toBe(false)
  })
  it('keeps the preference under the verified owner across account switches',()=>{
    saveClassCourseDraft({...DEFAULT_CLASS_COURSE_PROFILE,disciplineId:'medicine',subdisciplineId:'anatomy',customTerms:['锁骨下动脉']})
    setClassUserId(B);expect(getClassCourseDraft().disciplineId).toBe('other')
    setClassUserId(A);expect(getClassCourseDraft().subdisciplineId).toBe('anatomy')
  })
  it('prioritizes user terms, stays within the server prompt bound, and exposes truncated terms',()=>{
    const customTerms=Array.from({length:40},(_,i)=>`术语${i}${'长'.repeat(30)}`)
    const profile=classCourseProfileSchema.parse({...DEFAULT_CLASS_COURSE_PROFILE,disciplineId:'medicine',subdisciplineId:'anatomy',customTerms})
    const plan=planClassHotwords(profile)
    expect(plan.accepted[0]).toBe(customTerms[0]);expect(plan.omitted.length).toBeGreaterThan(0)
    expect(plan.prompt!.length).toBeLessThanOrEqual(600)
  })
  it('maps an existing textbook subject and places unsupported elective subjects on the visible Other shelf',()=>{
    const anatomy=classCourseProfileSchema.parse({...DEFAULT_CLASS_COURSE_PROFILE,disciplineId:'medicine',subdisciplineId:'anatomy'})
    const physiology={...anatomy,subdisciplineId:'physiology'}
    expect(reviewSubjectForClass(anatomy)).toBe('anatomy');expect(reviewSubjectForClass(physiology)).toBe('other')
  })
})
