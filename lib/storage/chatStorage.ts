import type { ChatContext, ChatMessage, ChatAttachment, StoredChatAttachment } from '@/lib/types/chat';
import type { ChatSession } from '@/lib/hooks/useChatHistory';
import {
  idbStorage,
  setItemNow,
  PERSIST_KEYS,
  chatSessionKey,
  chatBlobKey,
  CHAT_BLOB_KEY_PREFIX,
  CHAT_SESSION_KEY_PREFIX,
  listPersistedKeys,
  listPersistedKeysForOwner,
  flushPendingWrites,
  WRITE_DEBOUNCE_MS,
  registerStorageFlushHandler,
  commitSessionCheckpoint,
  readOwnedStorageItem,
  writeOwnedStorageItem,
  removeOwnedStorageItem,
} from '@/lib/storage/idbStorage';
import { compactStudyMessages } from '@/lib/chat/compactStudyParts';
import { getMessageText, getToolPartsByName, normalizeStoredMessages } from '@/lib/chat/messageParts';
import {
  buildChunkSpine,
  dotEntriesFromSpine,
  planSessionChunks,
  spineDerivedTotals,
  turnsToMessageRange,
  windowStartTurn,
  INITIAL_WINDOW_TURNS,
  type TurnSpineEntry,
} from '@/lib/chat/turnSpine';
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';
import {getStorageOwner,onStorageOwnerChange} from '@/lib/storage/ownerScope';
import { mergeChatSnapshots } from '@/lib/storage/threeWayChatMerge';

export interface SessionMeta {
  contextCheckpoint?: { summary: string; coveredIds: string[]; coveredRevisions?:Record<string,number>; cloudFileIds: string[]; createdAt: number };
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  kind?: 'main' | 'floating' | 'note' | 'scheduled';
  context?: ChatContext;
  messageCount: number;
  preview?: string;
  artifactIds: string[];
  /** 归档后从「正常对话 / 划词助手对话」默认列表移出，仍在本地可恢复。 */
  archived?: boolean;
  /** 用户自建文件夹；缺省表示未分组。 */
  folderId?: string | null;
  /**
   * 本会话已经读进过上下文的项目切片 id（去重 + FIFO，上限见 project/sessionSlices.ts）。
   * 项目一大，携带计划就从「全带」翻成「只带勾选的」；记住这些 id 能让模型读过的东西
   * 在后续轮次继续可读，而不是下一轮就报「这一轮没有携带切片正文」。
   */
  readSliceIds?: string[];
}

/** 系统项目的来源标记：笔记窗内 Agent 会话 / 划词助手会话 / 定时任务会话。 */
export type ProjectSystemKind = 'note' | 'floating' | 'scheduled';

/**
 * 对话项目（= 会话分组，可选字段，老 manifest 无此项时按空数组处理）。
 * `system` 有值的项目由来源决定成员，不可删除、可重命名。
 */
export interface ChatFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  system?: ProjectSystemKind;
}

/** 三个默认项目：笔记记录（笔记窗内 Agent 会话）/ 划词摘录（划词助手会话）/ 定时任务（调度器触发的会话）。 */
export const SYSTEM_PROJECTS: readonly ChatFolder[] = [
  { id: 'project-note', name: '笔记记录', createdAt: 0, system: 'note' },
  { id: 'project-floating', name: '划词摘录', createdAt: 0, system: 'floating' },
  { id: 'project-scheduled', name: '定时任务', createdAt: 0, system: 'scheduled' },
];

export const SYSTEM_PROJECT_IDS = SYSTEM_PROJECTS.map((project) => project.id);

export function isSystemProject(folder: Pick<ChatFolder, 'system' | 'id'>): boolean {
  return Boolean(folder.system) || SYSTEM_PROJECT_IDS.includes(folder.id);
}

/**
 * 补齐两个系统项目（幂等）。返回新数组；没有变化时返回 null，调用方据此跳过落盘。
 * 用户改过的名字保留：只按 id 判断缺不缺，不按名字判断。
 */
export function ensureDefaultProjects(folders: ChatFolder[]): ChatFolder[] | null {
  const existing = new Set(folders.map((folder) => folder.id));
  const missing = SYSTEM_PROJECTS.filter((project) => !existing.has(project.id));
  if (missing.length === 0) return null;
  return [...folders, ...missing.map((project) => ({ ...project }))];
}

export interface ChatManifestV2 {
  version: 2;
  activeSessionId: string | null;
  sessions: SessionMeta[];
  folders?: ChatFolder[];
  /** 下一次「新建对话」的落点项目；null = 不使用项目。 */
  activeProjectId?: string | null;
}

/**
 * manifest 的唯一构造入口。**只允许走这里**：2026-09-19 的数据事故与之后的
 * 「云端拉取丢 folders」都源于手写对象字面量漏字段——新增字段时这里改一处就够。
 */
export function buildManifest(input: {
  activeSessionId: string | null;
  sessions: SessionMeta[];
  folders?: ChatFolder[];
  activeProjectId?: string | null;
}): ChatManifestV2 {
  return {
    version: 2,
    activeSessionId: input.activeSessionId,
    sessions: input.sessions,
    folders: input.folders ?? [],
    activeProjectId: input.activeProjectId ?? null,
  };
}

/** 能构造 manifest 的状态切片（chatHistory store 与云同步引擎都是这个形状）。 */
export interface ManifestSource {
  activeSessionId: string | null;
  sessionsMeta: SessionMeta[];
  folders: ChatFolder[];
  activeProjectId: string | null;
}

/**
 * 从状态切片构造 manifest，只覆盖显式传入的字段。**所有写盘路径都必须走这里。**
 * 两次真实事故（2026-09-19 会话被清空、2026-09-20 云端拉取丢项目）都是手写 manifest 字面量漏字段造成的。
 */
export function manifestFrom(
  source: ManifestSource,
  overrides: Partial<Pick<ChatManifestV2, "activeSessionId" | "sessions" | "folders" | "activeProjectId">> = {},
): ChatManifestV2 {
  return buildManifest({
    activeSessionId: source.activeSessionId,
    sessions: source.sessionsMeta,
    folders: source.folders,
    activeProjectId: source.activeProjectId,
    ...overrides,
  });
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

export function collectArtifactIdsFromMessages(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    for (const part of getToolPartsByName(m, 'renderInteractive')) {
      if (part.state === 'output-available' && part.output.artifactId) ids.push(part.output.artifactId);
    }
  }
  return ids;
}

export function buildSessionMeta(session: ChatSession): SessionMeta {
  const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    kind: session.kind,
    context: session.context,
    messageCount: session.messages.length,
    preview: lastUser ? getMessageText(lastUser).slice(0, 80) : undefined,
    artifactIds: collectArtifactIdsFromMessages(session.messages),
  };
}

export function mergeArtifactIds(existing: string[], messages: ChatMessage[]): string[] {
  const set = new Set(existing);
  for (const id of collectArtifactIdsFromMessages(messages)) set.add(id);
  return [...set];
}

export async function loadManifest(): Promise<ChatManifestV2 | null> {
  if (!isBrowser()) return null;
  const raw = await idbStorage.getItem(PERSIST_KEYS.chatManifest);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChatManifestV2;
    if (parsed?.version === 2 && Array.isArray(parsed.sessions)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveManifest(manifest: ChatManifestV2): void {
  idbStorage.setItem(PERSIST_KEYS.chatManifest, JSON.stringify(manifest));
}

/** Sync pull checkpoint waits for the durable manifest write. */
export async function saveManifestCommitted(manifest: ChatManifestV2): Promise<void> {
  if (!await setItemNow(PERSIST_KEYS.chatManifest, JSON.stringify(manifest))) throw new Error("manifest_checkpoint_failed");
}

// ── Storage v3：轮次分块 + spine ──────────────────────────────────
// v2 把整段会话塞进一个 `chat-session:{id}` blob：读 = 全量 parse + normalize + compact，
// 写 = 每次 flush 全量 stringify（100MB 级会话单次 ~100ms 主线程，流式期间每 800ms 一次）。
// v3 布局：
//   chat-s3:{id}:h      head：{ v:3, messageCount, turnCount, chunkCount, spine }
//   chat-s3:{id}:c:{n}  第 n 个 chunk 的消息数组（每 chunk 固定 TURNS_PER_CHUNK 轮）
// 流式追加只重写尾部 chunk + head；「加载更早 / 定位点跳转」按轮次区间读少数 chunk；
// loadSessionMessages 仍返回全量装配结果，全量消费方（sync/导出/GC/请求构造）零改动。

export const CHAT_S3_KEY_PREFIX = 'chat-s3:';

function chatHeadKey(sessionId: string): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:h`;
}
function chatChunkKey(sessionId: string, chunk: number): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:c:${chunk}`;
}
function chatS3Prefix(sessionId: string): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:`;
}

export interface SessionHeadV3 {
  v: 3;
  /** Optional in legacy v3; zero for old heads. */
  contentRevision?:number;
  messageCount: number;
  turnCount: number;
  chunkCount: number;
  spine: TurnSpineEntry[];
}

/** 已加载会话窗口的描述（store 的 sessionWindowById 直接用它）。 */
export interface SessionWindowLoad {
  messages: ChatMessage[];
  spine: TurnSpineEntry[];
  turnCount: number;
  messageCount: number;
  startTurn: number;
  /** 窗口首条消息在全量数组里的下标。 */
  startIndex: number;
}

/**
 * 尾部 chunk 常驻缓存：追加/流式更新都是同步 mutate + setItemLazy 调度，
 * flush 时序列化此刻最新内容（latest-wins，与旧防抖语义一致）。
 * 只装一个 chunk，成本与「最近 8 轮」成正比，与会话总长无关。
 */
interface TailCacheEntry {
  head: SessionHeadV3;
  chunkIndex: number;
  messages: ChatMessage[];
}
const tailCache = new Map<string, TailCacheEntry>();
const sessionWriteQueues = new Map<string, Promise<void>>();
const activeSessionWrites=new Set<string>();
type PendingTail={ownerId:string;sessionId:string;head:SessionHeadV3;chunks:Map<number,ChatMessage[]>;timer:ReturnType<typeof setTimeout>|null;flushPromise:Promise<void>|null;error:string|null;recoverySaved:boolean}
const pendingTail=new Map<string,PendingTail>();
const sessionTombstones=new Set<string>();
type FailedFullWrite={messages:ChatMessage[];reason:'storage_unavailable'|'checkpoint_conflict';recoverySaved:boolean}
const failedFullWrites=new Map<string,FailedFullWrite>();
const durableRecoveryStatus=new Set<string>();
type PendingFullWrite={ownerId:string;sessionId:string;latest:ChatMessage[]|null;baseMessages:ChatMessage[]|null;running:Promise<void>|null}
const pendingFullWrites=new Map<string,PendingFullWrite>();
const writeStatusListeners=new Set<()=>void>()
/** Transaction seam for deterministic cross-tab race tests; production uses native IDB CAS. */
export const sessionCheckpointIo = { commit: commitSessionCheckpoint };
const notifyWriteStatus=()=>{for(const listener of writeStatusListeners)listener()}
export function subscribeSessionWriteStatus(listener:()=>void){writeStatusListeners.add(listener);return()=>{writeStatusListeners.delete(listener)}}
registerResourceMetrics(()=>({tailCacheCount:tailCache.size,pendingSessionWrites:new Set([...sessionWriteQueues.keys(),...pendingTail.keys(),...failedFullWrites.keys(),...pendingFullWrites.keys()]).size,inFlightSessionWrites:activeSessionWrites.size}));

function sessionQueueKey(sessionId:string):string|null{const owner=getStorageOwner();return owner?`${owner}:${sessionId}`:null}
function enqueueSessionWriteForOwner(ownerId:string,sessionId:string,task:(ownerId:string)=>Promise<void>):Promise<void>{
  const key=`${ownerId}:${sessionId}`
  const prev = sessionWriteQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(()=>{}).then(async()=>{activeSessionWrites.add(key);try{await task(ownerId)}finally{activeSessionWrites.delete(key)}});
  const tracked = next.then(()=>{},(error)=>console.warn('[chatStorage] write failed',error instanceof Error?error.name:'unknown'));
  sessionWriteQueues.set(key, tracked);
  void tracked.finally(()=>{if(sessionWriteQueues.get(key)===tracked)sessionWriteQueues.delete(key)});
  return next;
}
function enqueueSessionWrite(sessionId:string,task:(ownerId:string)=>Promise<void>):Promise<void>{
  const owner=getStorageOwner();return owner?enqueueSessionWriteForOwner(owner,sessionId,task):Promise.reject(new Error('Storage owner unavailable'))
}

function markTailDirty(sessionId:string,head:SessionHeadV3,index:number,messages:ChatMessage[],ownerId=getStorageOwner()){
  if(!ownerId)return
  const key=`${ownerId}:${sessionId}`
  let pending=pendingTail.get(key)
  if(!pending){pending={ownerId,sessionId,head,chunks:new Map(),timer:null,flushPromise:null,error:null,recoverySaved:false};pendingTail.set(key,pending)}
  pending.head=head;pending.chunks.set(index,messages)
  if(!pending.timer&&!pending.flushPromise)pending.timer=setTimeout(()=>{pending!.timer=null;void flushTailCheckpointByKey(key)},WRITE_DEBOUNCE_MS)
}

function flushTailCheckpoint(sessionId:string):Promise<void>{
  const key=sessionQueueKey(sessionId)
  return key?flushTailCheckpointByKey(key):Promise.resolve()
}
async function mergeTailAppendConflict(ownerId:string,sessionId:string,snapshot:Map<number,ChatMessage[]>):Promise<SessionHeadV3|null>{
  const remoteHead=await loadHeadV3(sessionId,ownerId);if(!remoteHead)return null
  const remote=await readTurnRange(sessionId,remoteHead,0,remoteHead.turnCount,ownerId)
  const byId=new Map(remote.map(message=>[message.id,message]))
  const additions:ChatMessage[]=[]
  for(const messages of snapshot.values())for(const message of messages){
    const existing=byId.get(message.id)
    if(existing){if(JSON.stringify(existing)!==JSON.stringify(message))return null;continue}
    byId.set(message.id,message);additions.push(message)
  }
  if(!additions.length){
    if(getStorageOwner()===ownerId){const chunkIndex=remoteHead.chunkCount-1;tailCache.set(sessionId,{head:remoteHead,chunkIndex,messages:(await readChunk(sessionId,chunkIndex,ownerId))??[]})}
    return remoteHead
  }
  return writeSessionV3Now(sessionId,[...remote,...additions],ownerId,remote)
}
function flushTailCheckpointByKey(key:string):Promise<void>{
  const pending=pendingTail.get(key)
  if(!pending)return Promise.resolve()
  if(pending.error==='checkpoint_conflict')return Promise.resolve()
  if(pending.timer){clearTimeout(pending.timer);pending.timer=null}
  if(pending.flushPromise)return pending.flushPromise
  const {ownerId,sessionId}=pending
  const task=enqueueSessionWriteForOwner(ownerId,sessionId,async()=>{
    const latest=pendingTail.get(key);if(latest!==pending||!pending.chunks.size)return
    const snapshot=new Map(pending.chunks);pending.chunks.clear()
    const headSnapshot=JSON.parse(JSON.stringify(pending.head)) as SessionHeadV3
    const entries:[string,string][]=[...snapshot].map(([index,messages])=>[chatChunkKey(sessionId,index),serializeSessionMessages(messages)])
    const committed=await loadHeadV3(sessionId,ownerId),expectedRevision=committed?.contentRevision??0
    headSnapshot.contentRevision=expectedRevision+1
    entries.push([chatHeadKey(sessionId),JSON.stringify(headSnapshot)])
    const outcome=await sessionCheckpointIo.commit({ownerId,headKey:chatHeadKey(sessionId),expectedRevision,entries})
    if(outcome.status==='saved'){
      pending.head.contentRevision=outcome.revision;pending.error=null;notifyWriteStatus()
    }else{
      if(outcome.status==='conflict'){
        const merged=await mergeTailAppendConflict(ownerId,sessionId,snapshot).catch(()=>null)
        if(merged){pending.head=merged;pending.error=null;notifyWriteStatus();return}
      }
      for(const [index,messages] of snapshot)if(!pending.chunks.has(index))pending.chunks.set(index,messages)
      pending.error=outcome.status==='conflict'?'checkpoint_conflict':outcome.reason
      if(outcome.status==='conflict')pending.recoverySaved=await writeOwnedStorageItem(ownerId,tailRecoveryKey(sessionId),serializeSessionMessages([...snapshot.values()].flat()))
      notifyWriteStatus()
      throw new Error(pending.error)
    }
  })
  pending.flushPromise=task.catch(()=>{}).finally(()=>{
    pending.flushPromise=null
    if(!pending.chunks.size){pendingTail.delete(key);return}
    // Persist failures wait for an explicit flush/new mutation rather than spinning on quota errors.
    if(!pending.error&&!pending.timer)pending.timer=setTimeout(()=>{pending.timer=null;void flushTailCheckpointByKey(key)},WRITE_DEBOUNCE_MS)
  })
  return pending.flushPromise
}

export async function flushPendingSessionCheckpoints():Promise<void>{
  await Promise.all([...pendingTail.keys()].map(flushTailCheckpointByKey))
}
export function getSessionWriteFailure(sessionId:string):string|null{
  const key=sessionQueueKey(sessionId)
  return key?(failedFullWrites.get(key)?.reason??pendingTail.get(key)?.error??(durableRecoveryStatus.has(key)?'checkpoint_conflict':null)):null
}
function recoveryKey(sessionId:string){return `chat-recovery-s3:${sessionId}`}
function tailRecoveryKey(sessionId:string){return `chat-recovery-tail-s3:${sessionId}`}
export async function loadSessionRecovery(sessionId:string):Promise<ChatMessage[]|null>{
  const key=sessionQueueKey(sessionId),failed=key?failedFullWrites.get(key):null
  if(failed)return failed.messages
  const ownerId=getStorageOwner();if(!ownerId)return null
  const tailConflict=key?pendingTail.get(key)?.error==='checkpoint_conflict':false
  const raw=tailConflict
    ? (await readOwnedStorageItem(ownerId,tailRecoveryKey(sessionId)))??(await readOwnedStorageItem(ownerId,recoveryKey(sessionId)))
    : (await readOwnedStorageItem(ownerId,recoveryKey(sessionId)))??(await readOwnedStorageItem(ownerId,tailRecoveryKey(sessionId)))
  return raw?parseStoredMessages(raw):null
}
export function hasDurableSessionRecovery(sessionId:string):boolean{
  const key=sessionQueueKey(sessionId)
  return !!key&&(failedFullWrites.get(key)?.recoverySaved===true||pendingTail.get(key)?.recoverySaved===true||durableRecoveryStatus.has(key))
}
export async function hydrateSessionRecoveryStatus(sessionId:string):Promise<void>{
  const owner=getStorageOwner(),key=sessionQueueKey(sessionId)
  if(!owner||!key)return
  const found=Boolean((await readOwnedStorageItem(owner,recoveryKey(sessionId)))??(await readOwnedStorageItem(owner,tailRecoveryKey(sessionId))))
  if(getStorageOwner()!==owner)return
  if(found)durableRecoveryStatus.add(key);else durableRecoveryStatus.delete(key)
  notifyWriteStatus()
}
export function hasSessionWriteLease(sessionId:string):boolean{
  const key=sessionQueueKey(sessionId)
  return !!key&&(sessionWriteQueues.has(key)||pendingTail.has(key)||pendingFullWrites.has(key)||failedFullWrites.has(key))
}
export async function retrySessionWrite(sessionId:string):Promise<boolean>{
  const key=sessionQueueKey(sessionId)
  if(!key)return false
  const full=failedFullWrites.get(key)
  if(full?.reason==='checkpoint_conflict'||pendingTail.get(key)?.error==='checkpoint_conflict')return false
  if(full){
    const ownerId=getStorageOwner();if(!ownerId)return false
    const next=await enqueueSessionWriteForOwner(ownerId,sessionId,async()=>{
      const saved=await writeSessionV3Now(sessionId,full.messages,ownerId)
      if(!saved)throw new Error('storage_unavailable')
      failedFullWrites.delete(key);notifyWriteStatus()
    }).then(()=>true,()=>false)
    return next
  }
  if(pendingTail.has(key)){await flushTailCheckpointByKey(key);return !pendingTail.has(key)}
  return true
}
registerStorageFlushHandler(()=>{void flushPendingSessionCheckpoints()})
onStorageOwnerChange((previous,next)=>{
  if(previous===next)return
  tailCache.clear()
  durableRecoveryStatus.clear()
  if(previous)for(const key of pendingTail.keys())if(key.startsWith(`${previous}:`))void flushTailCheckpointByKey(key)
  notifyWriteStatus()
})

function parseStoredMessages(raw: string): ChatMessage[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return compactStudyMessages(normalizeStoredMessages(parsed), 'persist');
  } catch {
    return null;
  }
}

async function loadHeadV3(sessionId: string,ownerId?:string): Promise<SessionHeadV3 | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatHeadKey(sessionId)):await idbStorage.getItem(chatHeadKey(sessionId));
  if (!raw) return null;
  try {
    const head = JSON.parse(raw) as SessionHeadV3;
    if (head?.v === 3 && Array.isArray(head.spine)) return head;
    return null;
  } catch {
    return null;
  }
}

async function readChunk(sessionId: string, chunk: number,ownerId?:string): Promise<ChatMessage[] | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatChunkKey(sessionId,chunk)):await idbStorage.getItem(chatChunkKey(sessionId, chunk));
  if (!raw) return null;
  return parseStoredMessages(raw);
}

/** chunk c 覆盖的全局消息下标区间（spine 推导，不读正文）。 */
function chunkIndexRange(head: SessionHeadV3, chunk: number): { start: number; end: number } {
  const firstTurn = head.spine.find((entry) => entry.chunk === chunk);
  const nextChunkTurn = head.spine.find((entry) => entry.chunk === chunk + 1);
  return {
    start: firstTurn?.firstIndex ?? head.messageCount,
    end: nextChunkTurn?.firstIndex ?? head.messageCount,
  };
}

/** 读轮次区间 [fromTurn, toTurnExclusive) 的消息（按 spine 切片，只碰覆盖到的 chunk）。 */
async function readTurnRange(
  sessionId: string,
  head: SessionHeadV3,
  fromTurn: number,
  toTurnExclusive: number,
  ownerId?: string,
): Promise<ChatMessage[]> {
  if (toTurnExclusive <= fromTurn || head.spine.length === 0) return [];
  const { start, end } = turnsToMessageRange(head.spine, head.messageCount, fromTurn, toTurnExclusive);
  const firstChunk = head.spine[fromTurn]?.chunk ?? head.chunkCount - 1;
  const lastTurn = Math.min(toTurnExclusive, head.turnCount) - 1;
  const lastChunk = head.spine[lastTurn]?.chunk ?? head.chunkCount - 1;
  const out: ChatMessage[] = [];
  for (let chunk = firstChunk; chunk <= lastChunk; chunk += 1) {
    const messages = (await readChunk(sessionId, chunk, ownerId)) ?? [];
    const range = chunkIndexRange(head, chunk);
    const s = Math.max(start, range.start) - range.start;
    const e = Math.min(end, range.end) - range.start;
    out.push(...messages.slice(Math.max(0, s), Math.max(0, e)));
  }
  return out;
}

/** Plan outside the transaction; publish all chunks and the head as one IDB checkpoint. */
async function writeSessionV3Now(sessionId: string, messages: ChatMessage[],ownerId=getStorageOwner(),baseMessages?:ChatMessage[],attempt=0): Promise<SessionHeadV3 | null> {
  if(!ownerId)return null
  const plan = planSessionChunks(messages);
  const previous=await loadHeadV3(sessionId,ownerId),expectedRevision=previous?.contentRevision??0;
  const head: SessionHeadV3 = {
    v: 3,
    contentRevision:expectedRevision+1,
    messageCount: messages.length,
    turnCount: plan.spine.length,
    chunkCount: plan.chunks.length,
    spine: plan.spine,
  };
  const entries:[string,string][]=plan.chunks.map((chunk,index)=>[chatChunkKey(sessionId,index),serializeSessionMessages(chunk)]);
  entries.push([chatHeadKey(sessionId),JSON.stringify(head)]);
  const outcome=await sessionCheckpointIo.commit({ownerId,headKey:chatHeadKey(sessionId),expectedRevision,entries});
  if(outcome.status==='conflict'){
    if(!baseMessages||attempt>=2)throw new Error('checkpoint_conflict');
    const remoteHead=await loadHeadV3(sessionId,ownerId);
    if(!remoteHead)throw new Error('checkpoint_conflict');
    const remote=await readTurnRange(sessionId,remoteHead,0,remoteHead.turnCount,ownerId);
    const merged=mergeChatSnapshots(baseMessages,messages,remote);
    if(!merged)throw new Error('checkpoint_conflict');
    return writeSessionV3Now(sessionId,merged,ownerId,remote,attempt+1);
  }
  if(outcome.status!=='saved')return null;
  // v2 单 blob 键在 head 落盘之后才清：中途失败时 v2 仍是完整真相，下次读会重试迁移。
  await removeOwnedStorageItem(ownerId,chatSessionKey(sessionId));
  if(getStorageOwner()===ownerId)tailCache.set(sessionId, {
    head,
    chunkIndex: plan.chunks.length - 1,
    messages: [...plan.chunks[plan.chunks.length - 1]],
  });
  return head;
}

/** v2 单 blob → v3 分块的就地迁移（幂等；v3 head 已存在时不进这里）。 */
async function migrateV2ToV3(sessionId: string,ownerId?:string): Promise<SessionHeadV3 | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatSessionKey(sessionId)):await idbStorage.getItem(chatSessionKey(sessionId));
  if (!raw) return null;
  const messages = parseStoredMessages(raw);
  if (!messages) return null;
  return writeSessionV3Now(sessionId, messages,ownerId??getStorageOwner());
}

async function ensureHeadV3(sessionId: string,ownerId=getStorageOwner()): Promise<SessionHeadV3 | null> {
  const cached = ownerId===getStorageOwner()?tailCache.get(sessionId)?.head:undefined;
  if (cached) return cached;
  return (await loadHeadV3(sessionId,ownerId??undefined)) ?? (await migrateV2ToV3(sessionId,ownerId??undefined));
}

async function ensureTailCache(sessionId: string,ownerId=getStorageOwner()): Promise<TailCacheEntry | null> {
  if(!ownerId)return null
  const hit = ownerId===getStorageOwner()?tailCache.get(sessionId):undefined;
  if (hit) return hit;
  const head = await ensureHeadV3(sessionId,ownerId);
  if (!head) return null;
  const chunkIndex = head.chunkCount - 1;
  const messages = (await readChunk(sessionId, chunkIndex,ownerId)) ?? [];
  const entry: TailCacheEntry = { head, chunkIndex, messages };
  if(ownerId===getStorageOwner())tailCache.set(sessionId, entry);
  return entry;
}

/** Mark the dirty chunk; the shared checkpoint commits it and the head in one transaction. */
function scheduleTailFlush(sessionId: string, entry: TailCacheEntry,ownerId=getStorageOwner()): void {
  markTailDirty(sessionId,entry.head,entry.chunkIndex,entry.messages,ownerId)
}

/**
 * 追加到尾部 chunk（同步路径：缓存命中即改即排程）。
 * 跨过 TURNS_PER_CHUNK 轮边界时把溢出的轮切进新 chunk——每 8 个 user 轮才发生一次，
 * 流式高频期永远命中「同一尾块内增长」这条快路径。
 */
function applyAppendToTail(sessionId: string, appended: ChatMessage[],entry=tailCache.get(sessionId),ownerId=getStorageOwner()): void {
  if (!entry) return;
  const all = [...entry.messages, ...appended];
  const olderSpine = entry.head.spine.filter((s) => s.chunk < entry.chunkIndex);
  const startTurn = olderSpine.length;
  const lastOlder = olderSpine[olderSpine.length - 1];
  const startIndex = lastOlder ? lastOlder.firstIndex + lastOlder.messageCount : 0;
  const tailSpine = buildChunkSpine(all, { startTurn, startIndex, chunkIndex: entry.chunkIndex });
  const byChunk = new Map<number, ChatMessage[]>();
  for (const s of tailSpine) {
    const arr = byChunk.get(s.chunk) ?? [];
    arr.push(...all.slice(s.firstIndex - startIndex, s.firstIndex - startIndex + s.messageCount));
    byChunk.set(s.chunk, arr);
  }
  entry.head.spine = [...olderSpine, ...tailSpine];
  entry.head.turnCount = entry.head.spine.length;
  entry.head.messageCount += appended.length;
  let maxChunk = entry.chunkIndex;
  for (const [chunk, msgs] of byChunk) {
    if (chunk === entry.chunkIndex) {
      entry.messages = msgs;
      scheduleTailFlush(sessionId, entry,ownerId);
    } else {
      // 新 chunk 只写一次；若它就是新尾块，把缓存接力过去。
      const nextEntry: TailCacheEntry = { head: entry.head, chunkIndex: chunk, messages: msgs };
      markTailDirty(sessionId,nextEntry.head,chunk,nextEntry.messages,ownerId)
      if (chunk > maxChunk) {
        maxChunk = chunk;
        if(ownerId===getStorageOwner())tailCache.set(sessionId, nextEntry);
      }
    }
  }
  entry.head.chunkCount = maxChunk + 1;
}

/** 追加消息（store 的 addMessage 走这里）。缓存就绪则同步排程，否则排队先装尾块。 */
export function appendSessionMessages(sessionId: string, appended: ChatMessage[]): void {
  if (!isBrowser() || appended.length === 0) return;
  const key=sessionQueueKey(sessionId);if(!key||sessionTombstones.has(key))return;
  if (tailCache.has(sessionId)) {
    applyAppendToTail(sessionId, appended);
    return;
  }
  void enqueueSessionWrite(sessionId, async (ownerId) => {
    if(sessionTombstones.has(`${ownerId}:${sessionId}`))return;
    const entry = await ensureTailCache(sessionId,ownerId);
    if (!entry) {
      // head 都没有 = 会话还没建过：按整段写（空会话 addMessage 的落点）。
      await writeSessionV3Now(sessionId, appended,ownerId);
      return;
    }
    applyAppendToTail(sessionId, appended,entry,ownerId);
  });
}

/** 更新一条消息（流式 updateMessage 走这里）：命中尾块同步改，否则排队回扫旧 chunk。 */
export function writeSessionMessage(sessionId: string, message: ChatMessage): void {
  if (!isBrowser()) return;
  const key=sessionQueueKey(sessionId);if(!key||sessionTombstones.has(key))return;
  const entry = tailCache.get(sessionId);
  if (entry) {
    const index = entry.messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      entry.messages[index] = message;
      scheduleTailFlush(sessionId, entry);
      return;
    }
  }
  void enqueueSessionWrite(sessionId, async (ownerId) => {
    if(sessionTombstones.has(`${ownerId}:${sessionId}`))return;
    const tail = await ensureTailCache(sessionId,ownerId);
    if (!tail) return;
    const tailIndex = tail.messages.findIndex((m) => m.id === message.id);
    if (tailIndex >= 0) {
      tail.messages[tailIndex] = message;
      scheduleTailFlush(sessionId, tail,ownerId);
      return;
    }
    // 非尾块更新（极少见：编辑旧轮）——从新到旧回扫，命中即重写那一个 chunk。
    for (let chunk = tail.head.chunkCount - 2; chunk >= 0; chunk -= 1) {
      const messages = await readChunk(sessionId, chunk,ownerId);
      if (!messages) continue;
      const index = messages.findIndex((m) => m.id === message.id);
      if (index < 0) continue;
      messages[index] = message;
      markTailDirty(sessionId,tail.head,chunk,messages,ownerId)
      return;
    }
  });
}

/** 释放内存里的尾块缓存（会话被驱逐/删除时调用）。 */
export function dropSessionTailCache(sessionId: string): void {
  tailCache.delete(sessionId);
}

/** 测试专用：清掉模块级尾块缓存与写队列（不同用例互不串场）。 */
export function __resetSessionV3ForTests(): void {
  tailCache.clear();
  sessionWriteQueues.clear();
  for(const pending of pendingTail.values())if(pending.timer)clearTimeout(pending.timer)
  pendingTail.clear()
  sessionTombstones.clear()
  failedFullWrites.clear()
  durableRecoveryStatus.clear()
  pendingFullWrites.clear()
  activeSessionWrites.clear()
}

/** 测试专用：等某条会话的写队列清空（saveSessionMessages 等 fire-and-forget 的落点）。 */
export function __waitSessionWritesForTests(sessionId: string): Promise<void> {
  const owner=getStorageOwner();return owner?__waitSessionWritesForOwnerForTests(owner,sessionId):Promise.resolve()
}
export function __waitSessionWritesForOwnerForTests(ownerId:string,sessionId:string):Promise<void>{
  return (sessionWriteQueues.get(`${ownerId}:${sessionId}`)??Promise.resolve()).catch(()=>{})
}

/**
 * 打开会话时的窗口读：head + 覆盖最近 tailTurns 轮的少数 chunk。
 * 顺手把尾块塞进 tailCache——之后追加/流式更新都是同步排程，不再回读。
 */
export async function loadSessionWindow(
  sessionId: string,
  tailTurns = INITIAL_WINDOW_TURNS,
): Promise<SessionWindowLoad | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  const startTurn = windowStartTurn(head.turnCount, tailTurns);
  const startIndex = head.spine[startTurn]?.firstIndex ?? head.messageCount;
  const messages = await readTurnRange(sessionId, head, startTurn, head.turnCount);
  if (!tailCache.has(sessionId) && head.chunkCount > 0) {
    const tail = (await readChunk(sessionId, head.chunkCount - 1)) ?? [];
    tailCache.set(sessionId, { head, chunkIndex: head.chunkCount - 1, messages: tail });
  }
  return {
    messages,
    spine: head.spine,
    turnCount: head.turnCount,
    messageCount: head.messageCount,
    startTurn,
    startIndex,
  };
}

/** 「加载更早」/定位点回跳：读 [startTurn - count, startTurn) 这段轮次的消息。 */
export async function loadTurnsBefore(
  sessionId: string,
  startTurn: number,
  count: number,
): Promise<{ messages: ChatMessage[]; fromTurn: number; startIndex: number } | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  const fromTurn = Math.max(0, startTurn - count);
  const messages = await readTurnRange(sessionId, head, fromTurn, startTurn);
  return { messages, fromTurn, startIndex: head.spine[fromTurn]?.firstIndex ?? 0 };
}

/** 定位点/顶栏合计用的轻量视图：只读 head。 */
/**
 * 请求路径的尾部读：从 spine 尾端向前收满 minMessages 条为止，只解析覆盖到的 chunk。
 * 会话比 minMessages 短时等价全量装配；长会话只碰尾部少数几个 chunk。
 */
export async function loadSessionTail(
  sessionId: string,
  minMessages: number,
): Promise<ChatMessage[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  let covered = 0;
  let fromTurn = head.turnCount;
  while (fromTurn > 0 && covered < minMessages) {
    fromTurn -= 1;
    covered += head.spine[fromTurn]?.messageCount ?? 0;
  }
  return readTurnRange(sessionId, head, fromTurn, head.turnCount);
}

export async function loadSessionSpine(sessionId: string): Promise<TurnSpineEntry[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  return head?.spine ?? null;
}

/** Summary builders inspect only the head before choosing bounded chunk reads. */
export async function loadSessionSummaryHead(sessionId: string): Promise<{ revision: number; messageCount: number; spine: TurnSpineEntry[] } | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  return head ? { revision: head.contentRevision ?? 0, messageCount: head.messageCount, spine: head.spine } : null;
}

export { dotEntriesFromSpine, spineDerivedTotals };

/**
 * 全量装配读（sync 上行 / 导出 / GC / 请求构造 / 手动 compact 用）。
 * 名字保留 loadSessionMessages：全量消费方的调用语义不变。
 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  if (head.turnCount === 0) return [];
  return readTurnRange(sessionId, head, 0, head.turnCount);
}

export function serializeSessionMessages(messages: ChatMessage[]): string {
  return JSON.stringify(compactStudyMessages(messages, 'persist'));
}

function startFullWriteDrain(key:string,entry:PendingFullWrite){
  if(entry.running)return
  const task=enqueueSessionWriteForOwner(entry.ownerId,entry.sessionId,async()=>{
    while(entry.latest&&!sessionTombstones.has(key)){
      const messages=entry.latest,baseMessages=entry.baseMessages??undefined;entry.latest=null;entry.baseMessages=null
      try{
        const saved=await writeSessionV3Now(entry.sessionId,messages,entry.ownerId,baseMessages)
        if(!saved)throw new Error('storage_unavailable')
        if(failedFullWrites.delete(key))notifyWriteStatus()
      }catch(error){
        const snapshot=entry.latest??messages
        const conflict=error instanceof Error&&error.message==='checkpoint_conflict'
        const recoverySaved=conflict?await writeOwnedStorageItem(entry.ownerId,recoveryKey(entry.sessionId),serializeSessionMessages(snapshot)):false
        failedFullWrites.set(key,{messages:snapshot,reason:conflict?'checkpoint_conflict':'storage_unavailable',recoverySaved})
        notifyWriteStatus()
        entry.latest=null;throw error
      }
    }
  })
  entry.running=task.catch(()=>{}).finally(()=>{
    entry.running=null
    if(entry.latest&&!sessionTombstones.has(key)&&!failedFullWrites.has(key))startFullWriteDrain(key,entry)
    else pendingFullWrites.delete(key)
  })
}

/** Complete checkpoint snapshots coalesce to one in-flight plus one latest pending. */
export function saveSessionMessages(sessionId: string, messages: ChatMessage[], baseMessages?: ChatMessage[]): void {
  if (!isBrowser()) return;
  const ownerId=getStorageOwner(),key=sessionQueueKey(sessionId);if(!key||!ownerId||sessionTombstones.has(key))return;
  void flushTailCheckpoint(sessionId);
  let entry=pendingFullWrites.get(key)
  if(!entry){entry={ownerId,sessionId,latest:null,baseMessages:null,running:null};pendingFullWrites.set(key,entry)}
  entry.latest=messages
  entry.baseMessages=baseMessages??null
  startFullWriteDrain(key,entry)
}

/** Durable counterpart for page-by-page cloud pull; ordinary streaming stays coalesced. */
export async function saveSessionMessagesCommitted(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const key = sessionQueueKey(sessionId);
  if (!key) throw new Error("storage_owner_unavailable");
  saveSessionMessages(sessionId, messages);
  while (true) {
    const pending = pendingFullWrites.get(key);
    if (!pending) break;
    if (pending.running) await pending.running;
    if (!pending.latest) break;
  }
  const failure = failedFullWrites.get(key)?.reason;
  if (failure) throw new Error(failure);
}

async function saveManifestNow(manifest: ChatManifestV2): Promise<boolean> {
  return setItemNow(PERSIST_KEYS.chatManifest, JSON.stringify(manifest));
}

export async function loadBlobDataUrl(blobId: string): Promise<string | null> {
  if (!isBrowser()) return null;
  return idbStorage.getItem(chatBlobKey(blobId));
}

async function persistableDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("blob:")) return dataUrl;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取本地文件失败"));
    reader.readAsDataURL(blob);
  });
}

export async function saveBlobFromDataUrl(blobId: string, dataUrl: string): Promise<void> {
  if (!isBrowser()) return;
  const stored = await persistableDataUrl(dataUrl);
  const ok = await setItemNow(chatBlobKey(blobId), stored);
  if (!ok) throw new Error(`Failed to save chat blob: ${blobId}`);
}

function inlineAttachmentPayload(attachment: ChatAttachment): string | null {
  if (attachment.type === 'image') return attachment.base64 || null;
  if (attachment.type === 'document') return attachment.text;
  return attachment.dataUrl || null;
}

export async function deleteSessionData(sessionId: string, blobIds: string[] = []): Promise<void> {
  if (!isBrowser()) return;
  const owner=getStorageOwner();if(!owner)return
  sessionTombstones.add(`${owner}:${sessionId}`)
  // v3 分块键走写队列尾部：先让排队的 flush 落完，再整组删，避免删完又被 lazy 写复活。
  await flushTailCheckpoint(sessionId)
  await enqueueSessionWrite(sessionId, async (ownerId) => {
    const prefix = chatS3Prefix(sessionId);
    const keys = await listPersistedKeysForOwner(ownerId);
    for (const key of keys) {
      if (key.startsWith(prefix)) await removeOwnedStorageItem(ownerId,key);
    }
    if(getStorageOwner()===ownerId)tailCache.delete(sessionId);
  });
  await removeOwnedStorageItem(owner,chatSessionKey(sessionId));
  for (const id of blobIds) {
    try {
      await removeOwnedStorageItem(owner,chatBlobKey(id));
    } catch {
      // ignore
    }
  }
}

export function extractBlobIdsFromMessages(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (!m.attachments) continue;
    for (const a of m.attachments) {
      if ('id' in a && typeof (a as { id?: string }).id === 'string' && !('base64' in a)) {
        ids.push((a as { id: string }).id);
      }
    }
  }
  return ids;
}

async function migrateAttachmentsInMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments = [];
    for (const a of m.attachments) {
      const payload = 'id' in a ? null : inlineAttachmentPayload(a);
      if (payload != null) {
        const id: string = `blob-${m.id}-${attachments.length}-${Date.now()}`;
        await saveBlobFromDataUrl(id, payload);
        attachments.push({
          id, type: a.type, mimeType: a.mimeType,
          cloudFileId: a.cloudFileId,
          name: a.name, size: a.size,
          ...('characterCount' in a ? { characterCount: a.characterCount } : {}),
        });
      } else {
        attachments.push(a);
      }
    }
    out.push({ ...m, attachments });
  }
  return out;
}

interface V1Persisted {
  state?: { sessions?: ChatSession[]; activeSessionId?: string | null };
  sessions?: ChatSession[];
  activeSessionId?: string | null;
}

/** 幂等：存在 legacy chat-history 且无 manifest 时拆分写入 v2。 */
export async function migrateFromV1IfNeeded(): Promise<boolean> {
  if (!isBrowser()) return false;
  const existing = await loadManifest();
  if (existing) return false;

  const legacyRaw = await idbStorage.getItem(PERSIST_KEYS.chatHistory);
  if (!legacyRaw) return false;

  let parsed: V1Persisted;
  try {
    parsed = JSON.parse(legacyRaw) as V1Persisted;
  } catch {
    return false;
  }

  const sessions: ChatSession[] = parsed.state?.sessions ?? parsed.sessions ?? [];
  const activeSessionId = parsed.state?.activeSessionId ?? parsed.activeSessionId ?? null;

  const metas: SessionMeta[] = [];
  try {
    for (const session of sessions) {
      const messages = await migrateAttachmentsInMessages(
        normalizeStoredMessages(session.messages as unknown[]),
      );
      const saved = await writeSessionV3Now(session.id, messages);
      if (!saved) return false;
      metas.push(buildSessionMeta({ ...session, messages }));
    }

    // v1 没有项目概念：folders / activeProjectId 交给 buildManifest 补默认值。
    const manifestSaved = await saveManifestNow(buildManifest({ activeSessionId, sessions: metas }));
    if (!manifestSaved) return false;
  } catch {
    return false;
  }

  await idbStorage.removeItem(PERSIST_KEYS.chatHistory);
  return true;
}

/** 导出：并行加载全部会话并 hydrate 附件为 inline base64（兼容 v1 导出格式）。 */
export async function loadAllSessionsForExport(metas: SessionMeta[]): Promise<ChatSession[]> {
  const sessions: ChatSession[] = [];
  for (const meta of metas) {
    const messages = (await loadSessionMessages(meta.id)) ?? [];
    const hydrated = await hydrateAttachmentsForApi(messages);
    sessions.push({
      id: meta.id,
      title: meta.title,
      messages: hydrated,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      context: meta.context,
      kind: meta.kind,
    });
  }
  return sessions;
}

export async function hydrateAttachmentsForApi(
  messages: ChatMessage[],
  options?: { messageIds?: ReadonlySet<string> },
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (options?.messageIds && !options.messageIds.has(m.id)) {
      out.push(m);
      continue;
    }
    if (!m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments: ChatAttachment[] = [];
    for (const a of m.attachments) {
      if (a.cloudFileId) { attachments.push(a as ChatAttachment); continue; }
      if (!('id' in a)) {
        attachments.push(a as ChatAttachment);
      } else if ('id' in a) {
        const payload = await loadBlobDataUrl((a as { id: string }).id);
        if (payload) {
          attachments.push(a.type === 'document' ? {
            type: 'document',
            mimeType: a.mimeType as Extract<ChatAttachment, { type: 'document' }>['mimeType'],
            name: a.name ?? '未命名文档.txt',
            text: payload,
            size: a.size ?? new Blob([payload]).size,
            characterCount: a.characterCount ?? [...payload].length,
          } : a.type === 'local-file' ? {
            type: 'local-file', mimeType: a.mimeType as Extract<ChatAttachment, { type: 'local-file' }>['mimeType'], dataUrl: payload,
            name: a.name ?? '未命名本地文件', size: a.size ?? 0,
          } : {
            type: 'image', mimeType: a.mimeType, base64: payload,
            name: a.name, size: a.size,
          });
        }
      }
    }
    out.push({ ...m, attachments: attachments.length ? attachments : undefined });
  }
  return out;
}

export function persistInlineAttachments(message: ChatMessage): ChatMessage {
  if (!message.attachments?.length) return message;
  const attachments: StoredChatAttachment[] = [];
  for (const a of message.attachments) {
    if (!('id' in a)) {
      const payload = inlineAttachmentPayload(a);
      if (payload == null) {
        attachments.push(a);
        continue;
      }
      const id = `blob-${message.id}-${attachments.length}`;
      void saveBlobFromDataUrl(id, payload);
      attachments.push({
        id, type: a.type, mimeType: a.mimeType,
        cloudFileId: a.cloudFileId,
        name: a.name, size: a.size,
        ...('characterCount' in a ? { characterCount: a.characterCount } : {}),
      });
    } else {
      attachments.push(a);
    }
  }
  return { ...message, attachments };
}


export async function listBlobIdsForSession(sessionId: string): Promise<string[]> {
  const messages = await loadSessionMessages(sessionId);
  if (!messages) return [];
  return extractBlobIdsFromMessages(messages);
}

export async function listAllChatKeys(): Promise<string[]> {
  if (!isBrowser()) return [];
  const all = await listPersistedKeys();
  return all.filter(
    (k) =>
      k.startsWith(CHAT_BLOB_KEY_PREFIX) ||
      k.startsWith(CHAT_SESSION_KEY_PREFIX) ||
      k.startsWith(CHAT_S3_KEY_PREFIX),
  );
}

/**
 * 单轮 GC 允许删除的会话键上限。超过就认为 manifest 不可信、整轮放弃——
 * 正常情况只有「超出 50 条上限被淘汰」这类零星孤儿，绝不会有大批量同时失效。
 */
const MAX_ORPHAN_DELETIONS = 3;

export interface ChatGcDeps {
  listKeys?: () => Promise<string[]>;
  removeKey?: (key: string) => Promise<void>;
  loadMessages?: (sessionId: string) => Promise<ChatMessage[] | null>;
  loadManifest?: () => Promise<ChatManifestV2 | null>;
}

/**
 * 以 manifest 为唯一真相源：不在入口里的 chat-session:* / 无引用的 chat-blob:* 删除。
 * 不会删掉仍被 manifest 会话引用的键。
 */
export async function gcOrphanedChatKeys(deps: ChatGcDeps = {}): Promise<{ deleted: string[] }> {
  const listKeys = deps.listKeys ?? listAllChatKeys;
  const removeKey = deps.removeKey ?? ((key: string) => idbStorage.removeItem(key));
  const loadMessages = deps.loadMessages ?? loadSessionMessages;
  const readManifest = deps.loadManifest ?? loadManifest;

  flushPendingWrites();
  const manifest = await readManifest();
  // 读不到 manifest 时**绝不能**把「keep 集合为空」当成真相：那等于一次删光所有会话正文。
  if (!manifest) return { deleted: [] };
  const keepSessions = new Set(manifest.sessions.map((s) => s.id));
  const keys = await listKeys();
  const deleted: string[] = [];

  // v2 单 blob 与 v3 分块键都算「会话正文键」：chat-s3:{id}:h|c:{n} 与会话同生共死。
  const orphanSessionIds = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(CHAT_SESSION_KEY_PREFIX)) {
      const sessionId = key.slice(CHAT_SESSION_KEY_PREFIX.length);
      if (sessionId && !keepSessions.has(sessionId)) orphanSessionIds.add(sessionId);
    } else if (key.startsWith(CHAT_S3_KEY_PREFIX)) {
      const rest = key.slice(CHAT_S3_KEY_PREFIX.length);
      const sessionId = rest.slice(0, rest.indexOf(':'));
      if (sessionId && !keepSessions.has(sessionId)) orphanSessionIds.add(sessionId);
    }
  }
  // 孤儿异常多 = manifest 很可能不是真相（被空列表/旧列表覆盖过、或水合失败）。
  // 这时**一个都不删**：误删正文是不可逆的，留几个孤儿键只是占点空间。
  if (orphanSessionIds.size > MAX_ORPHAN_DELETIONS) return { deleted: [] };

  for (const key of keys) {
    let sessionId: string | null = null;
    if (key.startsWith(CHAT_SESSION_KEY_PREFIX)) {
      sessionId = key.slice(CHAT_SESSION_KEY_PREFIX.length);
    } else if (key.startsWith(CHAT_S3_KEY_PREFIX)) {
      const rest = key.slice(CHAT_S3_KEY_PREFIX.length);
      sessionId = rest.slice(0, rest.indexOf(':'));
    }
    if (!sessionId || !orphanSessionIds.has(sessionId)) continue;
    await removeKey(key);
    deleted.push(key);
  }

  // 附件清理依赖「所有存活会话的正文都能读出来」。只要有一个存活会话的键在、正文却读不出来，
  // keep 集合就不完整，这一轮不动任何 blob（否则会把它们的附件误判成孤儿删掉）。
  const keepBlobs = new Set<string>();
  for (const sessionId of keepSessions) {
    const messages = await loadMessages(sessionId);
    if (!messages) {
      const bodyPresent =
        keys.includes(CHAT_SESSION_KEY_PREFIX + sessionId) || keys.includes(chatHeadKey(sessionId));
      if (bodyPresent) return { deleted };
      continue;
    }
    for (const blobId of extractBlobIdsFromMessages(messages)) keepBlobs.add(blobId);
  }

  for (const key of keys) {
    if (!key.startsWith(CHAT_BLOB_KEY_PREFIX)) continue;
    const blobId = key.slice(CHAT_BLOB_KEY_PREFIX.length);
    if (!blobId || keepBlobs.has(blobId)) continue;
    await removeKey(key);
    deleted.push(key);
  }

  return { deleted };
}

let gcTimer: ReturnType<typeof setTimeout> | null = null;
let gcIdleId: number | null = null;

export function cancelOrphanChatGc(): void {
  if (gcTimer) {
    clearTimeout(gcTimer);
    gcTimer = null;
  }
  if (gcIdleId != null && typeof window !== 'undefined') {
    window.cancelIdleCallback?.(gcIdleId);
    gcIdleId = null;
  }
}

export function scheduleOrphanChatGc(): void {
  if (typeof window === 'undefined') return;
  cancelOrphanChatGc();
  const run = () => {
    gcTimer = null;
    gcIdleId = null;
    void gcOrphanedChatKeys();
  };
  const ric = window.requestIdleCallback;
  if (typeof ric === 'function') {
    gcIdleId = ric(run, { timeout: 4000 });
    return;
  }
  gcTimer = setTimeout(run, 0);
}
