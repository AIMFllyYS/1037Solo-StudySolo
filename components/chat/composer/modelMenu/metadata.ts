import { Gift, Zap, Layers, Crown, Image as ImageIcon, Brain, Wrench, type LucideIcon } from "lucide-react";

import { modelMenuCategories, type ModelInfo } from "@/lib/ai/models";

export const CATEGORIES = ["免费模型", "快速模型", "多模态模型", "旗舰模型", "生图模型"];
export const CATEGORY_ICONS: Record<string, LucideIcon> = { '免费模型': Gift, '快速模型': Zap, '多模态模型': Layers, '旗舰模型': Crown, '生图模型': ImageIcon };
/** 分类中文名 → 词典 key。分类名同时是 series 状态与 CATEGORY_ICONS 的标识，保持中文不动，只在渲染时翻译。 */
export const CATEGORY_LABEL_KEYS: Record<string, string> = {
  "免费模型": "menu.model.category.free",
  "快速模型": "menu.model.category.fast",
  "多模态模型": "menu.model.category.multimodal",
  "旗舰模型": "menu.model.category.flagship",
  "生图模型": "menu.model.category.image",
};
/**
 * 分类专属色：全部走主题 token（MD3 / 语义色），light / dark / colorful / custom 外观自动适配。
 * 同一颜色同时驱动分类行图标与模型行右侧的特征圆点，形成「分类↔圆点」的视觉对应。
 */
export const CATEGORY_COLORS: Record<string, string> = {
  "免费模型": "var(--color-success)",
  "快速模型": "var(--color-warning)",
  "多模态模型": "var(--color-info)",
  "旗舰模型": "var(--md-sys-color-primary)",
  "生图模型": "var(--md-sys-color-secondary)",
};

/** 模型行右侧特征圆点的语义类型：前五个对应菜单分类，后两个是能力标签。 */
export type ModelTrait = "flagship" | "free" | "fast" | "multimodal" | "image" | "thinking" | "tools";

export const TRAIT_META: Record<ModelTrait, { icon: LucideIcon; color: string; labelKey: string }> = {
  flagship: { icon: Crown, color: "var(--md-sys-color-primary)", labelKey: "menu.model.category.flagship" },
  free: { icon: Gift, color: "var(--color-success)", labelKey: "menu.model.category.free" },
  fast: { icon: Zap, color: "var(--color-warning)", labelKey: "menu.model.category.fast" },
  multimodal: { icon: Layers, color: "var(--color-info)", labelKey: "menu.model.category.multimodal" },
  image: { icon: ImageIcon, color: "var(--md-sys-color-secondary)", labelKey: "menu.model.category.image" },
  thinking: { icon: Brain, color: "var(--md-sys-color-tertiary)", labelKey: "menu.model.badge.thinking" },
  tools: { icon: Wrench, color: "var(--ink-soft)", labelKey: "menu.model.badge.tools" },
};

/** 菜单分类名 → 特征类型（CATEGORIES 全集，含归一化后的「多模态模型」）。 */
const CATEGORY_TRAIT: Record<string, ModelTrait> = {
  "旗舰模型": "flagship",
  "免费模型": "free",
  "快速模型": "fast",
  "多模态模型": "multimodal",
  "生图模型": "image",
};

const TRAIT_ORDER = Object.keys(TRAIT_META) as ModelTrait[];

/**
 * 模型的全部特征（分类归属 + 能力），按 TRAIT_META 声明顺序输出。
 * 分类归属含 extraGroups 多重归属；视觉模型补 multimodal、生图模型补 image。
 */
export function modelTraits(model: ModelInfo): ModelTrait[] {
  const set = new Set<ModelTrait>();
  for (const cat of modelMenuCategories(model)) {
    const trait = CATEGORY_TRAIT[cat];
    if (trait) set.add(trait);
  }
  if (model.vision) set.add("multimodal");
  if (model.type === "image") set.add("image");
  if (model.thinking) set.add("thinking");
  if (model.tools) set.add("tools");
  return TRAIT_ORDER.filter((t) => set.has(t));
}

/** 一次最多渲染 3 个特征圆点；超出用「⋯」圆点收尾（tooltip 列出全部特征）。 */
export const MAX_TRAIT_DOTS = 3;
export function formatContextWindow(k?: number): string | null {
  if (!k || k <= 0) return null;
  return k >= 1000 ? `${Number((k / 1000).toFixed(2))}M` : `${k}K`;
}

/**
 * 分类行右侧的品牌图标圆点簇：每个圆框 = 该分类内一个模型品牌。
 * 最多铺 4 个，超出收敛为一个「⋯」圆点；悬停看该品牌下的模型名。
 */
export const MAX_BRAND_DOTS = 3;
