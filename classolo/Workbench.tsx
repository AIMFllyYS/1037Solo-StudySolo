"use client";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {get} from 'idb-keyval';
import {Download,FileText,Import,Menu,PanelRightOpen,Settings2,Sparkles,X} from 'lucide-react';
import {useAuthSession} from '@/lib/hooks/useAuthSession';
import {getOwnerEpoch} from '@/lib/storage/ownerScope';
import {redirectAccount} from '@/lib/auth/account';
import {WorkbenchShell,type ClassWorkspaceTab} from './components/layout/workbench-shell';
import {TranscriptPane} from './features/transcript/pane';
import {NotesPane} from './features/notes/pane';
import {ClassNotePane} from './features/notes/class-note-pane';
import StudioAgentPanel from '@/components/layout/StudioAgentPanel';
import {useStore as useUiStore} from '@/lib/stores/ui';
import {useAcademicYear} from '@/lib/hooks/useAcademicYear';
import type {ChatContext} from '@/lib/types/chat';
import {setClassAgentContextProvider,tailSegments} from '@/lib/class/agentContext';
import {CLASS_JUMP_EVENT,type ClassJumpDetail} from '@/lib/class/jump';
import {SilentAgentBoot} from './features/agent/silent-boot';
import {RenderHost} from './features/render-modules/host';
import {stopSession} from './features/transcript/pipeline';
import {recoverTranscriptOverflow,transcriptFlusher} from './features/transcript/flush-runtime';
import {getClassOutlineConflict,resolveClassOutlineConflict,getClassCorrectionConflicts,resolveClassCorrectionConflict,getPendingClassCorrectionCount} from './lib/db';
import {outlineSchema} from './lib/session/outline-schema';
import {SessionSidebar} from './features/session-library/sidebar';
import {startClassLiveSync} from './features/session-library/live-sync';
import {listSessionsForCurrentClassOwner,releaseClassOwnerIfCurrent} from './lib/session-list-owner';
import {refreshClassSession} from './lib/db';
import {hydrateClassSnapshot} from './features/session-library/hydrate';
import {getTranscriptPrivate} from './features/transcript/private-store';
import {DEFAULT_CLASS_COURSE_PROFILE,classCourseProfileSchema,classSubjectLabel,reviewSubjectForClass,type ClassCourseProfile} from './lib/course/profile';
import {getClassCourseDraft,saveClassCourseDraft,subscribeClassCourseDraft} from './lib/course/preference';
import {getSilentAgentPrivateState} from './features/agent/silent-machine';
import {ClassroomSettings} from './features/settings/classroom-settings';
import {generateClassroomFlashcards} from './features/notes/knowledge-cards';
import {buildClassNoteMarkdown,saveClassNote} from './features/notes/class-note';
import {requestOutlineRefresh,startOutlineOrganizer} from './features/notes/organizer';
import {getNotesPublic,getTranscriptPublic,getRenderMessages,publishCommand,subscribeCommands,subscribeNotesPublic,subscribeRenderProjection,useTranscriptPublic} from './lib/session';
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic,replaceCommitted} from './lib/session/writes/transcript';
import {resetNotesPublic,patchNotesPublic} from './lib/session/writes/notes';
import {resetRenderProjection} from './lib/session/writes/render';
import {getDb,setClassUserId,getClassUserId,subscribeClassSync,getClassRevision,getPendingCount,getSyncError,listSessions,loadClassSession,insertSession,insertTranscriptSegments,upsertNoteOutline,insertRenderMessage,flushClassPending,updateSession,setClassHydrating,isClassHydrating,getLocalClassSnapshot,type ClassSession} from './lib/db';
import './styles.css';

export default function Workbench(){
  const auth=useAuthSession();
  const courseDraft=useSyncExternalStore(subscribeClassCourseDraft,getClassCourseDraft,()=>DEFAULT_CLASS_COURSE_PROFILE);
  const authForAgent=useRef(auth.userId);authForAgent.current=auth.userId;
  const owner=useSyncExternalStore(subscribeClassSync,getClassUserId,()=>null);
  const revision=useSyncExternalStore(subscribeClassSync,getClassRevision,()=>0);
  void revision;
  const sessionId=useTranscriptPublic(s=>s.sessionId);
  // 录音开始 / 结束会改会话状态；侧栏要跟着刷新，否则停止后仍显示「录音中」。
  const recordingStatus=useTranscriptPublic(s=>s.recordingStatus);
  const [sessions,setSessions]=useState<ClassSession[]>([]);
  const [capabilities,setCapabilities]=useState<{ai:boolean;asr:boolean;image:boolean}|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const busyRef=useRef(busy);busyRef.current=busy;
  const [draft,setDraft]=useState('');const [showDraft,setShowDraft]=useState(false);
  const [selectedTab,setSelectedTab]=useState<ClassWorkspaceTab>('transcript');
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false);
  const [isMobile,setIsMobile]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(max-width: 767px)');const update=()=>setIsMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
  useEffect(()=>startOutlineOrganizer(),[]);
  useEffect(()=>subscribeCommands(command=>{if(command.type==='transcript.scrollTo')setSelectedTab('transcript')}),[]);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [agentCollapsed,setAgentCollapsed]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [toast,setToast]=useState('');
  const initialized=useRef<string|null>(null);
  const ownerEffectGeneration=useRef(0);
  const refreshSessions=useCallback(()=>{const requestedOwner=getClassUserId();if(requestedOwner)void listSessionsForCurrentClassOwner(requestedOwner,getClassUserId,getDb,listSessions,getOwnerEpoch).then(rows=>{if(rows)setSessions(rows);}).catch(()=>{});},[]);
  useEffect(()=>{
    let active=true;
    const generationRef=ownerEffectGeneration;
    ++generationRef.current;
    // Keep the old verified owner long enough to save its local tail; the auth/owner guard hides it.
    void stopSession().finally(()=>{
      if(!active)return;
      resetTranscriptPublic();resetNotesPublic();resetRenderProjection();
      setClassUserId(auth.userId);initialized.current=null;
      if(auth.userId)void listSessionsForCurrentClassOwner(auth.userId,getClassUserId,getDb,listSessions,getOwnerEpoch).then(rows=>{if(active&&rows)setSessions(rows);}).catch(e=>{if(active&&getClassUserId()===auth.userId)setError(String(e));});
    }).catch(()=>{});
    return()=>{
      active=false;
      const cleanupGeneration=++generationRef.current;
      // A replacement owner effect stops the old capture itself. Its setup
      // must win over a late cleanup from the previous account.
      void releaseClassOwnerIfCurrent({
        generation:generationRef,cleanupGeneration,owner:auth.userId,
        currentOwner:getClassUserId,stop:stopSession,clear:()=>setClassUserId(null),
      });
    };
  },[auth.userId]);
  useEffect(()=>{
    if(!owner||owner!==auth.userId)return;
    const db={userId:owner};
    const controller=new AbortController();
    void fetch("/api/class/capabilities",{credentials:"include",signal:controller.signal}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!controller.signal.aborted&&getClassUserId()===owner)setCapabilities(data);}).catch(()=>{});
    const persistOutline=async()=>{
      const id=getTranscriptPublic().sessionId;if(!id||isClassHydrating())return;
      await transcriptFlusher.flush(true);
      if(transcriptFlusher.pendingCount())return;
      if(getClassCorrectionConflicts(id).length||getPendingClassCorrectionCount(id))return;
      if(getClassUserId()!==db.userId||getTranscriptPublic().sessionId!==id||isClassHydrating())return;
      const state=getNotesPublic();
      if(!state.outlineVersion||getLocalClassSnapshot(id)?.outline?.revision===state.outlineVersion)return;
      await upsertNoteOutline(db,{sessionId:id,revision:state.outlineVersion,outline:{nodes:[...state.outlineDigest],processedSegments:state.processedSegments??{}}});
    };
    const notes=subscribeNotesPublic(s=>s.outlineVersion,()=>{void persistOutline().catch(e=>{if(getClassUserId()===db.userId)setError(String(e));});});
    const render=subscribeRenderProjection(s=>s.byId,(next,prev)=>{
      const id=getTranscriptPublic().sessionId;if(!id||isClassHydrating())return;
      for(const [key,value] of Object.entries(next)){if(value===prev[key])continue;
        void insertRenderMessage(db,{id:value.id,sessionId:id,module:value.module,version:value.version,target:value.target,props:value.props as Record<string,unknown>,source:value.meta.source,transcriptAnchor:value.meta.transcriptAnchor,createdAt:new Date(value.meta.createdAt).toISOString()}).catch(e=>{if(getClassUserId()===db.userId)setError(String(e));});
      }
    });
    const sync=()=>{void persistOutline().then(()=>flushClassPending(db)).catch(e=>{if(getClassUserId()===db.userId)setError(String(e));});};window.addEventListener('online',sync);const syncTimer=setInterval(sync,10000);
    return()=>{controller.abort();notes();render();clearInterval(syncTimer);window.removeEventListener('online',sync);};
  },[owner,auth.userId]);
  useEffect(()=>{if(owner&&owner===auth.userId&&sessionId)refreshSessions();},[owner,auth.userId,sessionId,recordingStatus,refreshSessions]);
  useEffect(()=>{
    if(!owner||owner!==auth.userId||!sessionId)return;
    let active=true;const db={userId:owner};
    const isLocalWriter=()=>{
      const state=getTranscriptPublic(),status=getNotesPublic().organizerStatus,silent=getSilentAgentPrivateState().status;
      return busyRef.current||getTranscriptPrivate().lifecycle!=='idle'||state.sessionId!==sessionId||state.recordingStatus==='recording'||state.recordingStatus==='paused'||status==='thinking'||status==='queued'||silent==='thinking'||silent==='armed';
    };
    const stop=startClassLiveSync({isVisible:()=>document.visibilityState==='visible',poll:async()=>{
      const data=await refreshClassSession(db,sessionId,isLocalWriter);
      if(active&&data&&getClassUserId()===owner&&getTranscriptPublic().sessionId===sessionId&&hydrateClassSnapshot(data))setSessions(rows=>rows.map(row=>row.id===sessionId?data.session:row));
    },subscribeWake:wake=>{
      const storage=(event:StorageEvent)=>{if(event.key===`ss-class:v1:${owner}`)wake();};
      window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('storage',storage);
      return()=>{window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('storage',storage);};
    },onError:e=>{if(active&&getClassUserId()===owner)setError(e instanceof Error?e.message:'课堂更新接收暂不可用');}});
    return()=>{active=false;stop();};
  },[owner,auth.userId,sessionId]);
  // 主 Agent 的课堂上下文：只在工作台挂载期间注册，离开 Class 模式即注销。
  const sessionsForAgent=useRef(sessions);sessionsForAgent.current=sessions;
  useEffect(()=>{
    setClassAgentContextProvider(()=>{
      const state=getTranscriptPublic();
      if(!state.sessionId||!getClassUserId()||getClassUserId()!==authForAgent.current)return null;
      const lesson=sessionsForAgent.current.find(s=>s.id===state.sessionId)??getLocalClassSnapshot(state.sessionId)?.session;
      const profile=classCourseProfileSchema.safeParse(lesson?.profile);
      return {
        sessionId:state.sessionId,
        title:(lesson?.title||'').slice(0,200),
        ...(profile.success?{profile:profile.data}:{}),
        live:state.recordingStatus==='recording'||state.recordingStatus==='paused',
        outline:getNotesPublic().outlineDigest.map(n=>n.title.slice(0,200)).filter(Boolean).slice(0,80),
        recent:tailSegments(state.committed),
      };
    });
    return()=>setClassAgentContextProvider(null);
  },[]);
  // Agent 引用〔n〕跳回文稿：同一节课直接滚动；别的课先打开再滚动。
  const pendingSegment=useRef<string|null>(null);
  useEffect(()=>{
    const onJump=(event:Event)=>{
      const {sessionId:target,segmentId}=(event as CustomEvent<ClassJumpDetail>).detail||{};
      if(!target||!segmentId)return;
      if(target===getTranscriptPublic().sessionId){setSelectedTab('transcript');requestAnimationFrame(()=>publishCommand({type:'transcript.scrollTo',segmentId,source:'agent'}));return;}
      pendingSegment.current=segmentId;void open(target);
    };
    window.addEventListener(CLASS_JUMP_EVENT,onJump);
    return()=>window.removeEventListener(CLASS_JUMP_EVENT,onJump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // 任何「发给 Agent」的入口（随堂题讲解等）都要让右栏可见，否则消息排着队看不到。
  useEffect(()=>useUiStore.subscribe((state,prev)=>{if(state.outbound&&state.outbound!==prev.outbound){setAgentCollapsed(false);if(isMobile)setSelectedTab('ask');}}),[isMobile]);
  const subjectId=useUiStore(s=>s.activeSubjectId);
  const academicYear=useAcademicYear(s=>s.year);
  const currentSession=sessionId?(sessions.find(s=>s.id===sessionId)??getLocalClassSnapshot(sessionId)?.session):null;
  const currentProfile=currentSession?.profile?classCourseProfileSchema.safeParse(currentSession.profile):null;
  const profile=currentProfile?.success?currentProfile.data:sessionId?null:courseDraft;
  const classTitle=sessionId?(currentSession?.title||'课堂'):'课堂工作台';
  // Class 不绑定 Studio 的某一页：章节定位与页正文不注入，课堂语境走 classContext。
  const agentSubject=profile?reviewSubjectForClass(profile):subjectId;
  const agentContext:ChatContext=useMemo(()=>({subjectId:agentSubject,categoryId:'',itemId:'',currentTopic:`课堂 ${classTitle}`,academicYear}),[agentSubject,classTitle,academicYear]);
  useEffect(()=>{
    if(!owner||owner!==auth.userId||initialized.current===owner)return;
    initialized.current=owner;
    const id=new URL(window.location.href).searchParams.get('session');
    const segment=new URL(window.location.href).searchParams.get('segment');
    if(segment)pendingSegment.current=segment;
    if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,auth.userId]);
  async function open(id:string){
    if(!id||busy)return;setBusy(true);setError('');
    try{
      await stopSession();const db=await getDb();await recoverTranscriptOverflow(db,id);const data=await loadClassSession(db,id);
      if(getClassUserId()!==db.userId)return;
      setClassHydrating(true);resetTranscriptPublic();resetNotesPublic();resetRenderProjection();if(!hydrateClassSnapshot(data))throw new Error('课堂归属或录音状态已变化，请重试打开');
      
      try{const url=new URL(window.location.href);url.searchParams.set('session',id);url.searchParams.delete('segment');window.history.replaceState(null,'',url);}catch{}
      const segment=pendingSegment.current;pendingSegment.current=null;
      if(segment){setSelectedTab('transcript');requestAnimationFrame(()=>publishCommand({type:'transcript.scrollTo',segmentId:segment,source:'agent'}));}
    }catch(e){setError(e instanceof Error?e.message:'打开失败');}finally{setClassHydrating(false);setBusy(false);}
  }
  async function importText(){
    if(!draft.trim()||busy)return;setBusy(true);setError('');
    try{
      await stopSession();resetTranscriptPublic();resetNotesPublic();resetRenderProjection();
      const db=await getDb();const session=await insertSession(db,{title:courseDraft.courseName||draft.trim().slice(0,35),status:'ended',asrSnapshot:{family:'text-import',dialect:'text',model:'none',baseUrl:'',sampleRate:16000},profile:courseDraft});
      patchTranscriptPublic({sessionId:session.id,recordingStatus:'stopped',autoOrganize:true});
      try{const url=new URL(window.location.href);url.searchParams.set('session',session.id);window.history.replaceState(null,'',url);}catch{}
      const paragraphs=draft.trim().split(/\n+/).filter(Boolean).flatMap(text=>text.match(/.{1,4000}/gu)||[]).slice(0,100);
      const rows=paragraphs.map((text,i)=>({id:crypto.randomUUID(),sessionId:session.id,seq:i+1,startMs:0,endMs:0,text}));
      await insertTranscriptSegments(db,rows);rows.forEach(appendCommitted);setDraft('');setShowDraft(false);refreshSessions();
    }catch(e){setError(e instanceof Error?e.message:'导入失败');}finally{setBusy(false);}
  }
  // 「新录音」= 开一节空白课：停掉当前录音、清空工作台、去掉 ?session=，文稿区回到「开始录音」。
  // 导入已有文稿是另一个入口（onImport），不再和 + 混在一起。
  async function newClass(){
    if(busy)return;
    await stopSession();resetTranscriptPublic();resetNotesPublic();resetRenderProjection();
    setShowDraft(false);setDraft('');
    try{const url=new URL(window.location.href);url.searchParams.delete('session');window.history.replaceState(null,'',url);}catch{}
  }
  async function rename(id:string,title:string){
    try{const db=await getDb();await updateSession(db,id,{title});refreshSessions();}catch(e){setError(e instanceof Error?e.message:'重命名失败');}
  }
  function saveCourseProfile(value:ClassCourseProfile){
    saveClassCourseDraft(value);
    if(!sessionId)return;
    const id=sessionId;
    setSessions(rows=>rows.map(row=>row.id===id?{...row,profile:value}:row));
    void getDb().then(db=>updateSession(db,id,{profile:value})).then(refreshSessions).catch(e=>setError(e instanceof Error?e.message:'课程学科保存失败'));
  }
  function addCourseTerm(term:string){
    const current=profile??courseDraft
    const parsed=classCourseProfileSchema.safeParse({...current,customTerms:[...current.customTerms,term]})
    if(!parsed.success){setError('本课术语无效或已达到60个上限');return}
    saveCourseProfile(parsed.data);setToast(`已将「${term}」加入本课术语；下次录音生效`)
  }
  async function resolveOutline(choice:'local'|'remote'){
    if(!sessionId)return;
    try{
      const db=await getDb();const saved=await resolveClassOutlineConflict(db,sessionId,choice);
      if(getClassUserId()!==db.userId||getTranscriptPublic().sessionId!==sessionId)return;
      const parsed=outlineSchema.safeParse(saved?.outline??{nodes:[]});
      if(parsed.success){setClassHydrating(true);try{patchNotesPublic({outlineDigest:parsed.data.nodes,processedSegments:parsed.data.processedSegments??{},outlineVersion:saved?.revision||0});}finally{setClassHydrating(false);}}
    }catch(e){setError(e instanceof Error?e.message:'导图冲突处理失败');}
  }
  async function resolveCorrection(segmentId:string,choice:'local'|'remote'){
    if(!sessionId)return;
    const id=sessionId;
    try{
      const db=await getDb(),resolved=resolveClassCorrectionConflict(db,id,segmentId,choice);
      if(!resolved||getClassUserId()!==db.userId||getTranscriptPublic().sessionId!==id)return;
      const source=getLocalClassSnapshot(id)?.transcript.find(row=>row.id===segmentId);
      if(source)replaceCommitted({...source,rawText:source.text,text:resolved.row?.correctedText??source.text,correctionRevision:resolved.row?.revision??0});
      requestOutlineRefresh(true);await resolved.pending;setError('');
    }catch(e){setError(e instanceof Error?e.message:'文稿冲突处理失败');}
  }
  async function archive(id:string){
    try{if(id===sessionId)await stopSession();const db=await getDb();await updateSession(db,id,{archived:true});if(id===sessionId){resetTranscriptPublic();resetNotesPublic();resetRenderProjection();}refreshSessions();}catch(e){setError(e instanceof Error?e.message:'归档失败');}
  }
  async function exportNote(){
    const state=getTranscriptPublic();if(!state.sessionId||!owner)return;
    const id=state.sessionId,lesson=sessions.find(s=>s.id===id)??getLocalClassSnapshot(id)?.session;
    const title=lesson?.title||'课堂笔记';
    try{
      const markdown=buildClassNoteMarkdown({sessionId:id,title,transcript:state.committed,outline:getNotesPublic().outlineDigest,renders:[...getRenderMessages('transcript'),...getRenderMessages('notes')]});
      const saved=saveClassNote({ownerId:owner,sessionId:id,noteId:lesson?.noteId,title,subjectId:profile?reviewSubjectForClass(profile):'other',markdown});
      if(lesson?.noteId!==saved.id){await updateSession(await getDb(),id,{noteId:saved.id});refreshSessions()}
      setToast(saved.status==='proposal'?'笔记原有整理已手动编辑，新增内容放入待采纳区':saved.status==='created'?'已建立本课持续笔记':saved.status==='updated'?'已更新本课持续笔记':'已打开本课笔记');
    }catch(cause){setError(cause instanceof Error?cause.message:'保存课堂笔记失败')}
  }
  async function makeCards(){
    if(!sessionId||busy)return;const id=sessionId,currentOwner=owner;setBusy(true);setToast('正在整理全课知识卡片…');
    try{
      await transcriptFlusher.flush(true);
      if(transcriptFlusher.pendingCount())throw new Error('文稿尚未全部保存，稍后重试出卡')
      if(currentOwner!==getClassUserId()||getTranscriptPublic().sessionId!==id)return
      const title=sessions.find(s=>s.id===id)?.title;
      const result=await generateClassroomFlashcards({sessionId:id,title,subjectId:profile?reviewSubjectForClass(profile):'other',sourceLabel:profile?classSubjectLabel(profile):undefined});
      if(currentOwner===getClassUserId()&&getTranscriptPublic().sessionId===id)setToast(result.error?result.error:`已生成 ${result.saved} 张知识卡片`);
    }catch(cause){setToast(cause instanceof Error?cause.message:'出卡失败，请重试')}
    finally{setBusy(false)}
  }
  async function downloadAudio(){
    if(!owner||!sessionId)return;
    const rows=await get<{key:string;sessionId:string}[]>(`ss-class-audio-index:${owner}`);
    const selected=(rows||[]).filter(r=>r.sessionId===sessionId);
    if(!selected.length){setError('当前设备没有这节课的原始音频；云端同步的是文稿与课堂产物。');return;}
    const {zipSync}=await import('fflate');const files:Record<string,Uint8Array>={};
    for(let i=0;i<selected.length;i++){const data=await get<ArrayBuffer>(selected[i].key);if(data)files[`part-${String(i+1).padStart(4,'0')}.wav`]=new Uint8Array(data);}
    const bytes=zipSync(files,{level:0});const url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'}));
    const a=document.createElement('a');a.href=url;a.download=`class-${sessionId}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  // issue #65：录音结束后自动整理知识卡片（每节课只自动一次，写入复习闪卡）。
  // 等 8 秒让最后一段转写和大纲落定；文稿太短（<120 字）不值得出卡。
  const prevRecording=useRef(recordingStatus);
  const sessionsRef=useRef(sessions);sessionsRef.current=sessions;
  const autoCardTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(autoCardTimer.current)clearTimeout(autoCardTimer.current);},[]);
  useEffect(()=>{
    const prev=prevRecording.current;prevRecording.current=recordingStatus;
    if(!owner||!sessionId||recordingStatus!=='stopped'||(prev!=='recording'&&prev!=='paused'))return;
    const key=`ss-class-autocards:${owner}:${sessionId}`;
    try{if(localStorage.getItem(key))return;}catch{return;}
    if(autoCardTimer.current)clearTimeout(autoCardTimer.current);
    autoCardTimer.current=setTimeout(()=>{
      autoCardTimer.current=null;
      if(getTranscriptPublic().sessionId!==sessionId)return;
      const chars=getTranscriptPublic().committed.reduce((n,s)=>n+s.text.length,0);
      if(chars<120)return;
      const title=sessionsRef.current.find(s=>s.id===sessionId)?.title;
      const source=sessionsRef.current.find(s=>s.id===sessionId)??getLocalClassSnapshot(sessionId)?.session;
      const savedProfile=source?.profile?classCourseProfileSchema.safeParse(source.profile):null;
      const category=savedProfile?.success?savedProfile.data:null;
      void transcriptFlusher.flush(true).then(()=>{
        if(transcriptFlusher.pendingCount())throw new Error('文稿尚未全部保存');
        if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return {saved:0,error:'课堂已切换'};
        return generateClassroomFlashcards({sessionId,title,subjectId:category?reviewSubjectForClass(category):'other',sourceLabel:category?classSubjectLabel(category):undefined});
      }).then(r=>{
        if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return;
        if(!r.error)try{localStorage.setItem(key,new Date().toISOString())}catch{}
        setToast(r.error?`自动出卡未完成：${r.error}`:`已自动生成 ${r.saved} 张知识卡片，可在 Review 模式复习`);
      }).catch(cause=>{if(getClassUserId()===owner)setToast(`自动出卡未完成：${cause instanceof Error?cause.message:'请重试'}`)});
    },8000);
  },[recordingStatus,owner,sessionId]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t);},[toast]);
  if(auth.status==='loading')return <div className="p-8 text-sm text-[color:var(--ink-soft)]">正在验证课堂账号…</div>;
  if(!auth.userId)return <section className="m-6 rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-8"><h1 className="text-2xl font-semibold text-[color:var(--ink)]">课堂工作台</h1><p className="my-4 text-[color:var(--ink-soft)]">登录后录音、整理笔记与课堂提问，课堂产物随账号同步。</p><button className="rounded-xl bg-[color:var(--accent)] px-5 py-3 text-[color:var(--md-sys-color-on-primary)]" onClick={()=>redirectAccount()}>登录统一账号</button></section>;
  if(owner!==auth.userId)return <div className="p-8 text-sm text-[color:var(--ink-soft)]">正在安全切换课堂空间…</div>;
  return <div className="ss-class-workbench relative flex h-full min-h-0 w-full overflow-hidden" key={owner}>
    {libraryOpen&&<button type="button" aria-label="关闭课堂列表" className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={()=>setLibraryOpen(false)}/>}
    <div className={`${libraryOpen?'absolute inset-y-0 left-0 z-40':'hidden'} md:relative md:z-auto md:block`}><SessionSidebar sessions={sessions} currentId={sessionId} liveStatus={recordingStatus==='recording'||recordingStatus==='paused'?recordingStatus:undefined} collapsed={isMobile?false:sidebarCollapsed} pendingCount={getPendingCount()} busy={busy} onToggle={()=>isMobile?setLibraryOpen(false):setSidebarCollapsed(v=>!v)} onOpen={id=>{setLibraryOpen(false);void open(id)}} onNew={()=>{setLibraryOpen(false);void newClass()}} onImport={()=>{setLibraryOpen(false);setShowDraft(true)}} onOpenSettings={()=>{setLibraryOpen(false);setShowSettings(true)}} onRename={(id,t)=>void rename(id,t)} onArchive={id=>void archive(id)}/></div>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] px-3 py-2">
        <button type="button" className="ss-tool md:hidden" aria-label="打开课堂列表" onClick={()=>setLibraryOpen(true)}><Menu className="size-4"/></button>
        <div className="mr-auto min-w-0">
          <p className="truncate text-[13px] font-medium text-[color:var(--ink)]">{sessionId?(sessions.find(s=>s.id===sessionId)?.title||'课堂'):'课堂工作台'}</p>
          <button className="text-left text-[11px] text-[color:var(--ink-faint)] hover:underline" onClick={()=>setShowSettings(true)} aria-label="选择课堂学科">{profile?classSubjectLabel(profile):'旧课堂 · 未分类'} · 文稿、导图与提问相互关联</button>
          <p className="text-[10px] text-[color:var(--ink-faint)]">{recordingStatus==='recording'?'正在录音':recordingStatus==='paused'?'录音已暂停':getPendingCount()?'有待同步课堂数据':sessionId?'课堂数据已缓存':'等待开始课堂'}</p>
        </div>
        <button className="ss-tool hidden lg:inline-flex" onClick={()=>setShowDraft(v=>!v)}><Import className="size-3.5"/>导入文稿</button>
        <button className="ss-tool md:hidden" onClick={()=>setSelectedTab('resources')}>资料</button>
        <button className="ss-tool hidden lg:inline-flex" disabled={!sessionId} onClick={()=>void exportNote()}><FileText className="size-3.5"/>整理笔记</button>
        <button className="ss-tool hidden lg:inline-flex" disabled={!sessionId||busy} onClick={()=>void makeCards()} title="从本节课生成知识卡片（进入复习闪卡）"><Sparkles className="size-3.5"/>知识卡片</button>
        <button className="ss-tool hidden lg:inline-flex" disabled={!sessionId} aria-label="导出录音" title="导出本机录音（ZIP）" onClick={()=>void downloadAudio()}><Download className="size-3.5"/></button>
        <button className="ss-tool hidden lg:inline-flex" aria-label="课堂设置" onClick={()=>setShowSettings(true)}><Settings2 className="size-3.5"/></button>
        <button type="button" className="ss-tool lg:hidden" aria-label="更多课堂操作" aria-expanded={moreOpen} onClick={()=>setMoreOpen(value=>!value)}>更多</button>
        {agentCollapsed&&<button className="ss-tool" aria-label="展开 Agent" title="展开 Agent" onClick={()=>setAgentCollapsed(false)}><PanelRightOpen className="size-3.5"/></button>}
      </header>
      {moreOpen&&<div className="absolute right-2 top-12 z-20 grid w-44 gap-1 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-2 shadow-lg lg:hidden"><button className="ss-nav-link" onClick={()=>{setShowDraft(true);setMoreOpen(false)}}>导入文稿</button><button className="ss-nav-link" disabled={!sessionId} onClick={()=>{void exportNote();setMoreOpen(false)}}>整理笔记</button><button className="ss-nav-link" disabled={!sessionId||busy} onClick={()=>{void makeCards();setMoreOpen(false)}}>生成知识卡片</button><button className="ss-nav-link" disabled={!sessionId} onClick={()=>{void downloadAudio();setMoreOpen(false)}}>导出本机录音</button><button className="ss-nav-link" onClick={()=>{setShowSettings(true);setMoreOpen(false)}}>课堂设置</button></div>}
      {(error||getSyncError())&&<p role="alert" className="m-2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-muted)] p-2 text-[12px] text-[color:var(--ink)]">{error||getSyncError()} <button className="underline" onClick={()=>{setError('');void getDb().then(flushClassPending);}}>重试同步</button></p>}
      {sessionId&&getClassOutlineConflict(sessionId)&&<div role="status" className="mx-3 my-2 rounded-lg border border-[color:var(--line-soft)] p-3 text-[12px]">此课导图在另一设备更新，本地草稿仍保留。<div className="mt-2 flex gap-2"><button className="ss-tool" onClick={()=>void resolveOutline('remote')}>采用云端版本</button><button className="ss-tool" onClick={()=>void resolveOutline('local')}>保留本地导图并同步</button></div></div>}
      {sessionId&&getClassCorrectionConflicts(sessionId).map(conflict=><div key={conflict.segmentId} role="status" className="mx-3 my-2 rounded-lg border border-[color:var(--line-soft)] p-3 text-[12px]"><p>这段文稿在另一设备更正，本地修改已保留。</p><p className="mt-1 whitespace-pre-wrap">本地：{conflict.local.correctedText}</p><p className="whitespace-pre-wrap">云端：{conflict.remote?.correctedText??getLocalClassSnapshot(sessionId)?.transcript.find(row=>row.id===conflict.segmentId)?.text??'原始文稿'}</p><div className="mt-2 flex gap-2"><button className="ss-tool" onClick={()=>void resolveCorrection(conflict.segmentId,'remote')}>采用云端文稿</button><button className="ss-tool" onClick={()=>void resolveCorrection(conflict.segmentId,'local')}>保留本地更正</button></div></div>)}
      {capabilities&&!capabilities.asr&&<p className="px-3 py-1 text-[11px] text-[color:var(--ink-faint)]">语音转写服务暂未启用；可以导入已有文稿继续整理与提问。</p>}
      {showDraft&&<div className="border-b border-[color:var(--line-soft)] p-3"><textarea aria-label="已有课堂文稿" className="h-24 w-full rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-3 text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]" maxLength={100000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="粘贴已有文稿，或补充课堂记录。导入后会生成提纲与补充解析。"/><div className="mt-2 flex gap-2"><button className="ss-tool" disabled={busy||!draft.trim()} onClick={()=>void importText()}>创建课堂并整理</button><button className="ss-tool" onClick={()=>{setShowDraft(false);setDraft('');}}>取消</button></div></div>}
      <div className="relative min-h-0 flex-1"><SilentAgentBoot/><WorkbenchShell chrome={false} selected={selectedTab} onSelect={setSelectedTab} note={<ClassNotePane sessionId={sessionId} noteId={currentSession?.noteId} ownerId={owner} onOrganize={()=>void exportNote()}/>} transcript={<TranscriptPane enabled={capabilities?.asr!==false} profile={profile??DEFAULT_CLASS_COURSE_PROFILE} onAddTerm={addCourseTerm}/>} notes={<NotesPane/>} transcriptRender={<RenderHost target="transcript" onAnchorClick={id=>{setSelectedTab('transcript');requestAnimationFrame(()=>publishCommand({type:'transcript.scrollTo',segmentId:id,source:'render'}))}}/>} notesRender={<RenderHost target="notes" onAnchorClick={id=>{setSelectedTab('transcript');requestAnimationFrame(()=>publishCommand({type:'transcript.scrollTo',segmentId:id,source:'render'}))}}/>} ask={isMobile?<StudioAgentPanel chatContext={agentContext} onCollapse={()=>setSelectedTab('transcript')}/>:undefined}/></div>
    </div>
    {/* Agent 栏：和 Studio 右栏同一个面板、同一条横向缓动；收起时保持挂载（对话流与草稿不丢）。 */}
    {!isMobile&&<div className={`ss-rail ss-class-agent hidden min-h-0 md:block ${agentCollapsed?'w-0 min-w-0':'w-[clamp(320px,28vw,440px)] min-w-[320px]'}`} aria-hidden={agentCollapsed||undefined} inert={agentCollapsed||undefined}>
      <div className="h-full w-[clamp(320px,28vw,440px)]"><StudioAgentPanel chatContext={agentContext} onCollapse={()=>setAgentCollapsed(true)}/></div>
    </div>}
    {toast&&<div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] shadow-lg"><span className="inline-flex items-center gap-1.5">{toast}<button className="pointer-events-auto" onClick={()=>setToast('')}><X className="size-3"/></button></span></div>}
    <ClassroomSettings open={showSettings} onOpenChange={setShowSettings} capabilities={capabilities} profile={profile??courseDraft} sessionId={sessionId} recording={recordingStatus==='recording'||recordingStatus==='paused'} onSaveProfile={saveCourseProfile}/>
  </div>;
}
