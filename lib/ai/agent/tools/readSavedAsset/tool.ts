import { tool } from 'ai';
import { z } from 'zod';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { readBodyField, hydrateAssetPayload } from '@/lib/assets/body.server';
export function createReadSavedAssetTool(owner?: string) {
    return tool({ description: '查找或按区间读取当前账号已保存的笔记、长文、HTML、图片与题集。list返回资产目录及稳定来源；read使用kind和id，field选择章节或图片，offset继续读取。图片返回缩略图；仅返回相关片段，原稿仍保存在私有云端。', inputSchema: z.object({ operation: z.enum(['list', 'read']), kind: z.enum(['artifact', 'document', 'user-note', 'review-card', 'image-gen']).optional(), id: z.string().max(200).optional(), field: z.number().int().nonnegative().optional(), offset: z.number().int().nonnegative().optional(), query: z.string().max(200).optional() }), execute: async (input) => {
            if (!owner)
                return { text: '请先登录后读取云端资产。', found: false };
            const db = createServiceAuthClient();
            if (input.operation === 'list') {
                let query = db.from('asset_index').select('title,source_path,media_type').eq('user_id', owner).eq('project_id', 'studysolo').eq('source_type', 'sync-document').is('archived_at', null).order('updated_at', { ascending: false }).limit(30);
                if (input.query)
                    query = query.ilike('title', `%${input.query.replace(/[\\%_]/g, '')}%`);
                const rows = await query;
                if (rows.error)
                    return { text: '云端目录暂不可用，已读取内容保留。', found: false };
                return { text: JSON.stringify(rows.data), found: true };
            }
            if (!input.kind || !input.id)
                return { text: '请指定目录中的kind和id。', found: false };
            const row = await db.from('ss_sync_documents').select('payload,deleted,revision').eq('user_id', owner).eq('kind', input.kind).eq('client_id', input.id).single();
            if (row.error || row.data.deleted)
                return { text: '资产不存在或已移入回收站。', found: false };
            if (input.kind === 'image-gen') {
                const full = await hydrateAssetPayload(owner, row.data.payload) as {
                    images?: {
                        b64_json?: string;
                    }[];
                };
                const image = full.images?.[input.field ?? 0];
                if (!image?.b64_json)
                    return { text: '图片尚未完成私有云端保存，请先在原设备同步。', found: false };
                const sharp = (await import('sharp')).default;
                const bytes = await sharp(Buffer.from(image.b64_json, 'base64'), { limitInputPixels: 40000000 }).resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
                if (bytes.length > 1024 * 1024)
                    return { text: '图片缩略图仍过大，请缩小后读取。', found: false };
                return { text: '已保存图片的缩略图；原图保存在私有云端。', found: true, sourceId: input.id, revision: row.data.revision, image: bytes.toString('base64') };
            }
            const range = await readBodyField(owner, row.data.payload, input.field ?? 0, input.offset ?? 0);
            const legacy = row.data.payload as {
                html?: string;
                markdown?: string;
                sections?: {
                    markdown?: string;
                }[];
            };
            const raw = legacy.html ?? legacy.markdown ?? legacy.sections?.[input.field ?? 0]?.markdown ?? JSON.stringify(legacy);
            return { text: range?.text ?? raw.slice(input.offset ?? 0, (input.offset ?? 0) + 12000), found: true, sourceId: input.id, revision: row.data.revision, nextOffset: range?.nextOffset ?? null };
        }, toModelOutput: ({ output }) => 'image' in output && typeof output.image === 'string'
            ? { type: 'content' as const, value: [{ type: 'text' as const, text: output.text }, { type: 'file' as const, data: { type: 'data' as const, data: output.image }, mediaType: 'image/jpeg' }] }
            : ({ type: 'text' as const, value: JSON.stringify(output) }) });
}
