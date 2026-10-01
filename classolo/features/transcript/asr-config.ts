import type {ASRConfig} from '@/classolo/lib/providers/asr';
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import {planClassHotwords} from '@/classolo/lib/course/hotwords'
export function readAsrRuntimeConfig(profile?:ClassCourseProfile):ASRConfig {
  const plan=profile?planClassHotwords(profile):null
  return {family:'transcriptions-rest',dialect:'openai-compatible',baseUrl:'/api/class/asr',apiKey:'',model:'classroom-asr',sampleRate:16000,...(plan?{hotwords:plan.accepted,hotwordPrompt:plan.prompt}:{})};
}
