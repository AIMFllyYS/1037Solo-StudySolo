import type { NextRequest } from 'next/server';
import { fileOwner, fileFailure, FileError } from '@/lib/files/owner.server';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { boundedText } from '@/lib/http/boundedBody';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
    try {
        const owner = await fileOwner(request), cursor = request.nextUrl.searchParams.get('cursor'), trash = request.nextUrl.searchParams.get('trash') === '1';
        if (request.nextUrl.searchParams.get('usage') === '1') {
            const result = await createServiceAuthClient().rpc('account_membership_overview', { p_user_id: owner });
            if (result.error || !result.data?.storage || !result.data?.entitlements)
                throw new FileError('个人额度暂不可读取，保存时仍由中央账本核验。', 503);
            return Response.json({ storage: { ...result.data.storage, capacity_bytes: result.data.entitlements.storage_bytes } }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (request.nextUrl.searchParams.get('pending') === '1') {
            const result = await createServiceAuthClient().from('ss_sync_writes').select('mutation_id,kind,client_id,created_at,payload').eq('user_id', owner).eq('state', 'pending').order('created_at', { ascending: false }).limit(100);
            if (result.error)
                throw new FileError('上传记录暂不可用。', 503);
            return Response.json({ uploads: result.data.map(row => ({ id: row.mutation_id, kind: row.kind, clientId: row.client_id, title: row.payload.title ?? row.payload.spec?.title ?? row.client_id, createdAt: row.created_at })) }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (cursor && !/^[a-f0-9-]{36}$/i.test(cursor))
            throw new FileError('资产分页游标无效。', 400);
        let query = createServiceAuthClient().from('asset_index').select('id,source_type,source_id,title,media_type,source_path,metadata,archived_at,updated_at').eq('user_id', owner).eq('project_id', 'studysolo').order('id').limit(100);
        query = trash ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
        if (cursor)
            query = query.gt('id', cursor);
        const result = await query;
        if (result.error)
            throw new FileError('资产目录暂不可用，本机内容保留。', 503);
        return Response.json({ assets: result.data, nextCursor: result.data.length === 100 ? result.data.at(-1)?.id : null }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return fileFailure(error);
    }
}
export async function POST(request: NextRequest) {
    try {
        const owner = await fileOwner(request, true), input = JSON.parse(await boundedText(request, 16384));
        if (input.confirmed !== true || !['delete', 'restore', 'cancel'].includes(input.operation))
            throw new FileError('请先确认资产操作。', 400);
        if (input.operation === 'cancel') {
            const result = await createServiceAuthClient().rpc('ss_sync_cancel', { p_owner: owner, p_mutation: input.assetId });
            if (result.error)
                throw new FileError('取消未完成上传失败，已保存内容不会删除。', 409);
            return Response.json({ ok: true });
        }
        const db = createServiceAuthClient(), asset = await db.from('asset_index').select('source_type,source_id').eq('user_id', owner).eq('id', input.assetId).single();
        if (asset.error)
            throw new FileError('资产不存在或无权操作。', 404);
        let result;
        if (asset.data.source_type === 'sync-document') {
            const row = await db.from('ss_sync_documents').select('kind,client_id,revision').eq('id', asset.data.source_id).eq('user_id', owner).single();
            if (row.error)
                throw new FileError('资产源记录不存在。', 404);
            if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new FileError('请刷新资产版本后重新确认操作，原内容保留。', 409);
            result = await db.rpc('ss_sync_archive', { p_owner: owner, p_kind: row.data.kind, p_client_id: row.data.client_id, p_expected: input.expectedRevision, p_restore: input.operation === 'restore' });
        }
        else if (asset.data.source_type === 'cloud-file')
            result = await db.rpc(input.operation === 'restore' ? 'ss_file_restore' : 'ss_file_transition', { p_user_id: owner, p_file_id: asset.data.source_id, ...(input.operation === 'delete' ? { p_action: 'delete' } : {}) });
        else if (asset.data.source_type === 'class-session') {
            const row = await db.from('ss_class_sessions').select('cloud_revision').eq('id', asset.data.source_id).eq('user_id', owner).single();
            if (row.error)
                throw new FileError('课堂资产不存在。', 404);
            if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new FileError('请刷新课堂版本后重新确认操作，原内容保留。', 409);
            result = await db.rpc('ss_class_archive', { p_owner: owner, p_session: asset.data.source_id, p_expected: input.expectedRevision, p_restore: input.operation === 'restore' });
        }
        else
            throw new FileError('请在对应板块管理这类资产。', 400);
        if (result.error)
            throw new FileError(/storage_quota_exceeded/.test(result.error.message) ? '个人空间不足，资产仍在回收站。' : '资产操作未完成，原内容保留。', 409);
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return fileFailure(error);
    }
}
