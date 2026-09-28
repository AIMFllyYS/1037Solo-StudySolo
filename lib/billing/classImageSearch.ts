import { configuredUnitRate } from "@/lib/billing/unitRate";

/**
 * Classolo 图片检索配置：优先课堂专属变量，其次复用站点 Unsplash 与生态服务价目表。
 * 价格未显式配置时保持禁用（未知价格绝不当作 0）。
 */
export function classImageSearchConfig(env: Partial<NodeJS.ProcessEnv> = process.env): { key: string; cnyPerCall: number } | null {
  const key = (env.CLASS_IMAGE_SEARCH_API_KEY || env.UNSPLASH_ACCESS_KEY || "").trim();
  let cost = configuredUnitRate(env.CLASS_IMAGE_SEARCH_CNY_PER_CALL);
  if (cost === null) {
    try {
      const table = JSON.parse(env.ECOSYSTEM_SERVICE_PRICES_JSON || "{}") as Record<string, unknown>;
      const value = table["image-search:unsplash"];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) cost = value;
    } catch { /* invalid table keeps the service disabled */ }
  }
  return key && cost !== null ? { key, cnyPerCall: cost } : null;
}
