import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withPaidRequest } from '@/lib/billing/paidRequest';
import { compactHistory } from '@/lib/context/compactHistory';
import { boundedText } from '@/lib/http/boundedBody';
import { customApiGroupSchema } from '@/lib/ai/agent/requestSchema';
import { fileOwner, fileFailure } from '@/lib/files/owner.server';
import { runWithLedgerContext } from '@/lib/billing/usageLedger';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ sessionId: z.string().max(200), modelId: z.string().max(200).optional(), customApiGroups: z.array(customApiGroupSchema).max(32).optional(), messages: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().max(1024 * 1024) })).max(10000) });
async function handle(request: NextRequest) {
  try {
    const owner = await fileOwner(request, true);
    const parsed = schema.safeParse(JSON.parse(await boundedText(request, 16 * 1024 * 1024)));
    if (!parsed.success) return Response.json({ error: '压缩数据过大或格式不正确，原对话未修改。' }, { status: 400 });
    const input = parsed.data;
    const result = await runWithLedgerContext({ userId: owner, sessionId: input.sessionId, route: '/api/context/compact', customGroups: input.customApiGroups }, () => compactHistory({ route: '/api/context/compact', messages: input.messages, shouldCompact: true, keepTurns: 0, sessionId: `${owner}:${input.sessionId}`, abortSignal: request.signal, modelId: input.modelId, useSelectedModel: Boolean(input.modelId && input.modelId !== 'auto'), isCustom: Boolean(input.customApiGroups?.length), custom: input.customApiGroups }));
    if (!result.compacted || !result.summary) return Response.json({ error: '没有可压缩的历史，原对话未修改。' }, { status: 409 });
    return Response.json({ summary: result.summary }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return fileFailure(error); }
}
export const POST = withPaidRequest(handle, '/api/context/compact');
