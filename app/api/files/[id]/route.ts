import type { NextRequest } from 'next/server';
import { createServiceAuthClient } from '@/lib/auth/server/serviceClient';
import { boundedText } from '@/lib/http/boundedBody';
import { FILE_BUCKET } from '@/lib/files/contract';
import { FileError, fileOwner, fileFailure } from '@/lib/files/owner.server';
import { completeFile, fileTransition, ownedFile, loadProcessedFile } from '@/lib/files/service.server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const owner = await fileOwner(request), { id } = await context.params;
    if (request.nextUrl.searchParams.get('context') === '1') return Response.json({ processed: await loadProcessedFile(owner, id) }, { headers: { 'Cache-Control': 'private, no-store' } });
    const row = await ownedFile(owner, id);
    if (row.state !== 'ready') throw new FileError('文件尚未完成上传。', 409);
    const result = await createServiceAuthClient().storage.from(FILE_BUCKET).download(row.object_key);
    if (result.error || !result.data) throw new FileError('文件下载暂不可用。', 503);
    return new Response(result.data, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return fileFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try { return Response.json({ file: await completeFile(await fileOwner(request, true), (await context.params).id) }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return fileFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const owner = await fileOwner(request, true);
    const body = JSON.parse(await boundedText(request, 1024));
    if (body.confirmed !== true) throw new FileError('请再次确认删除此文件。', 409);
    await fileTransition(owner, (await context.params).id, 'delete');
    return Response.json({ deleted: true, softDeleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return fileFailure(error); }
}
