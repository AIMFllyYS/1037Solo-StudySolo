import { type ProviderKind } from "@/lib/ai/models";

import { normalizeOpenAIBaseUrl } from "@/lib/ai/endpoints/openaiBaseUrl";

import type { ProviderCredentials } from "./types";
// 本模块在加载时读一次 env（BASE / KEY / MIMO_* / RELAY_* / ENV_MODEL_*）。改 env 必须重启进程。
// 对比：app/api/chat-title/route.ts 的 titleProvider() 每次请求读 env。两套语义不要混改。
// AI_BASE_URL 不再参与本模块的 base 解析：它曾是生图端点的兜底，而那正是
// 「配了中转站 → 生图 404」的来源。向量 / 重排仍在 embedding.ts 里各自读它。
export const KEY = process.env.AI_API_KEY || "";
/** 生图端点的真实默认值。见 credentialsFor("siliconflow")：不拿 AI_BASE_URL 当兜底。 */
export const SILICONFLOW_DEFAULT_BASE = "https://api.siliconflow.cn/v1";
export const REASONING_FIELD = process.env.AI_REASONING_FIELD || "reasoning_content";

export const MIMO_BASE = process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1";
export const MIMO_KEY = process.env.MIMO_API_KEY || "";

export const ZHIPU_BASE = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
export const ZHIPU_KEY = process.env.ZHIPU_API_KEY || "";

// 七牛云（api.qnaigc.com）：主力文本供应商，端点链里排第一位（延迟最低）。
// 注意方言：GLM 5.3 Flash 在该站「始终思考、不可关闭」；DeepSeek / Qwen 用
// thinking:{type:enabled|disabled} 真正开关（见 models.ts 的 qiniu-toggle）。
export const QINIU_BASE = process.env.QINIU_BASE_URL || "https://api.qnaigc.com/v1";
export const QINIU_KEY = process.env.QINIU_API_KEY || "";

// xhuoai 中转站：慢速高价生图（nano-banana / gpt-image-*），单张 ¥1、100–400s。
export const XHUOAI_BASE = process.env.XHUOAI_BASE_URL || "https://api.xhuoai.com/v1";
export const XHUOAI_KEY = process.env.XHUOAI_API_KEY || "";

// 桌面端会显式注入 RELAY_BASE_URL（可能为空字符串）。空字符串必须视为「未配置」，
// 不能回落到项目中转站，否则用户无法使用自己的网关。
export const RELAY_BASE = normalizeOpenAIBaseUrl(
  "RELAY_BASE_URL" in process.env ? process.env.RELAY_BASE_URL || "" : "https://relay.protocom.org/v1",
);
export const RELAY_KEY = process.env.RELAY_API_KEY || "";
export const RELAY_MODEL_ID = (process.env.RELAY_MODEL_ID || "").trim();

export const ENV_MODEL_PRO = process.env.AI_MODEL_PRO || "gpt-5.6-sol";
export const ENV_MODEL_FLASH = process.env.AI_MODEL_FLASH || "z-ai/glm-5.3-flash";

export function credentialsFor(provider: ProviderKind): ProviderCredentials {
  switch (provider) {
    case "mimo": {
      const baseUrl = normalizeOpenAIBaseUrl(MIMO_BASE);
      return { baseUrl, apiKey: MIMO_KEY, configured: !!(baseUrl && MIMO_KEY) };
    }
    case "zhipu": {
      const baseUrl = normalizeOpenAIBaseUrl(ZHIPU_BASE);
      return { baseUrl, apiKey: ZHIPU_KEY, configured: !!(baseUrl && ZHIPU_KEY) };
    }
    case "relay": {
      const baseUrl = normalizeOpenAIBaseUrl(RELAY_BASE);
      return { baseUrl, apiKey: RELAY_KEY, configured: !!(baseUrl && RELAY_KEY) };
    }
    case "qiniu": {
      const baseUrl = normalizeOpenAIBaseUrl(QINIU_BASE);
      return { baseUrl, apiKey: QINIU_KEY, configured: !!(baseUrl && QINIU_KEY) };
    }
    case "xhuoai": {
      const baseUrl = normalizeOpenAIBaseUrl(XHUOAI_BASE);
      return { baseUrl, apiKey: XHUOAI_KEY, configured: !!(baseUrl && XHUOAI_KEY) };
    }
    case "siliconflow": {
      // base 不回落 AI_BASE_URL：那个变量常被指向中转站，而中转站不提供
      // Tongyi-MAI/Z-Image-Turbo，回落只会换来一个静默 404。key 仍可回落
      // AI_API_KEY——历史 .env.example 把硅基流动的 key 写在那里，且用错 key 会
      // 拿到明确的 401 而不是静默失败。
      const rawBase = process.env.SILICONFLOW_BASE_URL || SILICONFLOW_DEFAULT_BASE;
      const apiKey = process.env.SILICONFLOW_API_KEY || KEY;
      const baseUrl = normalizeOpenAIBaseUrl(rawBase);
      return {
        baseUrl,
        apiKey,
        configured: !!(baseUrl && apiKey && !baseUrl.includes("your-endpoint")),
      };
    }
  }
}