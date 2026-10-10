/** 已下架注册 id → 当前注册 id（用户本地设置兼容） */
export const LEGACY_REGISTRY_ALIASES: Record<string, string> = {
  "MiniMaxAI/MiniMax-M3": "Qwen/Qwen3.8-Flash",
  "MiniMaxAI/MiniMax-M2.5": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.6-35B-A3B": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.6-27B": "Qwen/Qwen3.8-Flash",
  "moonshotai/Kimi-K2.7-Code": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.8-27B": "Qwen/Qwen3.8-Flash",
  // 上游真实 id（Omni）回指注册表 id：落地查询/计费归集都用得上。
  "Qwen/Qwen3.8-Omni-Flash": "Qwen/Qwen3.8-Flash",
  "Pro/moonshotai/Kimi-K2.6": "kimi-k3",
  "google/gemini-3.7-flash": "google/gemini-3.8-flash",
  "deepseek-ai/DeepSeek-V4-Pro": "deepseek/deepseek-v4.1-flash",
  "deepseek-ai/DeepSeek-V4-Flash": "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4-flash": "deepseek/deepseek-v4.1-flash",
  // MiMo 2.5 整系退役：Pro 接多模态位，Flash 接快速位。
  "mimo-v2.5": "mimo-v2.6-pro",
  "mimo-v2.5-pro": "mimo-v2.6-pro",
  "mimo-v2-flash": "mimo-v2.6-flash",
  "zai-org/GLM-5.2": "z-ai/glm-5.3-flash",
  "Pro/zai-org/GLM-5.1": "z-ai/glm-5.3-flash",
  "zai-org/GLM-Z1-AirX": "z-ai/glm-5.3-flash",
  "zai-org/GLM-4.7-FlashX": "z-ai/glm-5.3-flash",
  "inclusionai/ling-3.0-flash-sante:free": "inclusionai/ling-3.0-flash-sante:free",
  // 免费档换血：LongCat 从菜单/自动路由移除，旧设置平滑迁移到 Laguna S 2.1。
  "meituan/LongCat-2.0:free": "poolside/laguna-s-2.1-free",
  "meituan/LongCat-2.0": "poolside/laguna-s-2.1-free",
};

export function normalizeRegistryId(id: string): string {
  return LEGACY_REGISTRY_ALIASES[id] ?? id;
}
