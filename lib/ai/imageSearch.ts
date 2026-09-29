import { billableJsonFetch } from "@/lib/billing/billableFetch";
import { mainUsedPlatformCredentials, settleUsage } from "@/lib/billing/usageLedger";
import { resolveSidecarBilling } from "@/lib/billing/usagePool";
import { getCapabilityEndpoints } from "@/lib/ai/capabilityContext";
import { resolveCapabilitySecret } from "@/lib/ai/capabilityEndpoints";

const UNSPLASH_API_URL = "https://api.unsplash.com/search/photos";

export const IMAGE_SEARCH_UNCONFIGURED_TEXT =
  "搜图未配置（请在设置中填写 Unsplash Access Key，或由站点配置 UNSPLASH_ACCESS_KEY）。请不要再次调用 imageSearch。";

function resolveUnsplashKey(override?: string): { key: string; usedPlatformCredentials: boolean } {
  const ep = getCapabilityEndpoints();
  const resolved = resolveCapabilitySecret(override ?? ep.unsplashAccessKey, process.env.UNSPLASH_ACCESS_KEY || "");
  return { key: resolved.value, usedPlatformCredentials: resolved.usedPlatformCredentials };
}

export interface ImageSearchResult {
  url: string;
  thumbnail: string;
  author: string;
  source: string;
  alt: string;
  downloadLocation: string;
}

export interface ImageSearchResponse {
  configured: boolean;
  results: ImageSearchResult[];
  usedPlatformCredentials: boolean;
}

interface UnsplashPhoto {
  id: string;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
  };
  links: {
    html: string;
    download_location: string;
  };
  alt_description: string | null;
  width: number;
  height: number;
}

export async function searchImages(
  query: string,
  numResults = 3,
  opts?: { apiKey?: string },
): Promise<ImageSearchResponse> {
  const { key, usedPlatformCredentials } = resolveUnsplashKey(opts?.apiKey);
  if (!key) {
    return { configured: false, results: [], usedPlatformCredentials };
  }
  if (!query.trim()) {
    return { configured: true, results: [], usedPlatformCredentials };
  }

  try {
    const enhancedQuery = enhanceQueryForEducation(query);
    const res = await billableJsonFetch(
      `${UNSPLASH_API_URL}?query=${encodeURIComponent(enhancedQuery)}&per_page=${numResults * 2}&content_filter=high`,
      {
        headers: {
          Authorization: `Client-ID ${key}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(15_000),
      },
      { model: "unsplash", kind: "image-search", byok: !usedPlatformCredentials },
    );

    if (!res.ok) return { configured: true, results: [], usedPlatformCredentials };

    const data = await res.json();
    const candidates: UnsplashPhoto[] = data.results ?? [];
    const selected = selectBestImages(candidates, numResults);
    await settleUsage({
      kind: "image-search",
      units: Math.max(selected.length, 1),
      imageCount: selected.length,
      selectedModelId: "unsplash",
      actualModelId: "unsplash",
      ...resolveSidecarBilling({
        usedPlatformCredentials,
        mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
      }),
      meta: { source: "imageSearch", resultCount: selected.length },
    });
    return { configured: true, results: selected, usedPlatformCredentials };
  } catch {
    return { configured: true, results: [], usedPlatformCredentials };
  }
}

function enhanceQueryForEducation(query: string): string {
  const lower = query.toLowerCase();
  const educationKeywords = [
    "diagram",
    "illustration",
    "educational",
    "academic",
    "chart",
    "graph",
    "experiment",
    "physics",
    "chemistry",
    "mathematics",
    "probability",
    "statistics",
  ];

  if (educationKeywords.some((kw) => lower.includes(kw))) {
    return query;
  }

  return `${query} diagram illustration`;
}

function selectBestImages(
  candidates: UnsplashPhoto[],
  count: number,
): ImageSearchResult[] {
  return candidates
    .sort((a, b) => {
      const sizeA = a.width * a.height;
      const sizeB = b.width * b.height;
      return sizeB - sizeA;
    })
    .slice(0, count)
    .map((photo) => ({
      url: photo.urls.regular,
      thumbnail: photo.urls.thumb,
      author: photo.user.name,
      source: photo.links.html,
      alt: photo.alt_description || "Unsplash photo",
      downloadLocation: photo.links.download_location,
    }));
}

export async function trackPhotoDownload(
  downloadLocation: string,
): Promise<void> {
  const { key } = resolveUnsplashKey();
  if (!downloadLocation || !key) return;

  try {
    // download_location 由 Unsplash 响应提供；只认官方域名，
    // 避免上游响应被污染时带着我们的 key 打到别的主机。
    const host = new URL(downloadLocation).hostname.toLowerCase();
    if (host !== "api.unsplash.com") return;
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Silent failure
  }
}
