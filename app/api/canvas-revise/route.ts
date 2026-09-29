import { withPaidRequest } from "@/lib/billing/paidRequest";
import type { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { getModelInfoWithCustom } from '@/lib/ai/models';
import { resolveLanguageModel } from '@/lib/ai/sdk/languageModel';
import { toChatErrorMessage } from '@/lib/ai/sdk/errorMessage';
import { collectRequestSecrets, formatRequestError, parseCanvasReviseRequest } from '@/lib/ai/agent/requestSchema';
import { logSatelliteError } from '@/lib/ai/observability/agentLog';
import { buildCanvasRevisionMessages } from '@/lib/canvas/revisionPrompt';
import { diagnoseCanvasBlock, extractCanvasRevisionBlock } from '@/lib/canvas/revisionOutput';
import type { CanvasBlock } from '@/lib/canvas/types';
import { resolveActualBillingModelId, settleUsage } from '@/lib/billing/usageLedger';
import { assertQuotaAvailable, quotaRejectedJson, resolveQuotaUserId } from '@/lib/billing/quotaGate';
import { resolveMainModelPool, usedPlatformCredentialsForProvider } from '@/lib/billing/usagePool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasUsableBlock(value: unknown): value is CanvasBlock {
  return isRecord(value) && typeof value.kind === 'string';
}

async function handlePOST(req: NextRequest) {
  let body: ReturnType<typeof parseCanvasReviseRequest>;
  try {
    body = parseCanvasReviseRequest(await req.json().catch(() => ({})));
  } catch (err) {
    return Response.json({ error: formatRequestError(err) }, { status: 400 });
  }
  const modelId = typeof body.modelId === 'string' ? body.modelId : '';
  const customApiGroups = body.customApiGroups;
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const topic = typeof body.topic === 'string' ? body.topic : undefined;
  const secrets = collectRequestSecrets({ customApiGroups });

  if (!modelId) {
    return Response.json({ error: 'Missing model configuration for canvas revision.' }, { status: 400 });
  }
  if (!hasUsableBlock(body.block)) {
    return Response.json({ error: 'Missing current canvas block.' }, { status: 400 });
  }
  if (!instruction) {
    return Response.json({ error: 'Missing canvas revision instruction.' }, { status: 400 });
  }

  const modelInfo = getModelInfoWithCustom(modelId, customApiGroups);
  if (!modelInfo) {
    return Response.json({ error: `Model ${modelId} is not configured.` }, { status: 400 });
  }
  if (modelInfo.type === 'image') {
    return Response.json({ error: 'The selected model is an image model. Choose a text chat model for canvas revision.' }, { status: 400 });
  }

  const { model, provider } = resolveLanguageModel(modelId, customApiGroups);
  if (provider.apiKey) secrets.push(provider.apiKey);
  if (!provider.configured) {
    return Response.json({ error: 'The selected model API is not configured.' }, { status: 400 });
  }

  const userId = await resolveQuotaUserId(req.headers);
  const pool = resolveMainModelPool(usedPlatformCredentialsForProvider(provider));
  const gate = await assertQuotaAvailable({ userId, pool });
  if (!gate.ok) return quotaRejectedJson(gate);

  let output: string;
  try {
    const result = await generateText({
      model,
      messages: buildCanvasRevisionMessages({
        block: body.block,
        instruction,
        topic,
      }),
      // This shared business prompt returns system+user messages in fixed order.
      allowSystemInMessages: true,
      temperature: 0.2,
      maxOutputTokens: 6000,
      maxRetries: 0,
      abortSignal: req.signal,
      timeout: provider.timeoutMs,
    });
    output = result.text.trim();
    await settleUsage({
      headers: req.headers,
      rawUsage: result.totalUsage ?? result.usage,
      route: '/api/canvas-revise',
      kind: 'llm',
      selectedModelId: modelId,
      actualModelId: resolveActualBillingModelId(provider),
      customGroups: customApiGroups,
      pool: pool ?? undefined,
      skipInsert: pool == null,
      meta: { source: 'canvas-revise' },
    });
  } catch (err) {
    logSatelliteError('/api/canvas-revise', err);
    return Response.json({ error: toChatErrorMessage(err, secrets) }, { status: 502 });
  }

  const extracted = extractCanvasRevisionBlock(output);
  if (!extracted.ok) {
    return Response.json({ error: '画布修订结果无法解析，请换种说法再试。' }, { status: 422 });
  }

  const diagnostics = diagnoseCanvasBlock(extracted.block);
  const failed = diagnostics.find((diagnostic) => !diagnostic.ok);
  if (failed) {
    return Response.json(
      {
        error: failed.message,
        diagnostics,
      },
      { status: 422 },
    );
  }

  return Response.json({ block: extracted.block, diagnostics });
}

export const POST = withPaidRequest(handlePOST, "/api/canvas-revise");
