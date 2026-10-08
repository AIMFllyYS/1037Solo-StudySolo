import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { resolveServiceAuthEnv } from '@/lib/auth/env';
import { FileError } from '@/lib/files/owner.server';
import { optionalPaidContext } from '@/lib/billing/paidContext';
import { localCatalogSchema, localReadInputSchema, localReadOutputSchema, type LocalSourceCatalog } from './contract';
const signature = (value: string) => createHmac('sha256', resolveServiceAuthEnv().serviceRoleKey).update('studysolo-local-tool:' + value).digest('base64url');
interface PendingCall {
    toolCallId: string;
    input: unknown;
}
export async function issueLocalContinuation(owner: string, session: string, catalog: LocalSourceCatalog, calls: PendingCall[], usedSteps: number): Promise<string> {
    const nonce = randomUUID(), paid = optionalPaidContext();
    const snapshot = { catalog, calls, usedSteps, budgetSpent: paid?.reservedCny ?? 0, sequence: paid?.sequence ?? 0, requestId: paid?.requestId };
    const result = await createServiceAuthClient().from('ss_local_tool_turns').insert({ user_id: owner, id: nonce, session_id: session, snapshot, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
    if (result.error)
        throw new FileError('本地工具续接暂不可用，原对话保留。', 503);
    const token = Buffer.from(JSON.stringify({ owner, session, nonce })).toString('base64url');
    return token + '.' + signature(token);
}
export async function claimLocalContinuation(owner: string, session: string, token: string, messages: {
    parts: Record<string, unknown>[];
    role: string;
}[]) {
    const [value, sig] = token.split('.');
    if (!value || !sig)
        throw new FileError('工具续接标识无效。', 400);
    const expected = Buffer.from(signature(value)), actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new FileError('工具续接标识无效。', 403);
    const identity = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (identity.owner !== owner || identity.session !== session)
        throw new FileError('工具续接归属不正确。', 403);
    const db = createServiceAuthClient(), record = await db.from('ss_local_tool_turns').select('snapshot,state,expires_at').eq('user_id', owner).eq('id', identity.nonce).single();
    if (record.error || record.data.state !== 'pending' || Date.parse(record.data.expires_at) <= Date.now())
        throw new FileError('这次工具续接已提交或过期，请查看原结果。', 409);
    const snapshot = record.data.snapshot as {
        catalog: LocalSourceCatalog;
        calls: PendingCall[];
        usedSteps: number;
        budgetSpent: number;
        sequence: number;
        requestId: string;
    };
    localCatalogSchema.parse(snapshot.catalog);
    const parts = messages.filter(m => m.role === 'assistant').flatMap(m => m.parts);
    for (const call of snapshot.calls) {
        const input = localReadInputSchema.parse(call.input), source = snapshot.catalog.find(s => s.sourceId === input.sourceId);
        const part = parts.find(p => p.type === 'tool-readLocalFile' && p.toolCallId === call.toolCallId && p.state === 'output-available');
        const output = part?.output as {
            text?: unknown;
            sourceId?: unknown;
            sourceVersion?: unknown;
        } | undefined;
        if (!localReadOutputSchema.safeParse(output).success)
            throw new FileError('本地工具结果格式无效。', 400);
        if (!source || !output || output.sourceId !== source.sourceId || output.sourceVersion !== source.version || typeof output.text !== 'string' || output.text.length > 12000)
            throw new FileError('本地工具结果不完整或源版本已变化，请重新读取。', 409);
    }
    const claimed = await db.from('ss_local_tool_turns').update({ state: 'claimed' }).eq('user_id', owner).eq('id', identity.nonce).eq('state', 'pending').select('id');
    if (claimed.error || claimed.data.length !== 1)
        throw new FileError('这次工具结果已提交，不会重复调用模型。', 409);
    const paid = optionalPaidContext();
    if (paid) {
        paid.reservedCny = snapshot.budgetSpent;
        paid.sequence = snapshot.sequence;
        paid.requestId = snapshot.requestId;
    }
    return snapshot;
}
