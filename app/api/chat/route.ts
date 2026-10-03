import { withPaidRequest } from "@/lib/billing/paidRequest";
import { optionalPaidContext } from "@/lib/billing/paidContext";
import type { NextRequest } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  type UIMessageStreamWriter,
} from "ai";
import { compactStudyParts } from "@/lib/chat/compactStudyParts";
import { rehydrateStudyParts } from "@/lib/chat/rehydrateStudyParts";
import { compactArtifactMessages } from "@/lib/context/compactArtifacts";
import { compactHistory } from "@/lib/context/compactHistory";
import { pruneStudyMessages } from "@/lib/context/pruneStudyMessages";
import { CONTEXT_WARNING } from "@/lib/chat/estimateContextBudget";
import { getContextManager } from "@/lib/context";
import { isSoftLimitReached } from "@/lib/context/estimateFullContext";
import type { ChatContext, ChatMessage, ChatOptions } from "@/lib/types/chat";
import { ENV_MODEL_PRO, ENV_MODEL_FLASH, resolveProvider } from "@/lib/ai/provider";
import { AUTO_MODEL_ID, getModelInfoWithCustom } from "@/lib/ai/models";
import { decideAutomaticModels } from "@/lib/ai/autoRoute";
import { estimateTokens } from "@/lib/context/estimateTokens";
import { resolveLanguageModel } from "@/lib/ai/sdk/languageModel";
import { withSseHeartbeat } from "@/lib/ai/sdk/heartbeat";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";
import { createStudyAgent, type StudyAgentInput } from "@/lib/ai/agent/studyAgent";
import { addUsage, decideContinuation, isTextOnlyContinuation } from "@/lib/ai/agent/completionGuard";
import { isComposerForcedTool } from "@/lib/chat/composerIntent";
import { TOOL_STEP_LIMIT_INFO, clampMaxToolRounds } from "@/lib/ai/agent/tools/server";
import { computeContextBreakdown, estimateRequestContextTokens } from "@/lib/ai/agent/contextBreakdown";
import { generateFallbackFollowUps } from "@/lib/ai/agent/followUps";
import { formatRequestError, parseChatRequest, RequestTooLargeError, type ChatRequest } from "@/lib/ai/agent/requestSchema";
import { awaitUsage, resolveActualBillingModelId, runWithLedgerContext, settleChatUsage } from "@/lib/billing/usageLedger";
import { assertQuotaAvailable, quotaRejectedJson, resolveQuotaUserId } from "@/lib/billing/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";
import { runWithCapabilityEndpoints } from "@/lib/ai/capabilityContext";
import { capabilitySecretValues } from "@/lib/ai/capabilityEndpoints";
import { carryNotice, summarizeCarry } from "@/lib/project/catalog";
import { shouldAutoEnableSearch } from "@/lib/ai/search/autoEnable";
import { kitSoloAccess } from "@/lib/plugins/kitsolo-oauth-client";
import { requestToken } from "@/lib/auth/sign-in/account-verify";
import { connectorOwner } from "@/lib/connectors/actor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Writer = UIMessageStreamWriter<ChatMessage>;

/** 把一段纯文本作为 assistant 正文写入流（用于「未配置」等友好提示，而非 error）。 */
function writeTextPart(writer: Writer, text: string) {
  const id = `txt_${Date.now()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

function lastUserText(messages: ChatRequest["messages"]): string {
  const last = [...messages].reverse().find((m) => m.role === "user") ?? messages[messages.length - 1];
  if (!last) return "";
  return last.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ");
}

function hasFileParts(messages: ChatRequest["messages"]): boolean {
  return messages.some((m) => m.parts.some((p) => p.type === "file"));
}

/** UIMessage → ModelMessage。先压 stub 再按 contextKey 回灌页/节/技能。 */
async function toModelMessages(
  messages: ChatRequest["messages"],
  ctx: { skills: ChatRequest["skills"]; artifacts: ChatRequest["artifacts"]; academicYear: ChatRequest["academicYear"] },
): Promise<ModelMessage[]> {
  const uiMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m, i) => ({
      id: m.id ?? `m_${i}`,
      role: m.role,
      parts: rehydrateStudyParts(
        compactStudyParts(
          m.parts.filter((p) => {
            const type = p.type;
            return type === "text" || type === "file" || type === "reasoning"
              || (typeof type === "string" && type.startsWith("tool-"));
          }) as ChatMessage["parts"],
          "ui-request",
        ),
        ctx,
      ),
    })) as ChatMessage[];
  return convertToModelMessages(uiMessages, { ignoreIncompleteToolCalls: true });
}

async function handlePOST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = parseChatRequest(await req.json().catch(() => ({})));
  } catch (err) {
    const status = err instanceof RequestTooLargeError ? 413 : 400;
    return new Response(JSON.stringify({ error: formatRequestError(err) }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 模型选择：优先 modelId（新菜单）；兼容旧式 model:'flash'/'pro'。
  const modelId =
    body.modelId ?? (body.model === "pro" ? ENV_MODEL_PRO : body.model === "flash" ? ENV_MODEL_FLASH : undefined);
  const customGroups = body.customApiGroups;
  const effectiveCustom = customGroups.length > 0 ? customGroups : body.customProvider;
  const secrets = [
    body.customProvider?.apiKey,
    ...customGroups.map((group) => group.apiKey),
    ...capabilitySecretValues(body.capabilityEndpoints),
  ].filter((value): value is string => !!value);
  const formatError = (error: unknown) => toChatErrorMessage(error, secrets);
  const generationAbort = new AbortController();
  const generationSignal = AbortSignal.any([req.signal, generationAbort.signal]);
  const requestId = crypto.randomUUID();
  const userId = await resolveQuotaUserId(req.headers);
  // 设置页「单轮预算上限」：积分 → 元，只收紧运营上限（见 paidContext.effectiveRequestCapCny）。
  const paid = optionalPaidContext();
  if (paid && body.turnBudgetCredits && body.turnBudgetCredits > 0) {
    const creditsPerCny = Number(process.env.ECOSYSTEM_CREDITS_PER_CNY || "1");
    if (Number.isFinite(creditsPerCny) && creditsPerCny > 0) paid.budgetCny = body.turnBudgetCredits / creditsPerCny;
  }

  // 生图模式：用户选择了生图模型时，文本对话使用 imageModeTextModel（失败降级到 fallback）。
  const selectedModelInfo = modelId ? getModelInfoWithCustom(modelId, customGroups) : undefined;
  const isImageMode = selectedModelInfo?.type === "image";
  let effectiveModelId = isImageMode ? body.imageModeTextModel : modelId;
  let automaticModels: string[] | undefined;
  let previewProvider;
  try {
    if (effectiveModelId === AUTO_MODEL_ID) {
      // 规则优先、快速模型兜底：带图 / 开思考 / 长文 / 硬任务（做题出题讲解检索…）由规则直接定，
      // 短而含糊的问题才多花一次 ~1.2s 的分类调用（七牛云 doubao，关思考 + temperature 0）。
      const decision = await decideAutomaticModels({
        hasImages: hasFileParts(body.messages),
        estimatedTokens: estimateTokens(JSON.stringify(body.messages)) + estimateTokens(body.globalContext) + 16_000,
        text: lastUserText(body.messages), thinking: body.enableThinking,
      });
      automaticModels = decision.models;
      if (!automaticModels.length) return Response.json({ error: '当前没有能处理此请求的自动模型，请稍后重试或手动选择模型。' }, { status: 503 });
      effectiveModelId = automaticModels[0];
      // 内部诊断：只进服务端日志，用户界面回显的仍是 "auto"。
      console.info("[auto-route]", decision.source, decision.note, "->", effectiveModelId);
    }
    previewProvider = resolveProvider(effectiveModelId, effectiveCustom);
  } catch (error) {
    return Response.json({ error: formatError(error) }, { status: 400 });
  }
  const mainOnPlatformCredentials = usedPlatformCredentialsForProvider(previewProvider);
  const mainPool = resolveMainModelPool(mainOnPlatformCredentials);
  const gate = await assertQuotaAvailable({ userId, pool: mainPool });
  if (!gate.ok) return quotaRejectedJson(gate);

  // 服务端兜底：老客户端没做"需要搜索就联网"的判定时，这里补上（并告知用户）。
  const autoSearch = !body.enableSearch && shouldAutoEnableSearch(lastUserText(body.messages));
  const options: ChatOptions = {
    enableThinking: body.enableThinking,
    enableSearch: body.enableSearch || autoSearch,
    thinkingEffort: body.thinkingEffort,
    contextMode: body.contextMode,
  };
  const chatCtx: ChatContext & { academicYear: ChatRequest["academicYear"] } = {
    subjectId: body.subjectId,
    categoryId: body.categoryId,
    itemId: body.itemId,
    currentTopic: body.currentTopic,
    academicYear: body.academicYear,
  };

  const stream = createUIMessageStream<ChatMessage>({
    onError: formatError,
    execute: async ({ writer }) => runWithCapabilityEndpoints(body.capabilityEndpoints, () => runWithLedgerContext({
      userId,
      sessionId: body.id ?? null,
      requestId,
      route: "/api/chat",
      customGroups,
      mainUsedPlatformCredentials: mainOnPlatformCredentials,
    }, async () => {
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
      const bundleInput = (truncated: boolean, referenceContext: string): StudyAgentInput => ({
        connectorOwner: canonicalConnectorOwner,
        kitSoloAccessToken: kitSoloAccessToken ?? undefined,
        model: resolved.model,
        chatCtx,
        options,
        disabledTools: body.disabledTools,
        skills: body.skills,
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
      const compacted = await compactHistory({
        messages: prunedHistory,
        shouldCompact: contextTruncated,
        sessionId: body.id,
        abortSignal: generationSignal,
        modelId: provider.registryId,
        useSelectedModel: !!automaticModels,
        isCustom: provider.isCustom,
        custom: effectiveCustom,
      });
      const historyMessages = compacted.messages;
      const startedAt = Date.now();
      const result = await bundle.agent.stream({
        messages: historyMessages,
        abortSignal: generationSignal,
      });

      // 手动转发而非 writer.merge：保证 usage / breakdown / followup 等 data part 与 finish 严格排在正文之后。
      let streamFailed = false;
      try {
        for await (const chunk of result.toUIMessageStream<ChatMessage>({
          sendReasoning: true, sendStart: true, sendFinish: false, onError: formatError,
        })) {
          writer.write(chunk);
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
          disabled: isImageMode || body.planMode === true,
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
      if (!aborted) writer.write({ type: 'data-answer-complete', data: { durationMs: Date.now() - startedAt } });
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
    })),
  });

  return withSseHeartbeat(
    createUIMessageStreamResponse({
      stream,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }),
    // 首 chunk 之后的静默期（深度思考 / 长工具链）同样保活：客户端 stall watchdog 靠这些
    // 注释续期，否则 60s 无字节活动会把一个还活着的请求直接 abort 掉。
    { keepaliveWhileIdle: true },
  );
}

export const POST = withPaidRequest(handlePOST, "/api/chat");
