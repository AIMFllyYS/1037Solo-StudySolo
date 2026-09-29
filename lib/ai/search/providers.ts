import { billableJsonFetch } from "@/lib/billing/billableFetch";
// 三家搜索供应商的调用实现。
//
// 凭证：用户在设置里填的（capability endpoints）优先；没填才用站点 env。
// 计费：每次调用记一条 web-search 账（尽力而为——记账失败不能影响搜索本身）。
// 缓存：进程内 LRU+TTL，键含凭证域（平台/自带）与归一化 query，
//   命中则不打上游也不记账（Kimi 的代理式搜索最贵，也必须缓存）。
// 超时：每家有自己的单请求超时，外加调用方传入的「总预算」signal——
//   到点未完成的供应商被中止，已完成的照常回传（部分结果而不是全灭）。

import { settleUsage, mainUsedPlatformCredentials } from "@/lib/billing/usageLedger";
import { resolveSidecarBilling } from "@/lib/billing/usagePool";
import { getCapabilityEndpoints } from "@/lib/ai/capabilityContext";
import { resolveCapabilitySecret } from "@/lib/ai/capabilityEndpoints";
import { createTtlCache } from "@/lib/ai/ttlCache";
import type { ProviderOutcome, SearchItem, SearchProviderId } from "./types";

const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";
const PERPLEXITY_BASE = "https://api.perplexity.ai";
const KIMI_BASE = "https://api.moonshot.cn/v1";

/** Kimi 的搜索是"代理式"的：平台侧执行搜索，我们只负责把 tool_call 原样回灌。 */
const KIMI_WEB_SEARCH_TOOL = { type: "builtin_function", function: { name: "$web_search" } } as const;
/**
 * 一次搜索最多让 Kimi 迭代几轮（它可能换关键词再搜）。
 * 从 3 收敛到 2：配合 90s 总预算，Kimi 最坏 ~90s 而不是 3×120s=360s 顶爆看门狗。
 */
export const KIMI_MAX_ROUNDS = 2;
/** Kimi 单轮超时：55s，两轮最坏 110s，但总预算 signal 会先在 ~90s 把它截住。 */
export const KIMI_ROUND_TIMEOUT_MS = 55_000;
export const ZHIPU_TIMEOUT_MS = 20_000;
export const PERPLEXITY_TIMEOUT_MS = 30_000;

export interface ProviderConfig {
  id: SearchProviderId;
  apiKey: string;
  usedPlatformCredentials: boolean;
}

/** 单次供应商调用的调优参数：timeoutMs 覆盖默认单请求超时，signal 是总预算闸。 */
export interface ProviderCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function envKey(provider: SearchProviderId): string {
  if (provider === "kimi") return process.env.KIMI_API_KEY || "";
  if (provider === "perplexity") return process.env.PERPLEXITY_API_KEY || "";
  return process.env.ZHIPU_API_KEY || "";
}

function capabilityKey(provider: SearchProviderId, ep: ReturnType<typeof getCapabilityEndpoints>): string {
  if (provider === "kimi") return ep.kimiSearchApiKey;
  if (provider === "perplexity") return ep.perplexitySearchApiKey;
  // 智谱沿用已有的 webSearchApiKey（历史上它就是填智谱 key 的地方）。
  return ep.webSearchApiKey;
}

export function resolveProviderConfig(provider: SearchProviderId): ProviderConfig {
  const ep = getCapabilityEndpoints();
  const resolved = resolveCapabilitySecret(capabilityKey(provider, ep), envKey(provider));
  return { id: provider, apiKey: resolved.value, usedPlatformCredentials: resolved.usedPlatformCredentials };
}

/** 哪些供应商这次真能用（有 key）。 */
export function availableProviders(): SearchProviderId[] {
  return (["kimi", "zhipu", "perplexity"] as const).filter((id) => !!resolveProviderConfig(id).apiKey);
}

function providerModelId(provider: SearchProviderId): string {
  if (provider === "kimi") return process.env.KIMI_SEARCH_MODEL || "kimi-k2.6";
  if (provider === "perplexity") return "perplexity/search";
  return "search_pro";
}

async function billProvider(provider: SearchProviderId, units: number, usedPlatformCredentials: boolean, meta: Record<string, unknown>) {
  try {
    await settleUsage({
      kind: "web-search",
      units: Math.max(units, 1),
      selectedModelId: providerModelId(provider),
      actualModelId: providerModelId(provider),
      ...resolveSidecarBilling({
        usedPlatformCredentials,
        mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
      }),
      meta: { source: "webSearch", provider, ...meta },
    });
  } catch {
    // 记账失败不影响搜索结果。
  }
}

// ── 结构化结果的内存缓存（同一进程内 LRU + TTL）────────────────────
const CACHE = createTtlCache<SearchItem[]>({ ttlMs: 10 * 60 * 1000, maxEntries: 100 });
const cacheGet = (key: string) => CACHE.get(key);
const cacheSet = CACHE.set.bind(CACHE);
// Kimi 不返回结构化列表，缓存的是成文结论 + 抠出来的引用链接。
const KIMI_CACHE = createTtlCache<{ briefing?: string; citations: string[] }>({ ttlMs: 10 * 60 * 1000, maxEntries: 100 });

/**
 * 缓存键：query 归一化（trim + 小写 + 空白折叠）+ 凭证域（平台/自带）。
 * 凭证域必须进键——否则同一进程内"平台池"和"自带 key"会互相命中，
 * 计费口径和结果时效都会串。
 */
function providerCacheKey(provider: SearchProviderId, model: string, query: string, count: number, usedPlatformCredentials: boolean): string {
  const norm = query.trim().toLowerCase().replace(/\s+/g, " ");
  return [provider, model, norm, String(count), usedPlatformCredentials ? "p" : "u"].join("|");
}

/** 单请求超时与外部总预算 signal 合并：哪个先到听哪个。 */
function mergedSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

/** AbortError（外部预算闸）与 TimeoutError（单请求超时）统一口径成"搜索超时"。 */
function describeProviderError(err: unknown): string {
  const e = err as { name?: string; message?: string } | undefined;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "搜索超时";
  return String(e?.message ?? err);
}

async function fetchJson(url: string, apiKey: string, body: unknown, timeoutMs: number, signal: AbortSignal | undefined, usedPlatformCredentials: boolean): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; raw: string }> {
  const params = body as Record<string, unknown>;
  const res = await billableJsonFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify(body),
    signal: mergedSignal(timeoutMs, signal),
  }, { model: String(params.search_engine ?? params.model ?? new URL(url).hostname), kind: "search", byok: !usedPlatformCredentials });
  const raw = await res.text().catch(() => "");
  let data: Record<string, unknown> | null = null;
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, raw };
}

// ── 智谱：结构化列表 ─────────────────────────────────────────────
export async function searchZhipu(query: string, count: number, opts: ProviderCallOptions = {}): Promise<ProviderOutcome> {
  const started = Date.now();
  const config = resolveProviderConfig("zhipu");
  if (!config.apiKey) {
    return { provider: "zhipu", results: [], citations: [], ms: 0, usedPlatformCredentials: true, error: "未配置智谱搜索 key" };
  }
  const cacheKey = providerCacheKey("zhipu", "search_pro", query, count, config.usedPlatformCredentials);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { provider: "zhipu", results: cached, citations: cached.map((item) => item.url), ms: 0, usedPlatformCredentials: config.usedPlatformCredentials, cached: true };
  }
  try {
    const r = await fetchJson(ZHIPU_SEARCH_URL, config.apiKey, {
      search_engine: "search_pro",
      search_query: query,
      count: Math.min(Math.max(count, 1), 50),
      search_recency_filter: "noLimit",
      content_size: "high",
    }, opts.timeoutMs ?? ZHIPU_TIMEOUT_MS, opts.signal, config.usedPlatformCredentials);
    if (!r.ok || !r.data) {
      return { provider: "zhipu", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: "上游 " + r.status };
    }
    const items = Array.isArray(r.data.search_result) ? r.data.search_result as Record<string, string>[] : [];
    const results: SearchItem[] = items.map((p) => ({
      title: p.title ?? "",
      url: p.link ?? "",
      snippet: p.content ?? "",
      media: p.media ?? "",
      provider: "zhipu" as const,
    })).filter((item) => !!item.url);
    cacheSet(cacheKey, results);
    await billProvider("zhipu", Math.max(results.length, 1), config.usedPlatformCredentials, { resultCount: results.length });
    return { provider: "zhipu", results, citations: results.map((item) => item.url), ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials };
  } catch (err) {
    return { provider: "zhipu", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: describeProviderError(err) };
  }
}

// ── Perplexity：结构化列表优先，失败退到 sonar 成文 ────────────────
export async function searchPerplexity(query: string, count: number, opts: ProviderCallOptions = {}): Promise<ProviderOutcome> {
  const started = Date.now();
  const config = resolveProviderConfig("perplexity");
  if (!config.apiKey) {
    return { provider: "perplexity", results: [], citations: [], ms: 0, usedPlatformCredentials: true, error: "未配置 Perplexity key" };
  }
  const cacheKey = providerCacheKey("perplexity", "sonar", query, count, config.usedPlatformCredentials);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { provider: "perplexity", results: cached, citations: cached.map((item) => item.url), ms: 0, usedPlatformCredentials: config.usedPlatformCredentials, cached: true };
  }
  const timeoutMs = opts.timeoutMs ?? PERPLEXITY_TIMEOUT_MS;
  try {
    // 1) Search API：纯检索，便宜且快，返回结构化结果。
    const r = await fetchJson(PERPLEXITY_BASE + "/search", config.apiKey, {
      query,
      max_results: Math.min(Math.max(count, 1), 20),
    }, timeoutMs, opts.signal, config.usedPlatformCredentials);
    if (r.ok && r.data && Array.isArray(r.data.results)) {
      const results: SearchItem[] = (r.data.results as Record<string, unknown>[]).map((p) => ({
        title: String(p.title ?? ""),
        url: String(p.url ?? ""),
        snippet: String(p.snippet ?? ""),
        date: p.last_updated ? String(p.last_updated) : undefined,
        provider: "perplexity" as const,
      })).filter((item) => !!item.url);
      cacheSet(cacheKey, results);
      await billProvider("perplexity", Math.max(results.length, 1), config.usedPlatformCredentials, { resultCount: results.length, api: "search" });
      return { provider: "perplexity", results, citations: results.map((item) => item.url), ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials };
    }

    // 2) 退到 sonar：拿成文答案 + citations（贵一些，但能拿到"已经读过再总结"的内容）。
    const sonar = await fetchJson(PERPLEXITY_BASE + "/chat/completions", config.apiKey, {
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }, timeoutMs, opts.signal, config.usedPlatformCredentials);
    if (!sonar.ok || !sonar.data) {
      return { provider: "perplexity", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: "上游 " + sonar.status };
    }
    const choices = Array.isArray(sonar.data.choices) ? sonar.data.choices as Record<string, unknown>[] : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    const briefing = typeof message?.content === "string" ? message.content : "";
    const citationsRaw = Array.isArray(sonar.data.citations) ? sonar.data.citations as unknown[] : [];
    const searchResults = Array.isArray(sonar.data.search_results) ? sonar.data.search_results as Record<string, unknown>[] : [];
    const results: SearchItem[] = searchResults.map((p) => ({
      title: String(p.title ?? ""),
      url: String(p.url ?? ""),
      snippet: String(p.snippet ?? ""),
      date: p.last_updated ? String(p.last_updated) : undefined,
      provider: "perplexity" as const,
    })).filter((item) => !!item.url);
    cacheSet(cacheKey, results);
    await billProvider("perplexity", Math.max(results.length, 1), config.usedPlatformCredentials, { resultCount: results.length, api: "sonar" });
    return {
      provider: "perplexity",
      results,
      briefing: briefing || undefined,
      citations: citationsRaw.map((c) => String(c)).filter(Boolean),
      ms: Date.now() - started,
      usedPlatformCredentials: config.usedPlatformCredentials,
    };
  } catch (err) {
    return { provider: "perplexity", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: describeProviderError(err) };
  }
}

/** 从成文回答里抠出引用链接（Kimi 不给结构化 citations）。 */
export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;，。；）)]+$/, "")))];
}

// ── Kimi：代理式搜索（builtin_function + 回灌 tool_call）────────────
export async function searchKimi(query: string, count: number, opts: ProviderCallOptions = {}): Promise<ProviderOutcome> {
  const started = Date.now();
  const config = resolveProviderConfig("kimi");
  if (!config.apiKey) {
    return { provider: "kimi", results: [], citations: [], ms: 0, usedPlatformCredentials: true, error: "未配置 Kimi key" };
  }
  const model = providerModelId("kimi");
  const cacheKey = providerCacheKey("kimi", model, query, count, config.usedPlatformCredentials);
  const cached = KIMI_CACHE.get(cacheKey);
  if (cached) {
    return { provider: "kimi", results: [], briefing: cached.briefing, citations: cached.citations, ms: 0, usedPlatformCredentials: config.usedPlatformCredentials, cached: true };
  }
  const timeoutMs = opts.timeoutMs ?? KIMI_ROUND_TIMEOUT_MS;
  try {
    const messages: Record<string, unknown>[] = [
      { role: "user", content: query + "（请联网查证，给出结论并附来源）" },
    ];
    for (let round = 0; round < KIMI_MAX_ROUNDS; round += 1) {
      if (opts.signal?.aborted) {
        return { provider: "kimi", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: "搜索超时" };
      }
      const r = await fetchJson(KIMI_BASE + "/chat/completions", config.apiKey, {
        model,
        messages,
        tools: [KIMI_WEB_SEARCH_TOOL],
      }, timeoutMs, opts.signal, config.usedPlatformCredentials);
      if (!r.ok || !r.data) {
        return { provider: "kimi", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: "上游 " + r.status };
      }
      const choices = Array.isArray(r.data.choices) ? r.data.choices as Record<string, unknown>[] : [];
      const message = choices[0]?.message as Record<string, unknown> | undefined;
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls as Record<string, unknown>[] : [];
      const content = typeof message?.content === "string" ? message.content : "";
      if (toolCalls.length === 0) {
        // 收尾：模型已经产出带引用的答案。
        const citations = extractUrls(content);
        if (content) KIMI_CACHE.set(cacheKey, { briefing: content, citations });
        await billProvider("kimi", Math.max(citations.length, 1), config.usedPlatformCredentials, { rounds: round + 1, api: "$web_search" });
        return {
          provider: "kimi",
          results: [],
          briefing: content || undefined,
          citations,
          ms: Date.now() - started,
          usedPlatformCredentials: config.usedPlatformCredentials,
          error: content ? undefined : "Kimi 未返回内容",
        };
      }
      const call = toolCalls[0] as { id?: string; function?: { name?: string; arguments?: string } };
      const fn = call.function ?? {};
      messages.push({
        role: "assistant",
        content,
        // 关键：回灌时 type 必须是 "function"（builtin_function 会 400 tokenization failed）。
        tool_calls: [{ id: call.id, type: "function", function: { name: fn.name, arguments: fn.arguments } }],
      });
      messages.push({ role: "tool", tool_call_id: call.id, name: fn.name, content: fn.arguments });
    }
    return { provider: "kimi", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: "轮次用尽仍未收敛" };
  } catch (err) {
    return { provider: "kimi", results: [], citations: [], ms: Date.now() - started, usedPlatformCredentials: config.usedPlatformCredentials, error: describeProviderError(err) };
  }
}

export function runProviderSearch(provider: SearchProviderId, query: string, count: number, opts: ProviderCallOptions = {}): Promise<ProviderOutcome> {
  if (provider === "kimi") return searchKimi(query, count, opts);
  if (provider === "perplexity") return searchPerplexity(query, count, opts);
  return searchZhipu(query, count, opts);
}
