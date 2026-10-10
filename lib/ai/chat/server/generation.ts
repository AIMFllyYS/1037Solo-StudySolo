import { compactArtifactMessages } from "@/lib/context/compactArtifacts";
import { compactHistory } from "@/lib/context/compactHistory";
import { pruneStudyMessages } from "@/lib/context/pruneStudyMessages";
import { CONTEXT_WARNING } from "@/lib/chat/estimateContextBudget";
import { getContextManager } from "@/lib/context";
import { isSoftLimitReached } from "@/lib/context/estimateFullContext";
import type { ChatMessage } from "@/lib/types/chat";

import { getModelInfoWithCustom } from "@/lib/ai/models";

import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";

import { createStudyAgent, type StudyAgentInput } from "@/lib/ai/agent/studyAgent";
import { addUsage, decideContinuation, isTextOnlyContinuation } from "@/lib/ai/agent/completionGuard";
import { isComposerForcedTool } from "@/lib/chat/composerIntent";
import { TOOL_STEP_LIMIT_INFO, clampMaxToolRounds } from "@/lib/ai/agent/tools/server";
import { computeContextBreakdown, estimateRequestContextTokens } from "@/lib/ai/agent/contextBreakdown";
import { generateFallbackFollowUps } from "@/lib/ai/agent/followUps";

import { awaitUsage, resolveActualBillingModelId, settleChatUsage } from "@/lib/billing/usageLedger";

import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";

import { carryNotice, summarizeCarry } from "@/lib/project/catalog";

import { kitSoloAccess } from "@/lib/plugins/kitsolo-oauth-client";
import { requestToken } from "@/lib/auth/sign-in/account-verify";
import { connectorOwner } from "@/lib/connectors/actor.server";
import { sandboxScopeForChat } from "@/lib/sandbox/actor.server";
import { skillsForAgent } from "@/lib/sandbox/skills.server";

import { issueLocalContinuation } from '@/lib/local-files/continuation.server';

import type { ChatGenerationInput } from './contracts';
import { writeTextPart, lastUserText, hasFileParts, toModelMessages } from './messages';

/** Own the ordered generation, cancellation, continuation and usage settlement lifecycle. */
export async function runChatGeneration({ req, body, writer, modelId, effectiveModelId, effectiveCustom, customGroups, automaticModels, isImageMode, secrets, formatError, generationAbort, generationSignal, userId, requestId, autoSearch, options, chatCtx, localUsedSteps }: ChatGenerationInput) {
  const resolved = resolveLanguageModel(effectiveModelId, effectiveCustom, {
    fallbackModelIds: automaticModels?.slice(1) ?? (isImageMode ? [body.imageModeTextModelFallback] : []),
    allowedModelIds: automaticModels,
    onFailover: ({ label }) =>
      writer.write({
        type: "data-info",
        data: { message: automaticModels ? '正在重新连接模型服务…' : `主端点不可用，已切换到备用 API（${label}）` },
        transient: true,
      }),
  });
  const { provider } = resolved;
  if (provider.apiKey) secrets.push(provider.apiKey);
  const modelInfo = effectiveModelId ? getModelInfoWithCustom(effectiveModelId, customGroups) : undefined;

  if (!provider.configured) {
    writeTextPart(
      writer,
      "AI 暂未配置。请在 .env.local 填写 AI_BASE_URL / AI_API_KEY，或在「设置」中填入自定义 API 后重试。",
    );
    return;
  }
  if (hasFileParts(body.messages) && modelInfo && !modelInfo.vision) {
    throw new Error(`当前模型 ${modelInfo.label} 不支持图片理解，请切换到支持视觉的模型（如 MiMo 2.6 Pro）。`);
  }

  // 自动联网的透明提示：本轮为什么能用搜索，用户有权知道（搜索是要花钱的）。
  if (autoSearch) {
    writer.write({
      type: "data-info",
      data: { message: "这个问题依赖外部实时信息，已自动为本轮打开联网搜索。" },
      transient: true,
    });
  }

  // 项目文件降级提示：项目一大，客户端就从「全带」翻成「只带勾选/本会话读过的片」，
  // 其余正文这轮模型读不到。这个翻转以前是静默的——用户只会看到 Agent 回一句
  // 「这一轮没有携带切片正文」。改成在回答开始前就告诉用户该怎么补。
  const carryMessage = carryNotice(summarizeCarry(body.projectFiles, body.projectSlices));
  if (carryMessage) {
    writer.write({ type: "data-info", data: { message: carryMessage }, transient: true });
  }

  // 参考材料 + 软上限。两端 80% 用同一套全量估算（system + 工具 schema + 参考材料 + 对话历史）。
  const userText = lastUserText(body.messages);
  const ctxManager = getContextManager(options.contextMode ?? "full", effectiveModelId, customGroups);
  // 上下文装配（semantic 模式内含检索 RTT）与附件 rehydrate 互不依赖，并行省一个网络往返。
  const [initialCtx, modelMessages] = await Promise.all([
    ctxManager.buildContext(chatCtx, userText, { compact: body.contextTruncated }),
    toModelMessages(body.messages, {
      skills: body.skills,
      artifacts: body.artifacts,
      academicYear: body.academicYear,
    }),
  ]);
  let ctxResult = initialCtx;
  const prunedHistory = pruneStudyMessages(compactArtifactMessages(modelMessages));
  const candidateLimit = automaticModels
    ? Math.min(...automaticModels.map((id) => (getModelInfoWithCustom(id, customGroups)?.contextK ?? 128) * 1000))
    : ctxResult.maxTokens;
  const requestedBudget = body.sessionContextBudgetTokens;
  const contextBudget = Math.min(ctxResult.maxTokens, candidateLimit,
    requestedBudget != null && requestedBudget > 0 ? requestedBudget : ctxResult.maxTokens);

  // The server-written hint avoids a remote lookup for uninstalled plugins.
  // It grants no access: KitSolo still verifies Account UUID and live consent.
  const installed = (req.headers.get("cookie") ?? "").split(";").some(part => part.trim() === "kitsolo_connected_studysolo=1");
  const accountToken = userId && installed && !isImageMode && !body.noteWindowAgent && !body.disabledTools.includes("kitSolo") ? requestToken(req.headers) : null;
  const kitSoloAccessToken = accountToken ? await kitSoloAccess(accountToken, "studysolo") : null;
  const canonicalConnectorOwner = await connectorOwner(req).catch(() => undefined);
  const cloudSandboxScope = !isImageMode ? await sandboxScopeForChat(req, body) : undefined;
  const agentSkills = await skillsForAgent(cloudSandboxScope, body.skills, undefined, () => {
    writer.write({ type: "data-info", data: { message: "云端技能包状态暂时不可用；本次对话仍可继续。云端操作会单独检查运行环境与账号验证。" }, transient: true });
  });
  const bundleInput = (truncated: boolean, referenceContext: string): StudyAgentInput => ({
    connectorOwner: canonicalConnectorOwner,
    cloudSandboxScope,
    kitSoloAccessToken: kitSoloAccessToken ?? undefined,
    model: resolved.model,
    chatCtx,
    options,
    disabledTools: body.disabledTools,
    skills: agentSkills,
    globalContext: body.globalContext.trim(),
    referenceContext,
    contextTruncated: truncated,
    artifacts: body.artifacts,
    isImageMode,
    selectedModelId: automaticModels ? effectiveModelId : modelId ?? effectiveModelId,
    modelSupportsTools: resolved.supportsTools,
    thinking: options.enableThinking ? resolved.thinkingSettings(options.thinkingEffort) : {},
    memoryCommit: body.memoryCommit,
    editingUserNote: body.editingUserNote,
    noteWindowAgent: body.noteWindowAgent,
    userNotes: body.noteWindowAgent ? [] : body.userNotes,
    flashcards: body.noteWindowAgent ? [] : body.flashcards,
    maxToolRounds: body.maxToolRounds,
    maxOutputTokens: body.maxOutputTokens,
    planMode: body.planMode,
    forcedTool: isComposerForcedTool(body.forcedTool) ? body.forcedTool : undefined,
    attachedFiles: body.attachedFiles,
    userId: userId ?? undefined,
    projectFiles: body.projectFiles,
    localFiles: body.localFiles,
    projectSlices: body.projectSlices,
    classContext: body.noteWindowAgent ? undefined : body.classContext,
  });
  const makeBundle = (truncated: boolean, referenceContext: string) =>
    createStudyAgent(bundleInput(truncated, referenceContext));

  const estimateIncoming = (truncated: boolean, referenceContext: string) => {
    const next = makeBundle(truncated, referenceContext);
    return {
      bundle: next,
      tokens: estimateRequestContextTokens({
        promptParts: next.promptParts,
        tools: next.tools,
        historyMessages: prunedHistory,
      }),
    };
  };

  let incoming = estimateIncoming(body.contextTruncated, ctxResult.context);
  let serverSoftLimitReached = isSoftLimitReached(incoming.tokens, contextBudget);
  if (!body.contextTruncated && (serverSoftLimitReached || ctxResult.overflow)) {
    ctxResult = await ctxManager.buildContext(chatCtx, userText, { compact: true });
    incoming = estimateIncoming(true, ctxResult.context);
    serverSoftLimitReached = isSoftLimitReached(incoming.tokens, contextBudget);
  }
  const contextTruncated = body.contextTruncated || serverSoftLimitReached || ctxResult.overflow;
  const bundle = contextTruncated === body.contextTruncated
    ? incoming.bundle
    : makeBundle(contextTruncated, ctxResult.context);
  if (contextTruncated) writer.write({ type: 'data-context-compaction', data: { phase: 'running' }, transient: true });
  const compacted = await compactHistory({
    messages: prunedHistory,
    shouldCompact: contextTruncated,
    sessionId: `${userId}:${body.id ?? requestId}`,
    abortSignal: generationSignal,
    modelId: provider.registryId,
    useSelectedModel: !!automaticModels,
    isCustom: provider.isCustom,
    custom: effectiveCustom,
  });
  const historyMessages = compacted.messages;
  if (contextTruncated) {
    const userIndices = body.messages.flatMap((message, index) => message.role === 'user' ? [index] : []);
    const cut = userIndices.length > 6 ? userIndices[userIndices.length - 6]! : 0;
    writer.write({ type: 'data-context-compaction', data: { phase: 'done', ...(compacted.summary ? { summary: compacted.summary, coveredIds: body.messages.slice(0, cut).flatMap(message => message.id ? [message.id] : []), cloudFileIds: body.cloudFileIds, createdAt: Date.now() } : {}) }, transient: true });
  }
  const startedAt = Date.now();
  const result = await bundle.agent.stream({
    messages: historyMessages,
    abortSignal: generationSignal,
  });

  // 手动转发而非 writer.merge：保证 usage / breakdown / followup 等 data part 与 finish 严格排在正文之后。
  let streamFailed = false;
  const localCalls:Array<{toolCallId:string;input:unknown}>=[];
  try {
    for await (const chunk of result.toUIMessageStream<ChatMessage>({
      sendReasoning: true, sendStart: true, sendFinish: false, onError: formatError,
    })) {
      writer.write(chunk);
      if(chunk.type==='tool-input-available'&&chunk.toolName==='readLocalFile')localCalls.push({toolCallId:chunk.toolCallId,input:chunk.input});
      if (chunk.type === "error" || chunk.type === "abort") {
        // SDK failures are stream data, not necessarily rejected result promises.
        // Stop the provider and never run a second, billable follow-up request.
        generationAbort.abort();
        streamFailed = true;
        break;
      }
    }
  } catch {
    generationAbort.abort();
    streamFailed = true;
  }

  let aborted = streamFailed || generationSignal.aborted;
  let continuationUsage: unknown;
  let continuationText = "";
  let continuationFinish: Awaited<typeof result.finishReason> | undefined;
  if (!aborted) {
    // 收尾守卫：空正文 / 口头宣称调用工具却未调用 → 同一条消息内续写一次。
    const firstSteps = await result.steps;
    const decision = decideContinuation({
      steps: firstSteps.map((step) => ({
        text: step.text,
        reasoningText: step.reasoningText,
        finishReason: step.finishReason,
        toolCalls: step.toolCalls,
      })),
      toolNames: Object.keys(bundle.tools),
      stepLimit: clampMaxToolRounds(body.maxToolRounds),
      disabled: isImageMode || body.planMode === true || localCalls.length>0,
    });
    if (decision) {
      const textOnly = isTextOnlyContinuation(decision.kind);
      const recoveryBundle = createStudyAgent({ ...bundleInput(contextTruncated, ctxResult.context), recovery: decision.kind });
      // bundleInput 会重新请求思考参数；只写正文的续写必须在它之后真正关掉思考，
      // 否则 prepareCall 仍给每一跳补上思考参数，续写可能再次只思考不写正文。
      if (textOnly) resolved.suspendThinking();
      const response = await result.response;
      const recovery = await recoveryBundle.agent.stream({
        messages: [...historyMessages, ...response.messages, { role: "user", content: decision.nudge }],
        abortSignal: generationSignal,
      });
      try {
        for await (const chunk of recovery.toUIMessageStream<ChatMessage>({
          sendReasoning: !textOnly, sendStart: false, sendFinish: false, onError: formatError,
        })) {
          writer.write(chunk);
          if (chunk.type === "error" || chunk.type === "abort") {
            generationAbort.abort();
            streamFailed = true;
            break;
          }
        }
      } catch {
        generationAbort.abort();
        streamFailed = true;
      }
      continuationUsage = await awaitUsage(recovery.totalUsage);
      if (!streamFailed) {
        continuationText = await recovery.text;
        continuationFinish = await recovery.finishReason;
      }
      aborted = streamFailed || generationSignal.aborted;
    }
  }
  if(!aborted&&localCalls.length&&userId){
    const token=await issueLocalContinuation(userId,body.id??'',body.localFiles,localCalls,localUsedSteps+(await result.steps).length);
    writer.write({type:'data-local-continuation',data:{token},transient:true});
  }
  if (!aborted&&!localCalls.length) writer.write({ type: 'data-answer-complete', data: { durationMs: Date.now() - startedAt } });
  const selectedModelId = modelId ?? effectiveModelId;
  const actualProvider = resolved.getActualProvider();
  const actualModelId = resolveActualBillingModelId(actualProvider);
  const usedPlatform = usedPlatformCredentialsForProvider(actualProvider);
  const pool = resolveMainModelPool(usedPlatform);
  // 上游 usage 到手即记账；abort/error 也走这里，不依赖客户端是否还连着 SSE。
  // BYOK 主模型不进任何池、不落行。
  const settled = await settleChatUsage({
    rawUsage: addUsage(await awaitUsage(result.totalUsage), continuationUsage),
    userId,
    selectedModelId,
    actualModelId,
    customGroups,
    pool: pool ?? undefined,
    skipInsert: pool == null,
    sessionId: body.id,
    requestId,
    aborted,
  });
  if (aborted) return;

  const [steps, firstText, firstFinish] = await Promise.all([
    result.steps, result.text, result.finishReason,
  ]);
  const finalText = [firstText, continuationText].filter((text) => text.trim()).join("\n\n");
  const finishReason = continuationFinish ?? firstFinish;

  // 第 6 步仍要工具且无第 7 次 LLM：SDK finishReason 为 tool-calls。
  if (finishReason === "tool-calls") {
    writer.write({
      type: "data-info",
      data: { message: TOOL_STEP_LIMIT_INFO },
      transient: true,
    });
  }

  // FollowUp 兜底：模型未输出 <FollowUp> 标签时，用轻量模型生成追问。
  // 窗内笔记对话不生成：它的产出是笔记候选稿，教学式追问属于聊天套话，与笔记角色冲突。
  if (
    !automaticModels &&
    !body.noteWindowAgent &&
    finalText &&
    !/<FollowUp>[\s\S]*?<\/FollowUp>/i.test(finalText)
  ) {
    const questions = await generateFallbackFollowUps({
      userText,
      answerText: finalText,
      modelId: provider.registryId,
      isCustom: provider.isCustom,
      custom: effectiveCustom,
      abortSignal: generationSignal,
    });
    if (questions.length > 0) writer.write({ type: "data-followup", data: { questions } });
  }

  writer.write({
    type: "data-context-breakdown",
    data: computeContextBreakdown({
      promptParts: bundle.promptParts,
      tools: bundle.tools,
      historyMessages,
      steps,
      clientContextTokens: body.clientContextTokens ?? null,
      truncated: contextTruncated,
      cachedTokens: settled.summary?.cachedTokens ?? 0,
      cacheHit: (settled.summary?.cachedTokens ?? 0) > 0,
      warning: contextTruncated ? CONTEXT_WARNING : undefined,
    }),
  });

  if (settled.summary) {
    writer.write({ type: "data-usage", data: settled.summary });
  }
  writer.write({
    type: "message-metadata",
    messageMetadata: {
      ...(settled.summary ? { usage: settled.summary } : {}),
      durationMs: Date.now() - startedAt,
      modelId: modelId ?? effectiveModelId,
      finishReason,
    },
  });
  writer.write({ type: "finish", finishReason });

}
