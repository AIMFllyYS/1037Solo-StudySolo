/** 归一化后的图片项，兼容 OpenAI（url 或 b64_json）与 SiliconFlow（url）。 */
export interface NormalizedImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

/**
 * 从上游 200 JSON 抽出可用图片。OpenAI 用 `data`，SiliconFlow 用 `images`。
 * 空 url / 空 b64 的项丢弃。
 */
export function normalizeImageGenImages(data: unknown): NormalizedImage[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const rawImages: unknown[] = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.images)
      ? obj.images
      : [];

  return rawImages
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const img: NormalizedImage = {};
      if (typeof rec.url === "string" && rec.url) img.url = rec.url;
      if (typeof rec.b64_json === "string" && rec.b64_json) img.b64_json = rec.b64_json;
      if (typeof rec.revised_prompt === "string") img.revised_prompt = rec.revised_prompt;
      return img.url || img.b64_json ? img : null;
    })
    .filter((x): x is NormalizedImage => x !== null);
}
