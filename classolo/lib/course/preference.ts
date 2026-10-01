import {getClassUserId,subscribeClassSync} from '@/classolo/lib/db'
import {classCourseProfileSchema,DEFAULT_CLASS_COURSE_PROFILE,parseClassCourseProfile,type ClassCourseProfile} from './profile'

let cachedOwner:string|null=null,cachedProfile:ClassCourseProfile=DEFAULT_CLASS_COURSE_PROFILE
const listeners=new Set<()=>void>()
const key=(owner:string)=>`ss-class:course-profile:${owner}`
export function getClassCourseDraft():ClassCourseProfile{
  const owner=getClassUserId()
  if(owner===cachedOwner)return cachedProfile
  cachedOwner=owner;cachedProfile=DEFAULT_CLASS_COURSE_PROFILE
  if(!owner||typeof window==='undefined')return cachedProfile
  try{const raw=localStorage.getItem(key(owner));if(raw)cachedProfile=parseClassCourseProfile(JSON.parse(raw))}catch{/* owner-scoped preference remains default */}
  return cachedProfile
}
export function saveClassCourseDraft(raw:unknown):ClassCourseProfile{
  const owner=getClassUserId();if(!owner)throw new Error('请先登录统一账号')
  const parsed=classCourseProfileSchema.parse(raw)
  cachedOwner=owner;cachedProfile=parsed
  try{localStorage.setItem(key(owner),JSON.stringify(parsed))}catch{/* class session saves its own snapshot */}
  listeners.forEach(listener=>listener())
  return parsed
}
export function subscribeClassCourseDraft(listener:()=>void){
  listeners.add(listener);const unsubscribe=subscribeClassSync(listener)
  return()=>{listeners.delete(listener);unsubscribe()}
}
