import type { NextRequest } from 'next/server';
import { fileOwner, fileFailure, FileError } from '@/lib/files/owner.server';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { hydrateAssetPayload, verifyBodyChunk } from '@/lib/assets/body.server';
import { hasExternalBody } from '@/lib/assets/body';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
    try {
        const owner = await fileOwner(request), kind = request.nextUrl.searchParams.get('kind'), id = request.nextUrl.searchParams.get('clientId');
        const db = createServiceAuthClient();
        const result = await db.from('ss_sync_documents').select('payload,deleted,revision').eq('user_id', owner).eq('kind', kind).eq('client_id', id).single();
        if (result.error || result.data.deleted)
            throw new FileError('资产不存在或已移入回收站。', 404);
        const revision = request.nextUrl.searchParams.get('revision');
        if (revision !== null && Number(revision) !== result.data.revision) {
            const older = await db.from('ss_sync_revisions').select('payload,revision').eq('user_id', owner).eq('kind', kind).eq('client_id', id).eq('revision', Number(revision)).single();
            if (older.error)
                throw new FileError('基准版本无法读取，本机修改保留为冲突副本。', 409);
            result.data.payload = older.data.payload;
            result.data.revision = older.data.revision;
        }
        if (request.nextUrl.searchParams.get('download') === '1') {
            const payload = result.data.payload, fields = hasExternalBody(payload) ? payload.bodyStorage.fields : [];
            if (!fields.length)
                return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="asset.json"', 'Cache-Control': 'private, no-store' } });
            let field = 0, chunk = 0;
            const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
                    try {
                        if (field >= fields.length) {
                            controller.close();
                            return;
                        }
                        const next = fields[field];
                        if (chunk === 0 && kind === 'document')
                            controller.enqueue(new TextEncoder().encode(`\n\n## ${payload.sections?.[field]?.title ?? '章节'}\n\n`));
                        if (chunk < next.chunks.length) {
                            controller.enqueue(await verifyBodyChunk(owner, next.chunks[chunk++]));
                        }
                        else {
                            field++;
                            chunk = 0;
                        }
                    }
                    catch (error) {
                        controller.error(error);
                    }
                } });
            return new Response(stream, { headers: { 'Content-Type': kind === 'artifact' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="asset.${kind === 'artifact' ? 'html' : 'md'}"`, 'Cache-Control': 'private, no-store' } });
        }
        const fieldIndex = request.nextUrl.searchParams.get('field');
        if (fieldIndex !== null && hasExternalBody(result.data.payload)) {
            const field = result.data.payload.bodyStorage.fields[Number(fieldIndex)];
            if (!field)
                throw new FileError('正文区间不存在。', 400);
            const offset = Number(request.nextUrl.searchParams.get('offset') || 0), limit = Math.min(12000, Number(request.nextUrl.searchParams.get('limit') || 12000));
            if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1)
                throw new FileError('正文区间无效。', 400);
            const decoder = new TextDecoder();
            let scanned = 0, text = '';
            for (const sha of field.chunks) {
                const part = decoder.decode(await verifyBodyChunk(owner, sha), { stream: true });
                if (scanned + part.length > offset && text.length < limit)
                    text += part.slice(Math.max(0, offset - scanned), Math.max(0, offset - scanned) + limit - text.length);
                scanned += part.length;
                if (text.length >= limit)
                    break;
            }
            return Response.json({ text, nextOffset: text.length === limit ? offset + text.length : null, revision: result.data.revision }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        return Response.json({ payload: await hydrateAssetPayload(owner, result.data.payload), revision: result.data.revision }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return fileFailure(error);
    }
}
