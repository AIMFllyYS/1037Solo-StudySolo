import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {setClassUserId} from '@/classolo/lib/db'
import {patchTranscriptPublic,resetTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {OpenAiCompatibleTranscriptionsProvider,defaultTranscriptionsFetch,ASRRequestError,pcm16ToWav,type TranscriptionsRequest} from '@/classolo/lib/providers/asr/transcriptions-rest/openai-compatible'
import {listAudioJobs,persistAudioJob} from '@/classolo/features/transcript/audio-jobs'
import {recoverAudioJob} from '@/classolo/features/transcript/recover-audio'
import {getTranscriptPublic} from '@/classolo/lib/session'
const mem=vi.hoisted(()=>new Map<string,unknown>())
vi.mock('idb-keyval',()=>({get:async(k:string)=>mem.get(k),set:async(k:string,v:unknown)=>{mem.set(k,v)},update:async(k:string,fn:(v:unknown)=>unknown)=>{mem.set(k,fn(mem.get(k)))}}))
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const config={family:'transcriptions-rest' as const,baseUrl:'/api/class/asr',apiKey:'',model:'classroom-asr',sampleRate:16000}
beforeEach(()=>{mem.clear();setClassUserId(owner);resetTranscriptPublic();patchTranscriptPublic({sessionId:sid})})
afterEach(()=>{setClassUserId(null);vi.unstubAllGlobals()})
describe('bounded ASR jobs',()=>{
  it('keeps eight-second slices and contiguous offsets while the first request is blocked',async()=>{
    let release!:(s:string)=>void
    const requests:TranscriptionsRequest[]=[],finals:{startMs?:number;endMs?:number}[]=[]
    const transcribe=vi.fn(async(req:TranscriptionsRequest)=>{requests.push(req);if(requests.length===1)return new Promise<string>(r=>{release=r});return '文稿'})
    const p=new OpenAiCompatibleTranscriptionsProvider(config,transcribe);p.onFinal(s=>finals.push(s));await p.start()
    p.sendAudio(new Int16Array(128000).buffer);await Promise.resolve();await Promise.resolve()
    p.sendAudio(new Int16Array(61*16000).buffer);const stopping=p.stop();release('文稿');await stopping
    expect(requests).toHaveLength(9);expect(requests.every(r=>r.wav.byteLength<=256044)).toBe(true)
    expect(finals.map(s=>[s.startMs,s.endMs])).toEqual(Array.from({length:9},(_,i)=>[i*8000,Math.min((i+1)*8000,69000)]))
  })
  it('persists queued jobs before a slow network request returns',async()=>{
    let release!:(r:Response)=>void,entered!:()=>void
    const started=new Promise<void>(r=>{entered=r})
    const fetcher=vi.fn(async()=>{if(fetcher.mock.calls.length===1){entered();return new Promise<Response>(r=>{release=r})}return Response.json({text:'文稿'})})
    vi.stubGlobal('fetch',fetcher)
    const p=new OpenAiCompatibleTranscriptionsProvider(config);await p.start();p.sendAudio(new Int16Array(128000).buffer);await started
    p.sendAudio(new Int16Array(128000).buffer);await Promise.resolve();await Promise.resolve()
    expect(await listAudioJobs(owner,sid)).toHaveLength(2)
    const stopping=p.stop();release(Response.json({text:'文稿'}));await stopping
    expect((await listAudioJobs(owner,sid)).map(j=>j.status)).toEqual(['complete','complete'])
  })
  it('retains failed audio with an explicit retryable outcome and never retries an uncertain provider call automatically',async()=>{
    const wav=pcm16ToWav(new Int16Array(16000),16000),requestId=crypto.randomUUID()
    const key=await persistAudioJob({ownerId:owner,sessionId:sid,requestId,wav,startMs:0,endMs:1000})
    const fetcher=vi.fn(async()=>Response.json({error:'synthetic rejection',outcome:'retryable'},{status:502}));vi.stubGlobal('fetch',fetcher)
    const request={...config,url:'/api/class/asr/audio/transcriptions',wav,ownerId:owner,sessionId:sid,requestId,audioKey:key}
    await expect(defaultTranscriptionsFetch(request)).rejects.toBeInstanceOf(ASRRequestError)
    expect((await listAudioJobs(owner,sid))[0].status).toBe('retryable')
    fetcher.mockRejectedValue(new TypeError('disconnected after sending'))
    await expect(defaultTranscriptionsFetch({...request,requestId:crypto.randomUUID()})).rejects.toThrow()
    expect((await listAudioJobs(owner,sid))[0].status).toBe('uncertain');expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('restores a cached successful transcript without invoking ASR or changing its permanent ID',async()=>{
    localStorage.setItem(`ss-class:v1:${owner}`,JSON.stringify({sessions:{[sid]:{session:{id:sid,userId:owner},transcript:[],outline:null,renders:[],chat:[]}},pending:[]}))
    const fetcher=vi.fn(async(url:RequestInfo|URL)=>{expect(String(url)).toContain('/api/class/state');return Response.json({ok:true})});vi.stubGlobal('fetch',fetcher)
    const id=crypto.randomUUID(),job={key:'cached-audio',id,seq:2,sessionId:sid,requestId:id,bytes:32044,createdAt:0,startMs:8000,endMs:9000,status:'complete' as const,text:'已成功识别的尾段'}
    await recoverAudioJob({userId:owner},job);await recoverAudioJob({userId:owner},job)
    expect(getTranscriptPublic().committed).toHaveLength(1);expect(getTranscriptPublic().committed[0]).toMatchObject({id,seq:2,text:job.text})
    expect(fetcher.mock.calls.every(call=>String(call[0]).includes('/api/class/state'))).toBe(true)
  })
  it('refuses to replay an uncertain job before any network or persistence call',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
    const id=crypto.randomUUID()
    await expect(recoverAudioJob({userId:owner},{key:'uncertain',id,seq:1,sessionId:sid,requestId:id,bytes:32044,createdAt:0,startMs:0,endMs:1000,status:'uncertain'})).rejects.toThrow('核对')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
