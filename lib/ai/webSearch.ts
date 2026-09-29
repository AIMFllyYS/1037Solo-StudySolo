import { billableJsonFetch } from "@/lib/billing/billableFetch";
// 联网搜索门面（对外保持历史入口不变）。
//
// 两种用法：
//  - \`runWebSearchDetailed\`：主 Agent 的工具走这里 → 交给搜索子智能体（多供应商并行 + 综述）。
//  - \`searchCached\`：只走智谱的结构化搜索，保留历史上的 apiKey 覆盖与计费口径
//    （计费测试与旧调用点依赖它：用户自带 key 时不计入平台池）。

import { settleUsage, mainUsedPlatformCredentials } from "@/lib/billing/usageLedger";
import { resolveSidecarBilling } from "@/lib/billing/usagePool";
import { getCapabilityEndpoints } from "@/lib/ai/capabilityContext";
import { resolveCapabilitySecret } from "@/lib/ai/capabilityEndpoints";
import { runSearchSubagent } from "@/lib/ai/search/subagent";
import { createTtlCache } from "@/lib/ai/ttlCache";
import type { SearchMode, SearchProgressEvent, SearchProviderId } from "@/lib/ai/search/types";
import type { WebSearchSource } from "@/lib/types/chat";

export type { WebSearchSource } from "@/lib/types/chat";

const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";

function resolveSearchKey(override?: string): { key: string; usedPlatformCredentials: boolean } {
  const ep = getCapabilityEndpoints();
  const resolved = resolveCapabilitySecret(override ?? ep.webSearchApiKey, process.env.ZHIPU_API_KEY || "");
  return { key: resolved.value, usedPlatformCredentials: resolved.usedPlatformCredentials };
}

interface ZhipuSearchOptions {
  searchEngine?: string;
  domainFilter?: string;
  contentSize?: string;
  /** 显式覆盖用户/平台 key；缺省读能力端点 ALS 与 ZHIPU_API_KEY。 */
  apiKey?: string;
}

async function fetchZhipuRaw(
  query: string,
  count: number,
  opts: ZhipuSearchOptions,
  apiKey: string,
): Promise<WebSearchSource[]> {
  const body: Record<string, unknown> = {
    search_engine: opts.searchEngine ?? "search_pro",
    search_query: query,
    count: Math.min(Math.max(count, 1), 50),
    search_recency_filter: "noLimit",
    content_size: opts.contentSize ?? "high",
  };
  if (opts.domainFilter) body.search_domain_filter = opts.domainFilter;
  const res = await billableJsonFetch(ZHIPU_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  }, { model: String(body.search_engine), kind: "search", byok: !resolveSearchKey(opts.apiKey).usedPlatformCredentials });
  if (!res.ok) throw new Error("Zhipu Search " + res.status);
  const data = await res.json();
  const items = data?.search_result ?? [];
  return items.map((p: Record<string, string>) => ({
    title: p.title ?? "",
    url: p.link ?? "",
    snippet: p.content ?? "",
    icon: p.icon ?? "",
    media: p.media ?? "",
  }));
}

// ── 内存缓存（同一服务进程内 LRU + TTL）────────────────────────
const CACHE = createTtlCache<WebSearchSource[]>({ ttlMs: 10 * 60 * 1000, maxEntries: 100 });
const cacheGet = (key: string) => CACHE.get(key);
const cacheSet = CACHE.set.bind(CACHE);

export async function searchCached(
  query: string,
  count = 5,
  opts: ZhipuSearchOptions = {},
): Promise<{ results: WebSearchSource[]; cacheHit: boolean; usedPlatformCredentials: boolean }> {
  const q = query.trim();
  const { key, usedPlatformCredentials } = resolveSearchKey(opts.apiKey);
  if (!q || !key) return { results: [], cacheHit: false, usedPlatformCredentials };
  const cacheKey = q.toLowerCase().replace(/\s+/g, " ") + "|" + count + "|" + (opts.domainFilter ?? "") + "|" + (usedPlatformCredentials ? "p" : "u");
  const cached = cacheGet(cacheKey);
  if (cached) return { results: cached, cacheHit: true, usedPlatformCredentials };
  const results = await fetchZhipuRaw(q, count, opts, key);
  cacheSet(cacheKey, results);
  await settleUsage({
    kind: "web-search",
    units: Math.max(results.length, 1),
    selectedModelId: opts.searchEngine ?? "search_pro",
    actualModelId: opts.searchEngine ?? "search_pro",
    ...resolveSidecarBilling({
      usedPlatformCredentials,
      mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
    }),
    meta: { source: "webSearch", resultCount: results.length },
  });
  return { results, cacheHit: false, usedPlatformCredentials };
}

export interface WebSearchDetailed {
  content: string;
  /** 精选后的来源清单（已按上限截断），与正文里的 [n] 编号一一对应。 */
  sources: WebSearchSource[];
  cacheHit: boolean;
  /** 本次实际用到的搜索源（供 UI/日志展示）。 */
  providers?: SearchProviderId[];
  /** 是否做了跨源综述（多供应商综合分析）。 */
  synthesized?: boolean;
  /** 去重后仍未入选的来源数（>0 时正文已提示可换词再搜）。 */
  omittedSources?: number;
  /** 子智能体端到端耗时（毫秒）。 */
  ms?: number;
}

export interface WebSearchRunOptions {
  mode?: SearchMode;
  providers?: readonly SearchProviderId[];
  /** 渐进状态回调：选源完成 / 每家返回 / 综述 / 结束各推一次，供流式展示。 */
  onProgress?: (event: SearchProgressEvent) => void;
}

/**
 * 主入口：交给搜索子智能体（选源 → 并行检索 → 精选 → 综述）。
 * 子智能体内部永远不会抛错，失败会以可读文本返回。
 */
export async function runWebSearchDetailed(
  query: string,
  numResults = 5,
  options: WebSearchRunOptions = {},
): Promise<WebSearchDetailed> {
  const bundle = await runSearchSubagent({
    query,
    mode: options.mode,
    providers: options.providers,
    count: numResults,
  }, options.onProgress);
  return {
    content: bundle.text,
    sources: bundle.sources,
    cacheHit: bundle.cacheHit,
    providers: bundle.used,
    synthesized: bundle.synthesized,
    omittedSources: bundle.omittedSources,
    ms: bundle.ms,
  };
}