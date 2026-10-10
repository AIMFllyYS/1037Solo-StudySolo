import { useCallback } from 'react';
import { useChatHistory } from '../../stores/chat/chatHistory';
import { useSettings } from '../../stores/settings';
import { useSkills } from '../../stores/skills';
import { useTokenTracker } from '../../stores/chat/tokenTracker';
import { useFloatingTokenTracker } from '../../stores/chat/floatingTokenTracker';
import { useBillingStore, createBillingRecord } from '../../stores/billing';
import { useAcademicYear } from '../../stores/academicYear';
import { useArtifacts } from '../../stores/assets/artifacts';
import { useSessionRuns } from '@/lib/stores/chat/sessionRuns';
import { collectRequestArtifacts } from '@/lib/context/compactArtifacts';
import { getClassAgentContext } from '@/lib/class/agentContext';
import type { ChatMessage, ChatContext, ChatOptions } from '@/lib/types/chat';
import { createAssistantPlaceholder, createUserMessage } from '@/lib/chat/messages/messageParts';
import { buildRequestMessages, MAX_REQUEST_MESSAGES } from '@/lib/chat/request/buildRequestMessages';
import { loadSessionMessages } from '@/lib/storage/chatStorage';
import { compactActiveSession, checkpointMessages } from '@/lib/context/compactChatSession';
import { useCompactionState } from '@/lib/context/compactionState';
import { restoreProjectCloudFiles } from '@/lib/project/cloudFiles';
import {
  canSendNow, resolveRequestSettings, estimateContextBudget, displayContextTokens, CONTEXT_WARNING,
  buildChatRequestBody, kickoffSessionTitle, classifySendError, executeChatRequest,
  type SendMessageOptions,
} from '@/lib/chat/sendMessage';
import { selectEditingUserNote } from '@/lib/notes/editor/selectEditingNote';
import { collectFlashcardCatalog, collectUserNoteCatalog } from '@/lib/ai/agent/tools/memoryCatalog';
import { useUserNotes } from '@/lib/stores/learning/userNotes';
import { useReviewCards } from '@/lib/stores/learning/reviewCards';
import { useProjectFiles, listProjectFiles } from '@/lib/stores/assets/projectFiles';
import type { StallReason } from '@/lib/chat/streaming/createStallWatchdog';
import { buildProjectCatalog, buildProjectSliceBodies, planCarry, withRememberedSlices } from '@/lib/project/catalog';
import { collectReadSliceIds } from '@/lib/project/sessionSlices';
import { useReincludedAttachments } from '@/lib/stores/assets/reincludedAttachments';
import { shouldAutoEnableSearch } from '@/lib/ai/search/autoEnable';

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * 「这条会话此刻是否在被用户看着」→ 终态要不要亮蓝点/红点。
 * 不是当前 active、标签页在后台、或人根本不在对话页（比如在学科页/资产页），都算没看见。
 */
function sessionUnseen(sessionId: string): boolean {
  const activeId = useChatHistory.getState().activeSessionId;
  if (activeId !== sessionId) return true;
  if (typeof document !== 'undefined' && document.hidden) return true;
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path !== '/agent' && !path.startsWith('/c/')) return true;
  }
  return false;
}

export function useChat(chatContext: ChatContext, options?: ChatOptions, overrides?: {
  sessionId?: string;
  modelId?: string;
  /** 窗内笔记对话锁定这篇笔记；主对话不传，仍读 cite 写入的 agentEditingNoteId。 */
  editingUserNoteId?: string;
  /** Only supplied by the independent Agent center; all embedded/scheduled callers default false. */
  agentMain?: boolean;
}) {
  const ovSessionId = overrides?.sessionId;
  const ovModelId = overrides?.modelId;
  const ovEditingUserNoteId = overrides?.editingUserNoteId;
  const ovAgentMain = overrides?.agentMain === true;
  const resolvedSessionId = useChatHistory((s) => ovSessionId ?? s.activeSessionId);
  const messages = useChatHistory((s) => {
    const sid = ovSessionId ?? s.activeSessionId;
    return sid ? s.messagesById[sid] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  });
  // 运行状态按 sessionId 存 store（不在这个 hook 实例里）：切走会话不杀流，
  // 多条会话并发互不干扰；组件卸载更不该中止——「离开对话仍继续，关站才停」。
  const runPhase = useSessionRuns((s) => (resolvedSessionId ? s.byId[resolvedSessionId]?.phase : undefined));
  const runError = useSessionRuns((s) => (resolvedSessionId ? s.byId[resolvedSessionId]?.error : undefined));
  const runInfo = useSessionRuns((s) => (resolvedSessionId ? s.byId[resolvedSessionId]?.info : undefined));
  const isLoading = runPhase === 'running';
  const error = runPhase === 'error' ? runError ?? null : null;
  const info = runInfo ?? null;
  const clearError = useCallback(() => {
    const sid = ovSessionId ?? useChatHistory.getState().activeSessionId;
    if (sid) useSessionRuns.getState().clearError(sid);
  }, [ovSessionId]);
  const clearInfo = useCallback(() => {
    const sid = ovSessionId ?? useChatHistory.getState().activeSessionId;
    if (sid) useSessionRuns.getState().setInfo(sid, null);
  }, [ovSessionId]);
  const stopGeneration = useCallback(() => {
    const sid = ovSessionId ?? useChatHistory.getState().activeSessionId;
    if (sid) useSessionRuns.getState().abortRun(sid);
  }, [ovSessionId]);
  const sendMessage = useCallback((content: string, sendOptions?: SendMessageOptions) => {
    if (!content.trim()) return false;
    const history = useChatHistory.getState();
    // 队列派发的消息可能绑定历史会话（sendOptions.sessionId）；门控按目标会话判，不看别的跑道。
    const explicitSessionId = sendOptions?.sessionId ?? ovSessionId;
    if (!canSendNow(history, explicitSessionId)) return false;
    const settings = useSettings.getState();
    // 「需要搜索就联网」：问题明显依赖外部/实时信息时，本轮自动打开联网搜索。
    // 客户端先开一次，是为了把用户自备的搜索 key 也带上去（服务端只剥离、不补齐）。
    const resolvedSettings = resolveRequestSettings(settings, options, sendOptions, ovModelId);
    const autoSearch = !resolvedSettings.enableSearch && shouldAutoEnableSearch(content);
    const resolved = autoSearch ? { ...resolvedSettings, enableSearch: true } : resolvedSettings;
    const academicYear = chatContext.academicYear ?? useAcademicYear.getState().year;
    const skills = useSkills.getState().skills;
    const sessionId = explicitSessionId ?? history.activeSessionId ?? history.createSession(chatContext);
    if (useCompactionState.getState().byId[sessionId]?.phase === 'running') return false;
    // 并发单位是「会话」而不是「这个 hook」：同一条会话已在跑才拒发，别的会话在跑不拦。
    if (useSessionRuns.getState().byId[sessionId]?.phase === 'running') return false;
    const quoteIntro = sendOptions?.quoteIntro ?? "针对当前页面这段原文";
    const userContent = sendOptions?.quotedText
      ? `${quoteIntro}：\n\n> ${sendOptions.quotedText}\n\n${content}` : content;
    const userMessage = createUserMessage(crypto.randomUUID(), userContent, { attachments: sendOptions?.attachments });
    // 「首条消息」看 manifest 计数而不是窗口长度：窗口外有更早轮次时长度>0，
    // 但真正空会话的 meta.messageCount 才是 0（标题生成只认这个）。
    const isFirstMessage = (useChatHistory.getState().sessionsMeta.find((s) => s.id === sessionId)?.messageCount ?? 0) === 0;
    history.addMessage(sessionId, userMessage);
    if (isFirstMessage) {
      // 命名交给专门的廉价快速模型（/api/chat-title → 七牛云 doubao），Auto 模式也一样：
      // 以前 Auto 只敢用本地标题，是因为命名会占用主力模型；现在这一步不再依赖主力模型。
      history.updateSessionTitle(sessionId, kickoffSessionTitle(sessionId, userContent, chatContext, (id, title) => {
        useChatHistory.getState().updateSessionTitle(id, title);
      }));
    }
    const assistant = createAssistantPlaceholder(crypto.randomUUID(), {
      thinkingEnabled: resolved.enableThinking, searchEnabled: resolved.enableSearch, modelId: resolved.effectiveModelId,
    });
    history.addMessage(sessionId, assistant);
    const abortController = new AbortController();
    useSessionRuns.getState().markRunning(sessionId, abortController);
    const isNoteWindow = Boolean(ovEditingUserNoteId);
    const notesState = useUserNotes.getState();
    const cardsState = useReviewCards.getState();
    const userNotes = isNoteWindow
      ? []
      : collectUserNoteCatalog(notesState.order.map((id) => notesState.byId[id]).filter(Boolean));
    const flashcards = isNoteWindow
      ? []
      : collectFlashcardCatalog(cardsState.order.map((id) => cardsState.byId[id]).filter(Boolean));
    // 项目文件：主对话才带。归属看**会话自己所在的项目**（folderId），不是侧栏当前选中的那个——
    // 否则从历史里打开一条旧对话继续聊，会突然带上另一个项目的文件（会话"换户口"）。
    // 会话还没归到任何项目时才回落到当前选中项目。
    const historySnapshot = useChatHistory.getState();
    const sessionMeta = historySnapshot.sessionsMeta.find((meta) => meta.id === sessionId);
    const sessionProjectId = isNoteWindow
      ? null
      : sessionMeta?.folderId ?? historySnapshot.activeProjectId;
    const projectFileList = sessionProjectId
      ? listProjectFiles(useProjectFiles.getState(), sessionProjectId)
      : [];
    // 目录（索引）永远带；正文按携带计划带：项目不大默认全带，超预算才带勾选 + 本会话读过的片。
    const carryPlan = withRememberedSlices(
      planCarry(projectFileList, sessionProjectId ?? undefined),
      sessionMeta?.readSliceIds ?? [],
    );
    let projectFiles = sessionProjectId
      ? buildProjectCatalog(projectFileList, sessionProjectId).files
      : [];
    let projectSlices = sessionProjectId
      ? buildProjectSliceBodies(projectFileList, carryPlan, sessionProjectId).payloads
      : [];
    void (async () => {
      // null = 未触发；否则记录是哪种超时，用来给不同文案。
      let stalled: StallReason | null = null;
      try {
        // 窗口化后 messagesById 只装尾部几轮：请求上下文（含更早轮次与「重新带入」的附件）
        // 从存储装配。请求本身只发最近 MAX_REQUEST_MESSAGES 条，所以按尾部读，不全量解析；
        // 唯一例外是用户点过「重新带入本轮」的历史消息——它可能落在尾部窗口外，从内存窗口补齐。
        // 落盘形态已是 persist 压缩态，与请求侧 ui-request 压缩语义一致。
        const windowFallback = useChatHistory.getState().messagesById[sessionId] ?? [];
        const reincluded = useReincludedAttachments.getState().takeForRequest(sessionId);
        const loadedHistory = await loadSessionMessages(sessionId);
        const minimumKnownCount = Math.max(0, (useChatHistory.getState().sessionsMeta.find(meta => meta.id === sessionId)?.messageCount ?? 0) - 2);
        const storedTail = loadedHistory?.length ? loadedHistory : windowFallback;
        if (storedTail.length < minimumKnownCount) throw new Error('完整对话历史暂时无法读取，原数据已保留，请重试。');
        const tailIds = new Set(storedTail.map((entry) => entry.id));
        const extras = reincluded.length
          ? windowFallback.filter((entry) => reincluded.includes(entry.id) && !tailIds.has(entry.id))
          : [];
        const storedAll = extras.length ? [...extras, ...storedTail] : storedTail;
        // addMessage immediately replaces large inline attachments with IndexedDB refs.
        // Keep this turn's original in-memory payload for the request so a just-started
        // blob write can never race the following hydration read.
        // 兜底：本轮 user 消息可能还排在会话写队列里没进 chunk，读不到就手动补在末尾。
        const latestMessages = storedAll.some((entry) => entry.id === userMessage.id)
          ? storedAll.map((entry) => entry.id === userMessage.id ? userMessage : entry)
          : [...storedAll, userMessage];
        if (sessionProjectId) {
          await restoreProjectCloudFiles(sessionProjectId).catch(() => { useSessionRuns.getState().setInfo(sessionId, '项目云文件暂时无法刷新，已有本机索引保留；云文件读取会继续检查实际状态。'); });
          const liveFiles = listProjectFiles(useProjectFiles.getState(), sessionProjectId);
          projectFiles = buildProjectCatalog(liveFiles, sessionProjectId).files;
          projectSlices = buildProjectSliceBodies(liveFiles, withRememberedSlices(planCarry(liveFiles, sessionProjectId), sessionMeta?.readSliceIds ?? []), sessionProjectId).payloads;
        }
        const checkpoint = useChatHistory.getState().sessionsMeta.find(meta => meta.id === sessionId)?.contextCheckpoint;
        const requestHistory = checkpointMessages(latestMessages, checkpoint);
        const { messages: estimateMessages } = buildRequestMessages(requestHistory);
        const tracker = ovSessionId
          ? useFloatingTokenTracker.getState().getSession(ovSessionId) : useTokenTracker.getState();
        let budget = estimateContextBudget(tracker, resolved.model, estimateMessages, userContent);
        if (budget.softLimitReached || estimateMessages.length > MAX_REQUEST_MESSAGES) {
          const compacted = await compactActiveSession(sessionId, { duringSend: true, signal: abortController.signal });
          if (compacted.compacted) {
            const freshCheckpoint = useChatHistory.getState().sessionsMeta.find(meta => meta.id === sessionId)?.contextCheckpoint;
            const condensed = buildRequestMessages(checkpointMessages(latestMessages, freshCheckpoint)).messages;
            budget = estimateContextBudget({ ...tracker, serverContextTokens: 0 }, resolved.model, condensed, userContent);
          }
        }
        const ringTokens = displayContextTokens(tracker, budget);
        if (ovSessionId) {
          const floating = useFloatingTokenTracker.getState();
          floating.setCurrentContext(ovSessionId, ringTokens, budget.limit);
          floating.setContextWarning(ovSessionId, budget.softLimitReached, CONTEXT_WARNING);
        } else {
          const tokens = useTokenTracker.getState();
          tokens.setCurrentContext(ringTokens, budget.limit);
          tokens.setContextWarning(budget.softLimitReached, CONTEXT_WARNING);
        }
        await executeChatRequest({
          latestMessages, abortSignal: abortController.signal, budget,
          body: buildChatRequestBody(
            chatContext,
            {
              ...settings,
              memoryCommit: sendOptions?.memoryCommit,
              editingUserNote: selectEditingUserNote(ovEditingUserNoteId) ?? undefined,
              noteWindowAgent: isNoteWindow,
              agentMain: ovAgentMain && !ovSessionId && !isNoteWindow,
              userNotes,
              flashcards,
              projectFiles,
              projectSlices,
              maxToolRounds: settings.maxToolRounds,
              planMode: sendOptions?.planMode,
              forcedTool: sendOptions?.forcedTool,
              attachedFiles: sendOptions?.attachedFiles,
              // 只有主对话在 Class 模式里带课堂上下文；浮窗/笔记窗各管各的语境。
              classContext: ovSessionId || isNoteWindow ? undefined : getClassAgentContext() ?? undefined,
            },
            resolved,
            budget,
            skills,
            academicYear,
            collectRequestArtifacts(latestMessages, useArtifacts.getState()),
          ),
          sessionId, userMessageId: userMessage.id, assistant, userContent,
          onWrite: (message) => useChatHistory.getState().updateMessage(sessionId, assistant.id, {
            parts: message.parts, metadata: message.metadata, followUpQuestions: message.followUpQuestions,
          }),
          onInfo: (message) => { useSessionRuns.getState().setInfo(sessionId, message); },
          onContextBreakdown: (breakdown) => {
            if (ovSessionId) useFloatingTokenTracker.getState().setContextBreakdown(ovSessionId, breakdown);
            else if (useChatHistory.getState().activeSessionId === sessionId) useTokenTracker.getState().setContextBreakdown(breakdown);
          },
          onUsage: (usage) => {
            if (usage.promptTokens <= 0 && usage.completionTokens <= 0) return;
            if (ovSessionId) useFloatingTokenTracker.getState().addUsage(ovSessionId, usage);
            else if (useChatHistory.getState().activeSessionId === sessionId) useTokenTracker.getState().addUsage(usage);
            useBillingStore.getState().addRecord(createBillingRecord({
              type: 'chat',
              modelId: usage.actualModelId
                ?? (resolved.model?.type === 'image' ? settings.imageModeTextModel : resolved.effectiveModelId),
              sessionId,
              customGroups: settings.customApiGroups, usage,
            }));
          },
          onStall: (reason) => { stalled = reason; abortController.abort(); },
          maxWaitMs: settings.maxWaitMs,
          // 「重新带入本轮」是一次性意图：在上面装配上下文时已消费，成败都不留痕。
          reincludedMessageIds: reincluded,
        });
        // 记住这一轮真读到的项目切片：项目超预算后携带计划只带勾选/已读的片，
        // 不回填的话模型第 3 轮读得到的东西第 5 轮就"找不着了"。
        const finished = useChatHistory.getState().messagesById[sessionId]
          ?.find((message) => message.id === assistant.id);
        const readSliceIds = collectReadSliceIds(finished?.parts);
        if (readSliceIds.length > 0) useChatHistory.getState().rememberReadSlices(sessionId, readSliceIds);
        // 会话中途被删就别回填终态：deleteSession 已经把 run 记录一起抹了。
        if (useChatHistory.getState().sessionsMeta.some((s) => s.id === sessionId)) {
          useSessionRuns.getState().markDone(sessionId, sessionUnseen(sessionId));
        }
      } catch (err: unknown) {
        const message = classifySendError(err, {
          stalled: stalled ?? false,
          aborted: abortController.signal.aborted,
          maxWaitMs: settings.maxWaitMs,
        });
        if (useChatHistory.getState().sessionsMeta.some((s) => s.id === sessionId)) {
          const unseen = sessionUnseen(sessionId);
          if (message) {
            if (!stalled) console.warn('Chat request failed:', message);
            useSessionRuns.getState().markError(sessionId, message, unseen);
          } else {
            // 用户主动停止 / 组件触发的 abort：按「完成」收口，不算错误。
            useSessionRuns.getState().markDone(sessionId, unseen);
          }
        }
      } finally {
        useSessionRuns.getState().releaseController(sessionId, abortController);
      }
    })();
    return true;
  }, [chatContext, options, ovSessionId, ovModelId, ovEditingUserNoteId, ovAgentMain]);
  return { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo, sessionId: resolvedSessionId };
}
