import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { fileOwner, fileFailure, FileError } from '@/lib/files/owner.server';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { boundedText } from '@/lib/http/boundedBody';
import { ASSET_BODY_BUCKET, bodyManifestSchema, hasExternalBody } from '@/lib/assets/body';
import { verifyBodyChunk } from '@/lib/assets/body.server';
import { CLOUD_SYNC_KINDS } from '@/lib/sync/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const prepare = z.object({ operation: z.literal('prepare'), kind: z.enum(CLOUD_SYNC_KINDS), clientId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), mutationId: z.string().uuid(), payload: z.record(z.string(), z.unknown()), chunks: z.array(z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(1).max(8388608) })).max(4096) });
const commit = z.object({ operation: z.literal('commit'), mutationId: z.string().uuid() });
export async function POST(request: NextRequest) {
    try {
        const owner = await fileOwner(request, true), db = createServiceAuthClient();
        const input = z.discriminatedUnion('operation', [prepare, commit]).parse(JSON.parse(await boundedText(request, 512 * 1024)));
        if (input.operation === 'prepare') {
            if (hasExternalBody(input.payload)) {
                const manifest = bodyManifestSchema.parse(input.payload.bodyStorage);
                const requested = new Set(input.chunks.map(c => c.sha256));
                const referenced = new Set(manifest.fields.flatMap(f => f.chunks));
                if (requested.size !== referenced.size || [...referenced].some(sha => !requested.has(sha)))
                    throw new FileError('正文清单不一致。', 400);
            }
            else if (input.chunks.length)
                throw new FileError('缺少正文清单。', 400);
            if (['document', 'artifact', 'image-gen'].includes(input.kind) && input.payload.status !== 'done')
                throw new FileError('生成尚未完成，草稿仅保留本机。', 400);
            if ((input.kind === 'chat-session' ? (input.payload.meta as {
                id?: string;
            })?.id : input.payload.id) !== input.clientId)
                throw new FileError('资产标识不一致。', 400);
            const result = await db.rpc('ss_sync_prepare', { p_owner: owner, p_mutation: input.mutationId, p_kind: input.kind, p_client_id: input.clientId, p_expected: input.expectedRevision, p_payload: input.payload, p_chunks: input.chunks });
            if (result.error)
                return versionFailure(result.error.message);
            const chunks = [];
            for (const item of result.data.chunks as {
                sha256: string;
                state: string;
                objectKey: string;
            }[]) {
                // A released immutable object may already exist. Verify it and reuse;
                // never overwrite a committed object with client-provided bytes.
                try {
                    await verifyBodyChunk(owner, item.sha256);
                    chunks.push({ sha256: item.sha256 });
                    continue;
                }
                catch { /* New or incomplete object */ }
                const signed = await db.storage.from(ASSET_BODY_BUCKET).createSignedUploadUrl(item.objectKey);
                if (signed.error)
                    throw new FileError('正文上传授权暂不可用。', 503);
                chunks.push({ sha256: item.sha256, uploadUrl: signed.data.signedUrl });
            }
            return Response.json({ chunks }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        const prepared = await db.from('ss_sync_writes').select('payload,state').eq('user_id', owner).eq('mutation_id', input.mutationId).single();
        if (prepared.error)
            throw new FileError('未找到这次上传。', 404);
        if (hasExternalBody(prepared.data.payload))
            for (const sha of new Set(prepared.data.payload.bodyStorage.fields.flatMap(f => f.chunks)))
                await verifyBodyChunk(owner, sha);
        const result = await db.rpc('ss_sync_commit', { p_owner: owner, p_mutation: input.mutationId });
        if (result.error)
            return versionFailure(result.error.message);
        return Response.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        if (error instanceof z.ZodError)
            return Response.json({ error: '资产数据格式不正确。', code: 'INVALID_CONTENT' }, { status: 400 });
        return fileFailure(error);
    }
}
function versionFailure(message: string) {
    if (/invalid_sync_payload|invalid_body_chunk|body_hash_size_conflict/.test(message))
        return Response.json({ error: '资产正文或清单格式无效，原内容保留。', code: 'INVALID_CONTENT' }, { status: 400 });
    const quota = /storage_quota_exceeded/.test(message), conflict = /revision_conflict|mutation_conflict/.test(message);
    return Response.json({ error: quota ? '个人云端空间不足，请到我的资产清理；本机内容保留。' : conflict ? '云端版本已变化，本机修改保留。' : '资产保存暂不可用，原内容保留。', code: quota ? 'QUOTA_EXCEEDED' : conflict ? 'REVISION_CONFLICT' : 'ASSET_UNAVAILABLE' }, { status: quota ? 413 : conflict ? 409 : 503 });
}
