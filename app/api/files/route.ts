import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { boundedText } from '@/lib/http/boundedBody';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { FILE_BUCKET, FILE_QUOTA_MESSAGE, MAX_FILE_BYTES } from '@/lib/files/contract';
import { FileError, fileFailure, fileOwner } from '@/lib/files/owner.server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ name: z.string().min(1).max(300), mimeType: z.string().max(150), size: z.number().int().min(1).max(MAX_FILE_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/), processedSize: z.number().int().min(1).max(32 * 1024 * 1024), processedSha256: z.string().regex(/^[a-f0-9]{64}$/), projectId: z.string().max(200).optional() });
export async function GET(request: NextRequest) {
  try {
    const owner = await fileOwner(request);
    let query = createServiceAuthClient().from('ss_user_files').select('id,name,mime_type,size_bytes,project_id,state,created_at,deleted_at').eq('user_id', owner).order('id');
    const project = request.nextUrl.searchParams.get('projectId');
    if (project) query = query.eq('project_id', project);
    const cursor = request.nextUrl.searchParams.get('cursor');
    if (cursor) { if (!z.string().uuid().safeParse(cursor).success) throw new FileError('文件分页游标不正确。'); query = query.gt('id', cursor); }
    const result = await query.limit(250);
    if (result.error) throw new FileError('云端文件列表暂不可用。', 503);
    const overview = cursor ? null : await createServiceAuthClient().rpc('account_membership_overview', { p_user_id: owner });
    return Response.json({ files: result.data, nextCursor: result.data.length === 250 ? result.data.at(-1)?.id : null, storage: !overview || overview.error || !overview.data?.storage || !overview.data?.entitlements ? null : { ...overview.data.storage, capacity_bytes: overview.data.entitlements.storage_bytes } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return fileFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const owner = await fileOwner(request, true);
    const parsed = schema.safeParse(JSON.parse(await boundedText(request, 16 * 1024)));
    if (!parsed.success) throw new FileError('附件格式不正确，每个文件（含照片）最多 25MB。');
    const input = parsed.data;
    const id = crypto.randomUUID(), key = `${owner}/${id}/original`, processedKey = `${owner}/${id}/context.json`;
    const db = createServiceAuthClient();
    const bucket = await db.storage.getBucket(FILE_BUCKET);
    if (bucket.error || bucket.data?.public !== false) throw new FileError('私有云文件存储尚未就绪。', 503);
    const prepared = await db.rpc('ss_file_prepare', { p_user_id: owner, p_file_id: id, p_name: input.name, p_mime: input.mimeType, p_size: input.size, p_sha256: input.sha256, p_processed_size: input.processedSize, p_processed_sha256: input.processedSha256, p_project_id: input.projectId ?? null });
    if (prepared.error) throw new FileError(/storage_quota_exceeded/.test(prepared.error.message) ? FILE_QUOTA_MESSAGE : '云端文件额度预留失败，请稍后重试。', /storage_quota_exceeded/.test(prepared.error.message) ? 413 : 503);
    const upload = await db.storage.from(FILE_BUCKET).createSignedUploadUrl(key, { upsert: false });
    const derived = await db.storage.from(FILE_BUCKET).createSignedUploadUrl(processedKey, { upsert: false });
    if (upload.error || derived.error || !upload.data || !derived.data) {
      await db.rpc('ss_file_transition', { p_user_id: owner, p_file_id: id, p_action: 'delete' });
      throw new FileError('文件上传授权失败，请重试。', 503);
    }
    return Response.json({ id, uploadUrl: upload.data.signedUrl, processedUploadUrl: derived.data.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return fileFailure(error); }
}
