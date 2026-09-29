// 设置页「单次输出上限」与「单轮预算上限」的取值规则。纯函数，客户端 / 服务端共用。
//
// 两个值都用 0 表示「自动」：
//  - 单次输出上限 0 → 每次调用按落地模型在注册表里声明的最大输出（models.ts maxOutputK）；
//  - 单轮预算上限 0 → 按运营上限（ECOSYSTEM_MAX_REQUEST_CNY）。用户值只能收紧运营上限。

/** 单次输出上限（token，含思考）的可选范围。 */
export const MIN_USER_MAX_OUTPUT_TOKENS = 1024;
export const MAX_USER_MAX_OUTPUT_TOKENS = 262_144;

/** 单轮预算上限（积分）的可选范围。 */
export const MIN_TURN_BUDGET_CREDITS = 0.1;
export const MAX_TURN_BUDGET_CREDITS = 10_000;

/** 非法或 ≤0 视为「跟随模型」（undefined）。 */
export function normalizeUserMaxOutputTokens(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(MAX_USER_MAX_OUTPUT_TOKENS, Math.max(MIN_USER_MAX_OUTPUT_TOKENS, Math.round(value)));
}

/** 持久化用：0 = 自动，其余夹到合法范围。 */
export function clampUserMaxOutputTokens(value: unknown): number {
  return normalizeUserMaxOutputTokens(value) ?? 0;
}

/** 持久化用：0 = 自动，其余夹到合法范围（保留两位小数）。 */
export function clampTurnBudgetCredits(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  const clamped = Math.min(MAX_TURN_BUDGET_CREDITS, Math.max(MIN_TURN_BUDGET_CREDITS, value));
  return Math.round(clamped * 100) / 100;
}
