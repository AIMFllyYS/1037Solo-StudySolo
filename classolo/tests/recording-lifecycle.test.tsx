import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({owner:'11111111-1111-4111-8111-111111111111',capture:vi.fn(),stopCapture:vi.fn(),persist:vi.fn(),flush:vi.fn(),pending:vi.fn(),update:vi.fn(),start:vi.fn(),stop:vi.fn(),factory:vi.fn(),final:undefined as undefined|((s:{text:string;id?:string;seq?:number})=>void)}))
vi.mock('@/classolo/lib/db',()=>({getClassUserId:()=>f.owner,getDb:async()=>({userId:f.owner}),updateSession:f.update}))
vi.mock('@/classolo/features/transcript/capture',()=>({startCapture:f.capture,stopCapture:f.stopCapture,onPcmFrame:vi.fn(),onCaptureEnded:vi.fn(),pauseCapture:vi.fn(),resumeCapture:vi.fn()}))
vi.mock('@/classolo/features/transcript/flush-runtime',()=>({persistRecordingSession:f.persist,transcriptFlusher:{attach:vi.fn(),enqueue:vi.fn(),flush:f.flush,pendingCount:f.pending}}))
vi.mock('@/classolo/lib/providers/asr',()=>({createASRProvider:f.factory}))
import {startSession,stopSession} from '@/classolo/features/transcript/pipeline'
import {getTranscriptPublic} from '@/classolo/lib/session'
import {appendCommitted,patchTranscriptPublic,resetTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {getTranscriptPrivate,resetTranscriptPrivate} from '@/classolo/features/transcript/private-store'
beforeEach(()=>{
  vi.clearAllMocks();resetTranscriptPublic();resetTranscriptPrivate();f.owner='11111111-1111-4111-8111-111111111111'
  f.capture.mockResolvedValue(true);f.stopCapture.mockResolvedValue(undefined);f.start.mockResolvedValue(undefined);f.stop.mockResolvedValue(undefined);f.persist.mockResolvedValue(undefined);f.flush.mockResolvedValue(true);f.pending.mockReturnValue(0);f.update.mockResolvedValue(undefined)
  f.factory.mockReturnValue({capabilities:{streaming:'pseudo'},start:f.start,stop:f.stop,sendAudio:vi.fn(),onPartial:vi.fn(),onError:vi.fn(),onFinal:(cb:typeof f.final)=>{f.final=cb}})
})
afterEach(async()=>{f.stop.mockResolvedValue(undefined);f.pending.mockReturnValue(0);await stopSession()})
describe('recording lifecycle',()=>{
  it('does not mark a class recorded by another device as ended when merely viewing it',async()=>{
    patchTranscriptPublic({sessionId:'remote-class',recordingStatus:'stopped'});await stopSession();expect(f.update).not.toHaveBeenCalled()
  })
  it('keeps the previous class when microphone permission fails',async()=>{
    patchTranscriptPublic({sessionId:'previous',recordingStatus:'stopped'});appendCommitted({id:'old',seq:1,text:'旧课堂',startMs:0,endMs:1000})
    f.capture.mockResolvedValue(false);await startSession()
    expect(getTranscriptPublic().sessionId).toBe('previous');expect(getTranscriptPublic().committed[0].text).toBe('旧课堂');expect(f.persist).not.toHaveBeenCalled();expect(f.factory).not.toHaveBeenCalled()
  })
  it('coalesces double starts instead of opening two microphones or sessions',async()=>{
    let ready!:(value:boolean)=>void;f.capture.mockImplementation(()=>new Promise<boolean>(r=>{ready=r}))
    const a=startSession(),b=startSession();expect(a).toBe(b);await Promise.resolve();ready(true);await a
    expect(f.capture).toHaveBeenCalledOnce();expect(f.persist).toHaveBeenCalledOnce();expect(f.factory).toHaveBeenCalledOnce()
  })
  it('marks stopped only after the provider tail and persistence drain finish',async()=>{
    await startSession();let release!:()=>void,entered!:()=>void
    const started=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r})
    f.stop.mockImplementation(async()=>{entered();await gate;f.final?.({id:'tail',seq:2,text:'尾段'})})
    const stopping=stopSession();await started
    expect(getTranscriptPublic().recordingStatus).toBe('recording');expect(getTranscriptPrivate().lifecycle).toBe('stopping');expect(f.update).not.toHaveBeenCalled()
    release();await stopping
    expect(getTranscriptPublic().committed.at(-1)?.id).toBe('tail');expect(getTranscriptPublic().recordingStatus).toBe('stopped');expect(f.flush).toHaveBeenCalledWith(true);expect(f.update).toHaveBeenCalledWith(expect.anything(),expect.anything(),{status:'ended'})
  })
  it('does not create a class if identity changes while microphone initialization is pending',async()=>{
    let ready!:(value:boolean)=>void;f.capture.mockImplementation(()=>new Promise<boolean>(r=>{ready=r}))
    const starting=startSession();await Promise.resolve();f.owner='44444444-4444-4444-8444-444444444444';ready(true);await starting
    expect(f.persist).not.toHaveBeenCalled();expect(f.factory).not.toHaveBeenCalled();expect(f.stopCapture).toHaveBeenCalled()
  })
})
