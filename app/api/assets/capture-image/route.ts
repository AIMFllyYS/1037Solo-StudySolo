import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { fileOwner, fileFailure, FileError } from '@/lib/files/owner.server';
import { boundedText } from '@/lib/http/boundedBody';
import { createPublicModelFetch } from '@/lib/ai/sdk/publicModelFetch.server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
    try {
        await fileOwner(request, true);
        const { url } = z.object({ url: z.string().url().max(8192) }).parse(JSON.parse(await boundedText(request, 16384)));
        const response = await createPublicModelFetch(url, 60000)(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok || !/^image\/(png|jpeg|webp|gif)(?:;|$)/.test(response.headers.get('content-type') ?? ''))
            throw new FileError('生成图片源暂不可读取，请重试；本机结果保留。', 503);
        const reader = response.body?.getReader();
        if (!reader)
            throw new FileError('图片响应为空。', 503);
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done)
                    break;
                bytes += part.value.length;
                if (bytes > 32 * 1024 * 1024)
                    throw new FileError('这张图片超过当前读取安全上限，已保留本机结果。', 413);
                chunks.push(part.value);
            }
        }
        finally {
            void reader.cancel().catch(() => { });
        }
        return Response.json({ b64_json: Buffer.concat(chunks).toString('base64') }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (error) {
        return fileFailure(error);
    }
}
