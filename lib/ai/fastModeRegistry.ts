/**
 * Fast 模式注册表（模型菜单「思考」板块左上角的闪电）。
 *
 * 规则：只有在这里登记过「标准模型 ↔ Fast 变体」配对的模型，闪电才可点击；
 * 其余模型闪电置灰。Fast 不是新的计费或路由开关，而是在配对的两个模型 id 之间切换：
 * 开启 = 选中 Fast 变体，关闭 = 回到标准模型，思考深度沿用并按目标模型的合法档位收敛。
 *
 * 新增一对：在 FAST_MODE_PAIRS 里加一行，并保证两个 id 都在 lib/ai/models.ts 的 MODELS 中；
 * 同时更新 docs/plans/Agent-refactor/MODELS.md 的「Fast 模式注册表」一节。
 * lib/ai/fastModeRegistry.test.tsx 会校验每个 id 都真实存在。
 */
export interface FastModePair {
  /** 标准模型 id。 */
  base: string;
  /** Fast 变体 id。 */
  fast: string;
}

export const FAST_MODE_PAIRS: readonly FastModePair[] = [
  { base: "mimo-v2.6-pro", fast: "xiaomi/mimo-v2.6-pro-ultraspeed" },
];

/** 配对里的另一端；没有注册返回 undefined。 */
export function fastModeCounterpart(modelId: string): string | undefined {
  for (const pair of FAST_MODE_PAIRS) {
    if (pair.base === modelId) return pair.fast;
    if (pair.fast === modelId) return pair.base;
  }
  return undefined;
}

export function supportsFastMode(modelId: string): boolean {
  return fastModeCounterpart(modelId) !== undefined;
}

export function isFastVariant(modelId: string): boolean {
  return FAST_MODE_PAIRS.some((pair) => pair.fast === modelId);
}
