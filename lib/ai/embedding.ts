import { billableJsonFetch } from "@/lib/billing/billableFetch";
// SiliconFlow Embedding 客户端：封装 /v1/embeddings 调用，实现 EmbeddingProvider 接口。
import type { EmbeddingProvider } from '@/lib/context/semanticSearch';
import { mainUsedPlatformCredentials, settleUsage } from '@/lib/billing/usageLedger';
import { resolveSidecarBilling } from '@/lib/billing/usagePool';
import { assertSafeCustomBaseUrl } from '@/lib/ai/customBaseUrl';
import { getCapabilityEndpoints } from '@/lib/ai/capabilityContext';
import { overlayOptional, resolveCapabilityEndpoint } from '@/lib/ai/capabilityEndpoints';
import { normalizeOpenAIBaseUrl } from '@/lib/ai/provider';

const BATCH_SIZE = 32; // SiliconFlow 单次请求最多 32 个 input

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens: number };
}

export class SiliconFlowEmbedding implements EmbeddingProvider {
  private baseUrl: string;
  private apiKey: string;
  readonly model: string;
  private usedPlatformCredentials: boolean;

  constructor() {
    const ep = getCapabilityEndpoints();
    const platformBase = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1';
    const platformKey = process.env.AI_API_KEY || '';
    const resolved = resolveCapabilityEndpoint({
      userBaseUrl: ep.embeddingBaseUrl,
      userApiKey: ep.embeddingApiKey,
      platformBaseUrl: platformBase,
      platformApiKey: platformKey,
    });
    this.baseUrl = resolved.customBaseUrl
      ? normalizeOpenAIBaseUrl(assertSafeCustomBaseUrl(resolved.baseUrl))
      : resolved.baseUrl;
    this.apiKey = resolved.apiKey;
    this.model = overlayOptional(ep.embeddingModelId, process.env.AI_EMBEDDING_MODEL || 'BAAI/bge-m3');
    this.usedPlatformCredentials = resolved.usedPlatformCredentials;
  }

  get configured(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];

    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const resp = await billableJsonFetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: batch }),
      }, { model: this.model, kind: "embedding", byok: !this.usedPlatformCredentials });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(
          `Embedding API error ${resp.status}: ${errText.slice(0, 200)}`,
        );
      }

      const json: EmbeddingResponse = await resp.json();
      for (const item of json.data) {
        results[i + item.index] = item.embedding;
      }
      const promptTokens = json.usage?.prompt_tokens ?? 0;
      await settleUsage({
        kind: 'embedding',
        rawUsage: { inputTokens: promptTokens, outputTokens: 0, totalTokens: promptTokens },
        units: batch.length,
        selectedModelId: this.model,
        actualModelId: this.model,
        ...resolveSidecarBilling({
          usedPlatformCredentials: this.usedPlatformCredentials,
          mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
        }),
        meta: { source: 'embedding', provider: 'siliconflow', batchSize: batch.length },
      });
    }

    return results;
  }
}

// 智谱 Embedding 客户端：当 SiliconFlow 失败时作为容灾降级。
const ZHIPU_BATCH_SIZE = 64; // 智谱单次最多 64 条

export class ZhipuEmbedding implements EmbeddingProvider {
  private baseUrl: string;
  private apiKey: string;
  readonly model: string;

  constructor() {
    this.baseUrl = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    this.apiKey = process.env.ZHIPU_API_KEY || '';
    this.model = process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3';
  }

  get configured(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];

    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += ZHIPU_BATCH_SIZE) {
      const batch = texts.slice(i, i + ZHIPU_BATCH_SIZE);
      const resp = await billableJsonFetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: batch }),
      }, { model: this.model, kind: "embedding" });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(
          `Zhipu Embedding API error ${resp.status}: ${errText.slice(0, 200)}`,
        );
      }

      const json: EmbeddingResponse = await resp.json();
      for (const item of json.data) {
        results[i + item.index] = item.embedding;
      }
      const promptTokens = json.usage?.prompt_tokens ?? 0;
      await settleUsage({
        kind: 'embedding',
        rawUsage: { inputTokens: promptTokens, outputTokens: 0, totalTokens: promptTokens },
        units: batch.length,
        selectedModelId: this.model,
        actualModelId: this.model,
        ...resolveSidecarBilling({
          // 降级路径只走站点 ZHIPU_API_KEY，永远是平台凭证。
          usedPlatformCredentials: true,
          mainUsedPlatformCredentials: mainUsedPlatformCredentials(),
        }),
        meta: { source: 'embedding', provider: 'zhipu', batchSize: batch.length },
      });
    }

    return results;
  }
}



/**
 * 查询向量必须与索引构建模型一致。智谱 embedding-3 与 bge-m3 维度不同，
 * 不能作为检索查询的静默降级，否则余弦相似度全是噪声。
 */
export function getQueryEmbeddingClient(indexModel?: string | null): SiliconFlowEmbedding | ZhipuEmbedding {
  const ep = getCapabilityEndpoints();
  if (ep.embeddingApiKey || ep.embeddingModelId) {
    return new SiliconFlowEmbedding();
  }
  const wanted = (indexModel || process.env.AI_EMBEDDING_MODEL || "BAAI/bge-m3").toLowerCase();
  const silicon = new SiliconFlowEmbedding();
  if (silicon.model.toLowerCase() === wanted) return silicon;
  const zhipu = new ZhipuEmbedding();
  if (zhipu.configured && zhipu.model.toLowerCase() === wanted) return zhipu;
  return silicon;
}
