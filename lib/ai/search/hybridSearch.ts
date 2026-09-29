import { billableJsonFetch } from "@/lib/billing/billableFetch";
// 混合检索 + Rerank：并行 BM25 + 向量 → RRF 合并 → rerank API 精排 → MultiSearchHit[]
import { bm25Search, getBm25BuiltAt, isBM25IndexLoaded } from "./bm25Store";
import { vectorSearch, isVectorIndexLoaded, getVectorIndexModel } from "./vectorStore";
import type { ScoredChunk } from "./vectorStoreTypes";
import { getQueryEmbeddingClient } from "@/lib/ai/embedding";
import { mainUsedPlatformCredentials, settleUsage } from "@/lib/billing/usageLedger";
import { resolveSidecarBilling } from "@/lib/billing/usagePool";
import { assertSafeCustomBaseUrl } from "@/lib/ai/customBaseUrl";
import { getCapabilityEndpoints } from "@/lib/ai/capabilityContext";
import { overlayOptional, resolveCapabilityEndpoint } from "@/lib/ai/capabilityEndpoints";
import { normalizeOpenAIBaseUrl } from "@/lib/ai/provider";
import type { MultiSearchHit } from "@/lib/content/loader";
import { normalizeSearchQuery } from "./queryNormalize";
import { shortTitleForIndex } from "@/lib/ai/indexing/bm25Index";
import type { SearchFilter } from "./searchScope";
import { searchLog } from "./searchLog";

export type { SearchFilter } from "./searchScope";

type SearchMode = "hybrid" | "vector" | "keyword";

const PREFER_SUBJECT_MIN_HITS = 3;
const SNIPPET_CHARS = 400;

export interface SearchDiagnostics {
  mode: SearchMode;
  bm25Hits: number;
  vecHits: number;
  merged: number;
  reranked: number;
  final: number;
  filter: SearchFilter;
  ms: number;
  indexBuiltAt?: string;
  embedError?: string;
  rerankError?: string;
}

let lastDiagnostics: SearchDiagnostics | null = null;

export function getLastSearchDiagnostics(): SearchDiagnostics | null {
  return lastDiagnostics;
}

function getSearchMode(): SearchMode {
  const mode = process.env.AI_SEARCH_MODE?.toLowerCase();
  if (mode === "vector" || mode === "keyword") return mode;
  return "hybrid";
}

export interface HybridSearchOptions extends SearchFilter {
  topK?: number;
  /** 当前页面标题，用于短查询向量扩展（不拼入 BM25）。 */
  queryContext?: string;
}

function resolveOptions(
  topKOrOpts?: number | HybridSearchOptions,
): { topK: number; filter: SearchFilter; queryContext?: string } {
  if (typeof topKOrOpts === "number" || topKOrOpts === undefined) {
    return { topK: topKOrOpts ?? 5, filter: {} };
  }
  return {
    topK: topKOrOpts.topK ?? 5,
    queryContext: topKOrOpts.queryContext,
    filter: {
      academicYear: topKOrOpts.academicYear,
      subjectId: topKOrOpts.subjectId,
      preferSubjectId: topKOrOpts.preferSubjectId,
    },
  };
}

/** ≤2 个汉字的查询把当前页标题拼进向量侧，避免「绪论」这类标题词漂到别的科目。 */
export function expandShortQuery(query: string, pageTitle?: string): string {
  const q = query.trim();
  if (!pageTitle) return q;
  const han = q.replace(/[^\u4e00-\u9fff]/g, "");
  if (han.length > 0 && han.length <= 2) return `${pageTitle} ${q}`.trim();
  return q;
}

export function rrfMerge(rankings: ScoredChunk[][], k = 60): ScoredChunk[] {
  const scoreMap = new Map<string, { score: number; chunk: ScoredChunk }>();

  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const chunk = ranking[rank];
      const rrfScore = 1 / (k + rank + 1);
      const existing = scoreMap.get(chunk.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(chunk.id, { score: rrfScore, chunk });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({ ...entry.chunk, score: entry.score }));
}

async function settleRerankUsage(
  json: { usage?: { prompt_tokens?: number; total_tokens?: number } },
  model: string,
  documentCount: number,
  provider: "siliconflow" | "zhipu",
  usedPlatformCredentials: boolean,
): Promise<void> {
  const promptTokens = json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? 0;
  await settleUsage({
    kind: "rerank",
    rawUsage: { inputTokens: promptTokens, outputTokens: 0, totalTokens: promptTokens },
    units: Math.max(documentCount, 1),
    selectedModelId: model,
    actualModelId: model,
    ...resolveSidecarBilling({
      usedPlatformCredentials,
      mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
    }),
    meta: { source: "rerank", provider, candidates: documentCount },
  });
}

/** 重排超时：BYOK 可指到任意端点，没超时会让整个请求吊在对方主机上。 */
const RERANK_TIMEOUT_MS = 30_000;

async function rerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<Array<{ index: number; relevance_score: number }>> {
  const ep = getCapabilityEndpoints();
  const resolved = resolveCapabilityEndpoint({
    userBaseUrl: ep.rerankBaseUrl,
    userApiKey: ep.rerankApiKey,
    platformBaseUrl: process.env.AI_BASE_URL || "https://api.siliconflow.cn/v1",
    platformApiKey: process.env.AI_API_KEY || "",
  });
  const baseUrl = resolved.customBaseUrl
    ? normalizeOpenAIBaseUrl(assertSafeCustomBaseUrl(resolved.baseUrl))
    : resolved.baseUrl;
  const apiKey = resolved.apiKey;
  const model = overlayOptional(ep.rerankModelId, process.env.AI_RERANK_MODEL || "BAAI/bge-reranker-v2-m3");

  try {
    const resp = await billableJsonFetch(`${baseUrl}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: topN,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    }, { model, kind: "rerank", byok: !resolved.usedPlatformCredentials });

    if (!resp.ok) {
      throw new Error(`Rerank API error ${resp.status}`);
    }

    const json = await resp.json();
    await settleRerankUsage(json, model, documents.length, "siliconflow", resolved.usedPlatformCredentials);
    return json.results ?? [];
  } catch (err) {
    if (!resolved.usedPlatformCredentials) throw err;
    const zhipuBaseUrl = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
    const zhipuKey = process.env.ZHIPU_API_KEY || "";
    const zhipuModel = process.env.ZHIPU_RERANK_MODEL || "rerank";
    if (zhipuBaseUrl && zhipuKey) {
      const resp = await billableJsonFetch(`${zhipuBaseUrl}/rerank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${zhipuKey}`,
        },
        body: JSON.stringify({
          model: zhipuModel,
          query,
          documents,
          top_n: topN,
          return_documents: false,
        }),
        signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
      }, { model: zhipuModel, kind: "rerank" });

      if (!resp.ok) {
        throw new Error(`Zhipu Rerank API error ${resp.status}`);
      }

      const json = await resp.json();
      await settleRerankUsage(json, zhipuModel, documents.length, "zhipu", true);
      return json.results ?? [];
    }
    throw err;
  }
}

function toHits(chunks: ScoredChunk[], topK: number): MultiSearchHit[] {
  const seenPaths = new Set<string>();
  const deduped: ScoredChunk[] = [];
  for (const chunk of chunks) {
    if (!seenPaths.has(chunk.path)) {
      seenPaths.add(chunk.path);
      deduped.push(chunk);
    }
    if (deduped.length >= topK) break;
  }
  return deduped.map((chunk) => ({
    subjectId: chunk.subjectId,
    subjectName: chunk.subjectName,
    categoryId: chunk.categoryId,
    itemId: chunk.itemId,
    title: chunk.title,
    snippet: chunk.text.slice(0, SNIPPET_CHARS),
    path: chunk.path,
  }));
}

async function retrieve(
  retrievalQuery: string,
  vectorQuery: string,
  topK: number,
  filter: SearchFilter,
  mode: SearchMode,
): Promise<{ hits: MultiSearchHit[]; diagnostics: Omit<SearchDiagnostics, "ms" | "filter" | "mode"> }> {
  const [hasVectorIndex, hasBM25Index] = await Promise.all([isVectorIndexLoaded(), isBM25IndexLoaded()]);
  if (!hasVectorIndex && !hasBM25Index) {
    return {
      hits: [],
      diagnostics: { bm25Hits: 0, vecHits: 0, merged: 0, reranked: 0, final: 0, indexBuiltAt: undefined },
    };
  }

  // preferSubjectId 的原语义是「先科目限定检索、不足 3 条再全量」——两遍各付一次
  // embed+rerank RTT。改成单遍：BM25/向量是本地索引，全局榜与科目榜并行各扫一份（纯 CPU），
  // embed 两榜共用一次，候选取两榜并集后一次 rerank，最后仍按「科目命中 ≥3」取集。
  const preferSubject = !filter.subjectId ? filter.preferSubjectId : undefined;
  const prefFilter: SearchFilter | undefined = preferSubject
    ? { ...filter, subjectId: preferSubject, preferSubjectId: undefined }
    : undefined;

  const rankings: ScoredChunk[][] = [];
  const prefRankings: ScoredChunk[][] = [];
  let bm25Hits = 0;
  let vecHits = 0;
  let embedError: string | undefined;
  let rerankError: string | undefined;

  const wantVector = mode !== "keyword" && hasVectorIndex;
  const embedOnce = wantVector
    ? (async () => {
        const indexModel = await getVectorIndexModel();
        const embeddingClient = getQueryEmbeddingClient(indexModel);
        return embeddingClient.embed(vectorQuery);
      })()
    : null;
  const vecSearch = (f: SearchFilter) =>
    embedOnce!.then((q) => vectorSearch(q, 40, f)).then(
      (results) => ({ ok: true as const, results }),
      (error: unknown) => ({ ok: false as const, error }),
    );

  const [bm25Results, prefBm25, vecOutcome, prefVecOutcome] = await Promise.all([
    mode !== "vector" && hasBM25Index ? bm25Search(retrievalQuery, 40, filter) : Promise.resolve(null),
    mode !== "vector" && hasBM25Index && prefFilter ? bm25Search(retrievalQuery, 40, prefFilter) : Promise.resolve(null),
    wantVector ? vecSearch(filter) : Promise.resolve(null),
    wantVector && prefFilter ? vecSearch(prefFilter) : Promise.resolve(null),
  ]);

  if (bm25Results) {
    bm25Hits = bm25Results.length;
    if (bm25Results.length) rankings.push(bm25Results);
  }
  if (prefBm25?.length) prefRankings.push(prefBm25);

  const vecError = vecOutcome && !vecOutcome.ok ? vecOutcome.error : prefVecOutcome && !prefVecOutcome.ok ? prefVecOutcome.error : null;
  if (vecError != null) {
    embedError = vecError instanceof Error ? vecError.message : String(vecError);
    const statusMatch = embedError.match(/\b(\d{3})\b/);
    searchLog.error("search.embed.error", {
      model: await getVectorIndexModel(),
      status: statusMatch ? Number(statusMatch[1]) : undefined,
      message: embedError,
      queryLen: vectorQuery.length,
    });
  }
  if (vecOutcome?.ok) {
    vecHits = vecOutcome.results.length;
    if (vecOutcome.results.length) rankings.push(vecOutcome.results);
  }
  if (prefVecOutcome?.ok && prefVecOutcome.results.length) prefRankings.push(prefVecOutcome.results);

  if (!rankings.length) {
    return {
      hits: [],
      diagnostics: {
        bm25Hits,
        vecHits,
        merged: 0,
        reranked: 0,
        final: 0,
        indexBuiltAt: await getBm25BuiltAt(),
        embedError,
      },
    };
  }

  const merged = rrfMerge(rankings);
  // 候选 = 全局榜前 40 ∪ 科目榜前 40（科目榜是原「科目限定轮」的候选来源）。
  const candidates: ScoredChunk[] = [];
  const seenIds = new Set<string>();
  for (const chunk of merged.slice(0, 40)) {
    seenIds.add(chunk.id);
    candidates.push(chunk);
  }
  if (prefFilter) {
    for (const chunk of rrfMerge(prefRankings).slice(0, 40)) {
      if (!seenIds.has(chunk.id)) {
        seenIds.add(chunk.id);
        candidates.push(chunk);
      }
    }
  }

  let scoredPool: ScoredChunk[];
  let reranked = 0;

  if (mode !== "keyword") {
    try {
      const rerankResults = await rerank(
        retrievalQuery,
        candidates.map((c) => `${shortTitleForIndex(c.title)}\n${c.text}`),
        preferSubject ? Math.max(topK, 8) * 2 : Math.max(topK, 8),
      );
      scoredPool = rerankResults.map((r) => ({
        ...candidates[r.index],
        score: r.relevance_score,
      }));
      reranked = scoredPool.length;
    } catch (err) {
      rerankError = err instanceof Error ? err.message : String(err);
      const statusMatch = rerankError.match(/\b(\d{3})\b/);
      searchLog.error("search.rerank.error", {
        model: process.env.AI_RERANK_MODEL || "BAAI/bge-reranker-v2-m3",
        status: statusMatch ? Number(statusMatch[1]) : undefined,
        message: rerankError,
        candidates: candidates.length,
      });
      scoredPool = candidates;
    }
  } else {
    scoredPool = candidates;
  }

  // 原「科目限定轮」规则：首选科目命中 ≥3 则结果只取该科目，否则用全量结果。
  let finalChunks = scoredPool;
  if (preferSubject) {
    const prefScored = scoredPool.filter((c) => c.subjectId === preferSubject);
    if (prefScored.length >= PREFER_SUBJECT_MIN_HITS) finalChunks = prefScored;
  }
  finalChunks = finalChunks.slice(0, Math.max(topK, 8));

  const hits = toHits(finalChunks, topK);
  return {
    hits,
    diagnostics: {
      bm25Hits,
      vecHits,
      merged: merged.length,
      reranked,
      final: hits.length,
      indexBuiltAt: await getBm25BuiltAt(),
      embedError,
      rerankError,
    },
  };
}

export async function hybridSearch(
  query: string,
  topKOrOpts: number | HybridSearchOptions = 5,
): Promise<MultiSearchHit[]> {
  const started = Date.now();
  const { topK, filter, queryContext } = resolveOptions(topKOrOpts);
  const mode = getSearchMode();
  const retrievalQuery = normalizeSearchQuery(query);
  const vectorQuery = expandShortQuery(retrievalQuery, queryContext);

  const run = (nextFilter: SearchFilter) => retrieve(retrievalQuery, vectorQuery, topK, nextFilter, mode);

  const result = await run(filter);

  lastDiagnostics = {
    mode,
    filter,
    ms: Date.now() - started,
    ...result.diagnostics,
  };
  searchLog.info("search.query", {
    mode,
    bm25Hits: lastDiagnostics.bm25Hits,
    vecHits: lastDiagnostics.vecHits,
    merged: lastDiagnostics.merged,
    reranked: lastDiagnostics.reranked,
    final: lastDiagnostics.final,
    filter,
    ms: lastDiagnostics.ms,
    embedError: lastDiagnostics.embedError,
    rerankError: lastDiagnostics.rerankError,
  });
  return result.hits;
}
