import { createHash } from 'node:crypto';
import { createServiceAuthClient } from '@/lib/auth/server/serviceClient';
import { FileError } from '@/lib/files/owner.server';
import { ASSET_BODY_BUCKET, BODY_CHUNK_BYTES, hasExternalBody, putBodyField } from './body';
export async function verifyBodyChunk(owner: string, sha: string): Promise<Uint8Array> {
    const db = createServiceAuthClient();
    const row = await db.from('ss_sync_body_chunks').select('object_key,size_bytes').eq('user_id', owner).eq('sha256', sha).single();
    if (row.error || !row.data)
        throw new FileError('正文块不存在或无权读取。', 404);
    const object = await db.storage.from(ASSET_BODY_BUCKET).download(row.data.object_key);
    if (object.error || !object.data)
        throw new FileError('正文仍未上传完成，原内容保留。', 409);
    if (object.data.size > BODY_CHUNK_BYTES || object.data.size !== Number(row.data.size_bytes))
        throw new FileError('正文大小校验失败。', 409);
    const bytes = new Uint8Array(await object.data.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== sha)
        throw new FileError('正文校验失败。', 409);
    return bytes;
}
export async function hydrateAssetPayload(owner: string, source: unknown): Promise<unknown> {
    if (!hasExternalBody(source))
        return source;
    if (source.bodyStorage.fields.reduce((total, f) => total + f.bytes, 0) > 64 * 1024 * 1024)
        throw new FileError('全文较大，请按章节或区间读取，或下载完整原稿。', 413);
    const payload = structuredClone(source);
    for (const field of source.bodyStorage.fields) {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const parts: string[] = [];
        let total = 0;
        for (const sha of field.chunks) {
            const bytes = await verifyBodyChunk(owner, sha);
            total += bytes.length;
            parts.push(decoder.decode(bytes, { stream: true }));
        }
        parts.push(decoder.decode());
        if (total !== field.bytes)
            throw new FileError('正文清单不完整。', 409);
        const text = parts.join('');
        putBodyField(payload, field.path, field.format === 'json' ? JSON.parse(text || '[]') : text);
    }
    delete (payload as Record<string, unknown>).bodyStorage;
    return payload;
}
export async function readBodyField(owner: string, source: unknown, index = 0, offset = 0, limit = 12000) {
    if (!hasExternalBody(source))
        return null;
    const field = source.bodyStorage.fields[index];
    if (!field)
        throw new FileError('正文区间不存在。', 400);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 12000)
        throw new FileError('正文区间无效。', 400);
    const decoder = new TextDecoder();
    let scanned = 0, text = '';
    for (const sha of field.chunks) {
        const part = decoder.decode(await verifyBodyChunk(owner, sha), { stream: true });
        if (scanned + part.length > offset && text.length < limit) {
            const start = Math.max(0, offset - scanned);
            text += part.slice(start, start + limit - text.length);
        }
        scanned += part.length;
        if (text.length >= limit)
            break;
    }
    if (text.length < limit)
        text += decoder.decode();
    return { text, nextOffset: text.length === limit ? offset + text.length : null };
}
