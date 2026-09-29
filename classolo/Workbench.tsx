"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {get} from 'idb-keyval';
import {Download,FileText,Import,PanelRightClose,PanelRightOpen,Settings2,Sparkles,X} from 'lucide-react';
import {useAuthSession} from '@/lib/hooks/useAuthSession';
import {redirectAccount} from '@/lib/auth/account';
import {createAndOpenNote} from '@/lib/notes/openUserNote';
import {WorkbenchShell} from './components/layout/workbench-shell';
import {TranscriptPane} from './features/transcript/pane';
import {NotesPane} from './features/notes/pane';
import {ChatPanel} from './features/agent/chat-panel';
import {SilentAgentBoot} from './features/agent/silent-boot';
import {RenderHost} from './features/render-modules/host';
import {resetChatPrivate} from './features/agent/chat-store';
import {resetChatPersistSeq,hydrateChatHistory} from './features/agent/chat-persist';
import {stopSession} from './features/transcript/pipeline';
import {SessionSidebar} from './features/session-library/sidebar';
import {ClassroomSettings} from './features/settings/classroom-settings';
import {generateClassroomFlashcards} from './features/notes/knowledge-cards';
import {getNotesPublic,getTranscriptPublic,publishCommand,subscribeNotesPublic,subscribeRenderProjection,useTranscriptPublic} from './lib/session';
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic} from './lib/session/writes/transcript';
import {resetNotesPublic,patchNotesPublic} from './lib/session/writes/notes';
import {resetRenderProjection,upsertRenderMessage} from './lib/session/writes/render';
import {getDb,setClassUserId,getClassUserId,subscribeClassSync,getClassRevision,getPendingCount,getSyncError,listSessions,loadClassSession,insertSession,insertTranscriptSegments,upsertNoteOutline,insertRenderMessage,flushClassPending,updateSession,setClassHydrating,isClassHydrating,getLocalClassSnapshot,type ClassSession} from './lib/db';
import type {RenderMessage} from './features/render-modules/types';
import './styles.css';

export default function Workbench(){
  const auth=useAuthSession();
  const owner=useSyncExternalStore(subscribeClassSync,getClassUserId,()=>null);
  const revision=useSyncExternalStore(subscribeClassSync,getClassRevision,()=>0);
  void revision;
  const sessionId=useTranscriptPublic(s=>s.sessionId);
  // 录音开始 / 结束会改会话状态；侧栏要跟着刷新，否则停止后仍显示「录音中」。
  const recordingStatus=useTranscriptPublic(s=>s.recordingStatus);
  const [sessions,setSessions]=useState<ClassSession[]>([]);
  const [capabilities,setCapabilities]=useState<{ai:boolean;asr:boolean;image:boolean}|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState('');const [showDraft,setShowDraft]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [agentCollapsed,setAgentCollapsed]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [toast,setToast]=useState('');
  const initialized=useRef<string|null>(null);
  const refreshSessions=useCallback(()=>{if(getClassUserId())void getDb().then(listSessions).then(rows=>{if(getClassUserId())setSessions(rows);}).catch(()=>{});},[]);
  useEffect(()=>{
    let active=true;
    setClassUserId(null);
    void stopSession().finally(()=>{
      if(!active)return;
      resetTranscriptPublic();resetNotesPublic();resetRenderProjection();resetChatPrivate();resetChatPersistSeq();
      setClassUserId(auth.userId);initialized.current=null;
      if(auth.userId)void getDb().then(listSessions).then(rows=>{if(active)setSessions(rows);}).catch(e=>{if(active)setError(String(e));});
    });
    return()=>{active=false;setClassUserId(null);void stopSession();};
  },[auth.userId]);
  useEffect(()=>{
    if(!owner||owner!==auth.userId)return;
    const db={userId:owner};
    void fetch("/api/class/capabilities",{credentials:"include"}).then(async response=>{if(response.ok&&getClassUserId()===owner)setCapabilities(await response.json());}).catch(()=>{});
    const notes=subscribeNotesPublic(s=>s.outlineVersion,()=>{
      const id=getTranscriptPublic().sessionId;if(!id||isClassHydrating())return;
      const state=getNotesPublic();void upsertNoteOutline(db,{sessionId:id,revision:state.outlineVersion,outline:{nodes:[...state.outlineDigest]}}).catch(e=>setError(String(e)));
    });
    const render=subscribeRenderProjection(s=>s.byId,(next,prev)=>{
      const id=getTranscriptPublic().sessionId;if(!id||isClassHydrating())return;
      for(const [key,value] of Object.entries(next)){if(value===prev[key])continue;
        void insertRenderMessage(db,{id:value.id,sessionId:id,module:value.module,version:value.version,target:value.target,props:value.props as Record<string,unknown>,source:value.meta.source,transcriptAnchor:value.meta.transcriptAnchor,createdAt:new Date(value.meta.createdAt).toISOString()}).catch(e=>setError(String(e)));
      }
    });
    const sync=()=>{void flushClassPending(db);};window.addEventListener('online',sync);const syncTimer=setInterval(sync,10000);
    return()=>{notes();render();clearInterval(syncTimer);window.removeEventListener('online',sync);};
  },[owner,auth.userId]);
  useEffect(()=>{if(owner&&owner===auth.userId&&sessionId)refreshSessions();},[owner,auth.userId,sessionId,recordingStatus,refreshSessions]);
  useEffect(()=>{
    if(!owner||owner!==auth.userId||initialized.current===owner)return;
    initialized.current=owner;
    const id=new URL(window.location.href).searchParams.get('session');
    if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,auth.userId]);
  async function open(id:string){
    if(!id||busy)return;setBusy(true);setError('');
    try{
      await stopSession();const db=await getDb();const data=await loadClassSession(db,id);
      if(getClassUserId()!==db.userId)return;
      setClassHydrating(true);resetTranscriptPublic();resetNotesPublic();resetRenderProjection();resetChatPrivate();resetChatPersistSeq();
      patchTranscriptPublic({sessionId:id,recordingStatus:'stopped'});
      for(const row of data.transcript)appendCommitted(row);
      const nodes=data.outline?.outline.nodes;
      if(Array.isArray(nodes))patchNotesPublic({outlineDigest:nodes as {id:string;title:string;parentId?:string|null}[],outlineVersion:data.outline?.revision||0});
      for(const row of data.renders)upsertRenderMessage({id:row.id,module:row.module,version:row.version,target:row.target as RenderMessage['target'],props:row.props,meta:{source:row.source as RenderMessage['meta']['source'],createdAt:new Date(row.createdAt||Date.now()).getTime(),...(row.transcriptAnchor?{transcriptAnchor:row.transcriptAnchor}:{})}});
      if(Array.isArray(data.chat))hydrateChatHistory(data.chat);
      try{const url=new URL(window.location.href);url.searchParams.set('session',id);window.history.replaceState(null,'',url);}catch{}
    }catch(e){setError(e instanceof Error?e.message:'打开失败');}finally{setClassHydrating(false);setBusy(false);}
  }
  async function importText(){
    if(!draft.trim()||busy)return;setBusy(true);setError('');
    try{
      await stopSession();resetTranscriptPublic();resetNotesPublic();resetRenderProjection();resetChatPrivate();resetChatPersistSeq();
      const db=await getDb();const session=await insertSession(db,{title:draft.trim().slice(0,35),status:'ended',asrSnapshot:{family:'text-import',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}});
      patchTranscriptPublic({sessionId:session.id,recordingStatus:'stopped'});
      try{const url=new URL(window.location.href);url.searchParams.set('session',session.id);window.history.replaceState(null,'',url);}catch{}
      const paragraphs=draft.trim().split(/\n+/).filter(Boolean).flatMap(text=>text.match(/.{1,4000}/gu)||[]).slice(0,100);
      const rows=paragraphs.map((text,i)=>({id:crypto.randomUUID(),sessionId:session.id,seq:i+1,startMs:0,endMs:0,text}));
      await insertTranscriptSegments(db,rows);rows.forEach(appendCommitted);setDraft('');setShowDraft(false);refreshSessions();
    }catch(e){setError(e instanceof Error?e.message:'导入失败');}finally{setBusy(false);}
  }
  async function newClass(){
    if(busy)return;setShowDraft(true);
  }
  async function rename(id:string,title:string){
    try{const db=await getDb();await updateSession(db,id,{title});refreshSessions();}catch(e){setError(e instanceof Error?e.message:'重命名失败');}
  }
  async function archive(id:string){
    try{const db=await getDb();await updateSession(db,id,{archived:true});if(id===sessionId){resetTranscriptPublic();resetNotesPublic();resetRenderProjection();resetChatPrivate();}refreshSessions();}catch(e){setError(e instanceof Error?e.message:'归档失败');}
  }
  function exportNote(){
    const state=getTranscriptPublic();if(!state.sessionId)return;
    const title=sessions.find(s=>s.id===state.sessionId)?.title||'课堂笔记';
    const supplements=Object.values(getLocalClassSnapshot(state.sessionId)?.renders||[]).filter(r=>r.module==='rich-text'&&typeof (r.props as {markdown?:string}).markdown==='string').map(r=>(r.props as {markdown:string}).markdown);
    const markdown=`# ${title}\n\n[来源课堂](/class?session=${state.sessionId})\n\n## 提纲\n${getNotesPublic().outlineDigest.map(n=>`${n.parentId?'  - ':'- '}${n.title}`).join('\n')}\n\n## 课堂补充\n${supplements.join('\n\n')||'（无）'}\n\n## 文稿\n${state.committed.map(s=>s.text).join('\n\n')}`;
    createAndOpenNote(null,{title,markdown});
    setToast('已存为学习笔记');
  }
  async function makeCards(){
    if(!sessionId||busy)return;setBusy(true);setToast('正在生成知识卡片…');
    const title=sessions.find(s=>s.id===sessionId)?.title;
    const result=await generateClassroomFlashcards({title});
    setToast(result.error?result.error:`已生成 ${result.saved} 张知识卡片`);
    setBusy(false);
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
      try{localStorage.setItem(key,new Date().toISOString());}catch{}
      const title=sessionsRef.current.find(s=>s.id===sessionId)?.title;
      void generateClassroomFlashcards({title}).then(r=>setToast(r.error?`自动出卡未完成：${r.error}`:`已自动生成 ${r.saved} 张知识卡片，可在 Review 模式复习`));
    },8000);
  },[recordingStatus,owner,sessionId]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t);},[toast]);
  if(auth.status==='loading')return <div className="p-8 text-sm text-[color:var(--ink-soft)]">正在验证课堂账号…</div>;
  if(!auth.userId)return <section className="m-6 rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-8"><h1 className="text-2xl font-semibold text-[color:var(--ink)]">课堂工作台</h1><p className="my-4 text-[color:var(--ink-soft)]">登录后录音、整理笔记与课堂提问，课堂产物随账号同步。</p><button className="rounded-xl bg-[color:var(--accent)] px-5 py-3 text-[color:var(--accent-ink)]" onClick={()=>redirectAccount()}>登录统一账号</button></section>;
  if(owner!==auth.userId)return <div className="p-8 text-sm text-[color:var(--ink-soft)]">正在安全切换课堂空间…</div>;
  return <div className="ss-class-workbench relative flex h-full min-h-0 w-full overflow-hidden" key={owner}>
    <SessionSidebar sessions={sessions} currentId={sessionId} liveStatus={recordingStatus} collapsed={sidebarCollapsed} pendingCount={getPendingCount()} busy={busy} onToggle={()=>setSidebarCollapsed(v=>!v)} onOpen={id=>void open(id)} onNew={()=>void newClass()} onRename={(id,t)=>void rename(id,t)} onArchive={id=>void archive(id)}/>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] px-3 py-2">
        <div className="mr-auto min-w-0">
          <p className="truncate text-[13px] font-medium text-[color:var(--ink)]">{sessionId?(sessions.find(s=>s.id===sessionId)?.title||'课堂'):'课堂工作台'}</p>
          <p className="text-[11px] text-[color:var(--ink-faint)]">文稿、思维导图与提问相互关联 · 由 1037Solo 统一账号计费</p>
        </div>
        <button className="ss-tool" onClick={()=>setShowDraft(v=>!v)}><Import className="size-3.5"/>导入文稿</button>
        <button className="ss-tool" disabled={!sessionId} onClick={exportNote}><FileText className="size-3.5"/>存为笔记</button>
        <button className="ss-tool" disabled={!sessionId||busy} onClick={()=>void makeCards()} title="从本节课生成知识卡片（进入复习闪卡）"><Sparkles className="size-3.5"/>知识卡片</button>
        <button className="ss-tool" disabled={!sessionId} aria-label="导出录音" title="导出本机录音（ZIP）" onClick={()=>void downloadAudio()}><Download className="size-3.5"/></button>
        <button className="ss-tool" aria-label="课堂设置" onClick={()=>setShowSettings(true)}><Settings2 className="size-3.5"/></button>
        <button className="ss-tool" aria-label={agentCollapsed?'展开课堂助手':'收起课堂助手'} onClick={()=>setAgentCollapsed(v=>!v)}>{agentCollapsed?<PanelRightOpen className="size-3.5"/>:<PanelRightClose className="size-3.5"/>}</button>
      </header>
      {(error||getSyncError())&&<p role="alert" className="m-2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-muted)] p-2 text-[12px] text-[color:var(--ink)]">{error||getSyncError()} <button className="underline" onClick={()=>{setError('');void getDb().then(flushClassPending);}}>重试同步</button></p>}
      {capabilities&&!capabilities.asr&&<p className="px-3 py-1 text-[11px] text-[color:var(--ink-faint)]">语音转写服务暂未启用；可以导入已有文稿继续整理与提问。</p>}
      {showDraft&&<div className="border-b border-[color:var(--line-soft)] p-3"><textarea aria-label="已有课堂文稿" className="h-24 w-full rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] p-3 text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]" maxLength={100000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="粘贴已有文稿，或补充课堂记录。导入后会生成提纲与补充解析。"/><div className="mt-2 flex gap-2"><button className="ss-tool" disabled={busy||!draft.trim()} onClick={()=>void importText()}>创建课堂并整理</button><button className="ss-tool" onClick={()=>{setShowDraft(false);setDraft('');}}>取消</button></div></div>}
      <div className="relative min-h-0 flex-1"><SilentAgentBoot/><WorkbenchShell chrome={false} transcript={<TranscriptPane enabled={capabilities?.asr!==false}/>} notes={<NotesPane/>} transcriptRender={<RenderHost target="transcript" onAnchorClick={id=>publishCommand({type:'transcript.scrollTo',segmentId:id,source:'render'})}/>} notesRender={<RenderHost target="notes" onAnchorClick={id=>publishCommand({type:'transcript.scrollTo',segmentId:id,source:'render'})}/>}/></div>
    </div>
    {!agentCollapsed&&<div className="hidden min-h-0 w-80 shrink-0 border-l border-[color:var(--line-soft)] md:block"><ChatPanel/></div>}
    {toast&&<div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-[12px] text-[color:var(--ink)] shadow-lg"><span className="inline-flex items-center gap-1.5">{toast}<button className="pointer-events-auto" onClick={()=>setToast('')}><X className="size-3"/></button></span></div>}
    <ClassroomSettings open={showSettings} onOpenChange={setShowSettings} capabilities={capabilities}/>
  </div>;
}
