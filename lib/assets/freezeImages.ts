import type { ImageGenImage } from '@/lib/stores/assets/imageGen';
import { assetApi } from './client';
/** Final image bodies must survive an expiring provider URL and an offline sync queue. */
export async function freezeGeneratedImages(images: ImageGenImage[], signal?: AbortSignal): Promise<ImageGenImage[]> {
    const frozen: ImageGenImage[] = [];
    for (const image of images) {
        signal?.throwIfAborted();
        let b64 = image.b64_json;
        if (!b64 && image.url?.startsWith('data:image/'))
            b64 = image.url.split(',')[1];
        if (!b64 && image.url)
            b64 = (await assetApi('/capture-image', { method: 'POST', body: JSON.stringify({ url: image.url }), signal })).b64_json;
        signal?.throwIfAborted();
        if (!b64)
            throw new Error('已生成图片的原图暂不可保存，保留稿仍在本机，请重试保存。');
        frozen.push({ b64_json: b64, revised_prompt: image.revised_prompt });
    }
    return frozen;
}
