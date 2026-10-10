import { consumeStudyStream, createStudyChatTransport } from "@/lib/chat/streaming/consumeStudyStream";
import { buildRequestMessages } from "@/lib/chat/request/buildRequestMessages";
import { checkpointMessages } from '@/lib/context/compactChatSession';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { useCompactionState } from '@/lib/context/compactionState';
import { getOwnerEpoch, getStorageOwner, captureStorageOperation } from '@/lib/storage/ownerScope';
import { collectCloudFileIds } from '@/lib/files/contract';
import { createStreamUiThrottle } from "@/lib/chat/streaming/streamUiThrottle";
import { flushPendingWrites } from "@/lib/storage/idbStorage";
import { notifyAccountUsageChanged } from "@/lib/billing/quotaView";
import { createStallWatchdog, type StallReason } from "@/lib/chat/streaming/createStallWatchdog";
import { hydrateForRequest, lastUserMessageId } from "@/lib/chat/request/hydrateForRequest";
import { resolveFollowUps } from "@/lib/chat/request/resolveFollowUps";
import { fitChatRequest } from "@/lib/chat/request/requestBudget";
import { slimSkillsForRequest } from "@/lib/chat/request/slimSkills";
import { scheduleCloudUpsert } from "@/lib/sync/schedule";
import { markSessionStreaming } from "@/lib/sync/streamingSessions";
import type { ChatRequestBody } from "@/lib/chat/request/buildChatRequestBody";
import type { ContextBudget } from "@/lib/chat/request/estimateContextBudget";
import type { ChatMessage, ContextBreakdown, UsageSummary } from "@/lib/types/chat";
import { localSourceCatalog, readLocalSource, localSourceIsLinked } from '@/lib/local-files/client';
import { localReadInputSchema, type LocalReadOutput } from '@/lib/local-files/contract';
import { useImports } from '@/lib/stores/assets/imports';
import {materializeAnswerAssets} from '@/lib/assets/materialize';

export async function executeChatRequest(input: {
  latestMessages: ChatMessage[];
  abortSignal: AbortSignal;
  budget: ContextBudget;
  body: ChatRequestBody;
  sessionId: string;
  userMessageId: string;
  assistant: ChatMessage;
  userContent: string;
  onWrite: (message: ChatMessage) => void;
  onInfo: (message: string) => void;
  onContextBreakdown: (breakdown: ContextBreakdown) => void;
  onUsage: (usage: UsageSummary) => void;
  /** 看门狗判定超时（idle = 真没数据；max-wait = 总时长到顶）。 */
  onStall: (reason: StallReason) => void;
  /** 「最长等待时间」：客户端总时长闸。缺省走 DEFAULT_MAX_WAIT_MS。 */
  maxWaitMs?: number;
  /** 用户点过「重新带入本轮」的历史消息 id：这些消息的附件重新水合、重新随请求上行。 */
  reincludedMessageIds?: readonly string[];
}): Promise<void> {
  let latest = input.assistant;
  const ownerEpoch = getOwnerEpoch();
  const operation = getStorageOwner() ? captureStorageOperation(input.sessionId) : null;
  const requestSignal = operation ? AbortSignal.any([input.abortSignal, operation.signal]) : input.abortSignal;
  const assertCurrent = () => { requestSignal.throwIfAborted(); if (getOwnerEpoch() !== ownerEpoch) throw new Error('账号已切换，请在当前账号重新发送。'); };
  const throttle = createStreamUiThrottle();
  const writeUi = () => {if(getOwnerEpoch()===ownerEpoch)input.onWrite(latest);};
  let watchdog: ReturnType<typeof createStallWatchdog> | undefined;
  markSessionStreaming(input.sessionId, true);
  try {
    const checkpoint = useChatHistory.getState().sessionsMeta.find(meta => meta.id === input.sessionId)?.contextCheckpoint;
    const sourceMessages = checkpointMessages(input.latestMessages, checkpoint);
    const hydrateIds = lastUserMessageId(input.latestMessages);
    // 新附件用云端稳定引用；仅旧的本机附件需要从 IDB 水合字节。
    const hydrateMessageIds = new Set<string>(input.reincludedMessageIds ?? []);
    if (hydrateIds) hydrateMessageIds.add(hydrateIds);
    const hydrated = await hydrateForRequest(
      sourceMessages,
      requestSignal,
      hydrateMessageIds.size > 0 ? { messageIds: hydrateMessageIds } : undefined,
    );
    assertCurrent();
    const { messages: built } = buildRequestMessages(hydrated, {
      maxTurns: Number.MAX_SAFE_INTEGER,
      preserveAttachmentHistory: false,
      reincludedMessageIds: new Set(input.reincludedMessageIds ?? []),
    });
    const body = {
      ...input.body,
      localFiles: localSourceCatalog(input.sessionId),
      cloudFileIds: [...new Set([...(checkpoint?.cloudFileIds ?? []), ...collectCloudFileIds(input.latestMessages)])],
      skills: slimSkillsForRequest(input.body.skills, hydrated),
    };
    const fitted = fitChatRequest(built, body as unknown as Record<string, unknown>);
    if (fitted.info) input.onInfo(fitted.info);
    watchdog = createStallWatchdog(input.onStall, { maxWaitMs: input.maxWaitMs });
    const transport=createStudyChatTransport(() => { watchdog?.touch(); }, input.body.agentMain === true);
    assertCurrent();
    let stream = await transport.sendMessages({
      chatId: input.sessionId, trigger: "submit-message", messageId: input.userMessageId,
      messages: fitted.messages, abortSignal: requestSignal, body: fitted.body,
    });
    for(let continuation=0;continuation<20;continuation++){
    let token:string|undefined;
    await consumeStudyStream({
      sessionId: input.sessionId,
      sourceMessages:input.latestMessages,
      stream, message: latest, abortSignal: requestSignal,
      onLocalContinuation(value){token=value;},
      onMessage(message) { if(getOwnerEpoch()!==ownerEpoch)return;latest = message; throttle.schedule(writeUi); },
      onInfo: input.onInfo,
      onContextBreakdown: input.onContextBreakdown,
      onUsage: input.onUsage,
    });
    if(!token)break;
    for(const part of latest.parts){
      if(part.type!=='tool-readLocalFile'||part.state!=='input-available')continue;
      const args=localReadInputSchema.parse(part.input),record=useImports.getState().byId[args.sourceId],source=body.localFiles.find(s=>s.sourceId===args.sourceId);
      if(!source)throw new Error('模型请求的本地文件未关联当前会话。');
      let output:LocalReadOutput;
      try{
        if(!localSourceIsLinked(args.sourceId,input.sessionId)||record?.sourceVersion!==source.version)throw new Error('本地源文件已变化，请重新关联后读取。');
        const result=await readLocalSource(args.sourceId,args,requestSignal) as {text?:string;page?:number;nextOffset?:number|null;nextPage?:number|null;image?:LocalReadOutput['image']};
        if(getOwnerEpoch()!==ownerEpoch)throw new Error('账号已切换。');
        if(useImports.getState().byId[args.sourceId]?.sourceVersion!==source.version)throw new Error('本地源文件已更新，请在下一轮重新关联后读取。');
        output={text:(result.text??JSON.stringify(result)).slice(0,12000),sourceId:source.sourceId,sourceVersion:source.version,found:true,page:result.page,nextOffset:result.nextOffset,nextPage:result.nextPage,image:result.image};
      }catch(error){requestSignal.throwIfAborted();output={text:error instanceof Error?error.message:'本地源文件需要重连。',sourceId:source.sourceId,sourceVersion:source.version,found:false};}
      Object.assign(part,{state:'output-available',output});
    }
    if(getOwnerEpoch()!==ownerEpoch)throw new Error('账号已切换。');
    input.onWrite({...latest,parts:[...latest.parts]});
    stream=await transport.sendMessages({chatId:input.sessionId,trigger:'submit-message',messageId:input.userMessageId,messages:[...fitted.messages.filter(m=>m.id!==latest.id),latest],abortSignal:requestSignal,body:{...fitted.body,localContinuation:token}});
    }
    if(getOwnerEpoch()!==ownerEpoch)throw new Error('账号已切换。');
    const followUps = resolveFollowUps(latest, input.userContent);
    materializeAnswerAssets(latest);
    if (followUps) {
      latest = { ...latest, followUpQuestions: followUps };
      throttle.schedule(writeUi);
    }
  } finally {
    if (getOwnerEpoch() === ownerEpoch && useCompactionState.getState().byId[input.sessionId]?.phase === 'running') useCompactionState.getState().set(input.sessionId, 'error', '上下文整理被中断，原对话与附件仍保留。');
    throttle.flush();
    flushPendingWrites();
    if(getOwnerEpoch()===ownerEpoch){markSessionStreaming(input.sessionId, false);scheduleCloudUpsert("chat-session", input.sessionId);}
    watchdog?.stop();
    notifyAccountUsageChanged();
  }
}
