import { z } from 'zod';
export const ASSET_BODY_BUCKET = 'ss-asset-bodies';
export const BODY_CHUNK_BYTES = 8 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const bodyManifestSchema = z.object({ v: z.literal(1), fields: z.array(z.object({ path: z.array(z.union([z.string().min(1).max(100), z.number().int().min(0)])).min(1).max(8), format: z.enum(['text', 'json']), bytes: z.number().int().nonnegative(), chunks: z.array(hash).max(4096) })).max(4096) });
export type BodyManifest = z.infer<typeof bodyManifestSchema>;
export function hasExternalBody(payload: unknown): payload is Record<string, unknown> & {
    bodyStorage: BodyManifest;
} {
    return !!payload && typeof payload === 'object' && bodyManifestSchema.safeParse((payload as Record<string, unknown>).bodyStorage).success;
}
export function putBodyField(payload: Record<string, unknown>, path: (string | number)[], value: unknown): void {
    let target: Record<string | number, unknown> = payload;
    for (const key of path.slice(0, -1)) {
        if (['__proto__', 'constructor', 'prototype'].includes(String(key)) || !target[key] || typeof target[key] !== 'object')
            throw new Error('INVALID_BODY_PATH');
        target = target[key] as Record<string | number, unknown>;
    }
    const key = path.at(-1)!;
    if (['__proto__', 'constructor', 'prototype'].includes(String(key)))
        throw new Error('INVALID_BODY_PATH');
    target[key] = value;
}
export async function externalizePayload(kind: string, source: unknown) {
    const payload = structuredClone(source) as Record<string, unknown>;
    const fields: BodyManifest['fields'] = [];
    const chunks = new Map<string, Uint8Array>();
    const add = async (path: (string | number)[], value: unknown, format: 'text' | 'json' = 'text') => {
        if (value === undefined)
            return;
        const bytes = new TextEncoder().encode(format === 'json' ? JSON.stringify(value) : String(value));
        const hashes: string[] = [];
        for (let offset = 0; offset < bytes.length; offset += BODY_CHUNK_BYTES) {
            const part = bytes.slice(offset, offset + BODY_CHUNK_BYTES);
            const digest = await crypto.subtle.digest('SHA-256', part);
            const sha = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
            chunks.set(sha, part);
            hashes.push(sha);
        }
        fields.push({ path, format, bytes: bytes.length, chunks: hashes });
        putBodyField(payload, path, format === 'json' ? [] : '');
    };
    if (kind === 'artifact')
        await add(['html'], payload.html);
    if (kind === 'user-note')
        await add(['markdown'], payload.markdown);
    if (kind === 'chat-session')
        await add(['messages'], payload.messages, 'json');
    if (kind === 'image-gen')
        await add(['images'], payload.images, 'json');
    if (kind === 'document')
        for (let i = 0; i < ((payload.sections as unknown[]) ?? []).length; i++)
            await add(['sections', i, 'markdown'], (payload.sections as {
                markdown?: string;
            }[])[i].markdown);
    if (kind === 'review-card')
        for (const key of ['front', 'back', 'originalText'])
            await add([key], payload[key]);
    if (fields.length)
        payload.bodyStorage = { v: 1, fields } satisfies BodyManifest;
    return { payload, chunks };
}
