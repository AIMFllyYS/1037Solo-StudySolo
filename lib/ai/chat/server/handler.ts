import { withPaidRequest } from "@/lib/billing/settlement/paidRequest";
import { optionalPaidContext } from "@/lib/billing/settlement/paidContext";
import type { NextRequest } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import type { ChatContext, ChatMessage, ChatOptions } from "@/lib/types/chat";
import { ENV_MODEL_PRO, ENV_MODEL_FLASH, resolveProvider } from "@/lib/ai/provider";
import { AUTO_MODEL_ID, getModelInfoWithCustom } from "@/lib/ai/models";
import { decideAutomaticModels } from "@/lib/ai/autoRoute";
import { estimateTokens } from "@/lib/context/estimateTokens";

import { withSseHeartbeat } from "@/lib/ai/sdk/heartbeat";
import { toChatErrorMessage } from "@/lib/ai/sdk/errorMessage";

import { clampMaxToolRounds } from "@/lib/ai/agent/tools/server";

import { formatRequestError, parseChatRequest, RequestTooLargeError, type ChatRequest } from "@/lib/ai/agent/requestSchema";
import { runWithLedgerContext } from "@/lib/billing/ledger/usageLedger";
import { assertQuotaAvailable, quotaRejectedJson, resolveQuotaUserId } from "@/lib/billing/quota/quotaGate";
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from "@/lib/billing/usagePool";
import { runWithCapabilityEndpoints } from "@/lib/ai/endpoints/capabilityContext";
import { capabilitySecretValues } from "@/lib/ai/endpoints/capabilityEndpoints";

import { shouldAutoEnableSearch } from "@/lib/ai/search/autoEnable";

import { resolveCloudFileParts } from '@/lib/files/model.server';
import { referencedFileId, referencedFileIdsInText } from '@/lib/files/contract';
import { fileOwner, FileError } from '@/lib/files/owner.server';
import { claimLocalContinuation } from '@/lib/local-files/continuation.server';

import { lastUserText, hasFileParts } from './messages';
import { runChatGeneration } from './generation';

async function handlePOST(req: NextRequest) {
  let localUsedSteps=0;
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

  if(body.localContinuation){
    try{
      const owner=await fileOwner(req,true),snapshot=await claimLocalContinuation(owner,body.id??'',body.localContinuation,body.messages);
      body.localFiles=snapshot.catalog;
      localUsedSteps=snapshot.usedSteps;
      const remaining=clampMaxToolRounds(body.maxToolRounds)-snapshot.usedSteps;
      if(remaining<1)return Response.json({error:'本轮工具调用已达上限，原结果已保留。'},{status:409});
      body.maxToolRounds=remaining;
    }catch(error){return Response.json({error:error instanceof FileError?error.message:'本地工具续接暂不可用。'},{status:error instanceof FileError?error.status:503});}
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
  const hasCloudFiles = body.messages.some(message => message.parts.some(part => part.type === 'file' && referencedFileId(part.url) || part.type === 'text' && referencedFileIdsInText(String(part.text)).length > 0)) || body.cloudFileIds.length > 0 || body.projectFiles.some(file => file.cloudFileId);
  if (hasCloudFiles) {
    try {
      const owner = await fileOwner(req);
      const latest = [...body.messages].reverse().find(message => message.role === 'user');
      const uploaded = latest?.parts.filter(part => part.type === 'file') ?? [];
      const uploadedCloudIds = new Set(uploaded.map(part => referencedFileId(part.url)));
      const linked = [...new Set(latest?.parts.flatMap(part => part.type === 'text' ? referencedFileIdsInText(String(part.text)) : []) ?? [])];
      if (uploaded.length + linked.filter(id => !uploadedCloudIds.has(id)).length + body.attachedFiles.length > 9) throw new FileError('单次引用和上传的附件总计最多 9 个。');
      const resolvedFiles = await resolveCloudFileParts(body.messages as ChatMessage[], owner, body.cloudFileIds);
      body.messages = resolvedFiles.messages as ChatRequest['messages'];
      body.projectFiles = [...body.projectFiles, ...resolvedFiles.catalog.map(file => ({ ...file, cloudFileId: file.cloudFileId }))];
    } catch (error) { return Response.json({ error: error instanceof FileError ? error.message : '云端附件暂不可用，原对话已保留；请到我的资产查看文件状态。' }, { status: error instanceof FileError ? error.status : 503 }); }
  }
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
      return runChatGeneration({ req, body, writer, modelId, effectiveModelId, effectiveCustom, customGroups, automaticModels, isImageMode, secrets, formatError, generationAbort, generationSignal, userId, requestId, autoSearch, options, chatCtx, localUsedSteps });
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
