import type {ASRConfig} from '@/classolo/lib/providers/asr';
export function readAsrRuntimeConfig():ASRConfig {
  return {family:'transcriptions-rest',dialect:'openai-compatible',baseUrl:'/api/class/asr',apiKey:'',model:'classroom-asr',sampleRate:16000};
}
