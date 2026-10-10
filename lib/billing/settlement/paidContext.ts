import { AsyncLocalStorage } from "node:async_hooks";
import { CreditAdmissionError } from "./centralCredits";

export interface PaidContext {
  userId: string;
  requestId: string;
  route: string;
  sequence: number;
  /**
   * 本轮「已结算 + 仍在预留中」的金额（CNY）。每次模型调用先按最坏情况预留，
   * 结算或取消后用 releaseCall 退回差额——否则工具循环每一步的最坏预留会一直累加，
   * 几步之后就误触「本轮预算已达上限」，把正在进行的工具循环打断。
   */
  reservedCny: number;
  /** 用户在设置里给本轮定的预算（CNY）。只能收紧运营上限，不能放宽。 */
  budgetCny?: number;
}
const requests = new AsyncLocalStorage<PaidContext>();
export const runPaidContext = <T>(context: PaidContext, fn: () => T): T => requests.run(context, fn);
export const optionalPaidContext = () => requests.getStore();
export function paidContext(): PaidContext {
  const context = requests.getStore();
  if (!context?.userId) throw new CreditAdmissionError("请先通过统一账号登录后调用 AI", 401);
  return context;
}

/** 运营上限（CNY）：ECOSYSTEM_MAX_REQUEST_CNY，缺省 20。 */
export function operatorRequestCapCny(): number {
  const cap = Number(process.env.ECOSYSTEM_MAX_REQUEST_CNY || "20");
  if (!Number.isFinite(cap) || cap <= 0) throw new CreditAdmissionError("计费预算配置无效", 503);
  return cap;
}

/** 本轮实际生效的预算：用户设置（>0）与运营上限取小。 */
export function effectiveRequestCapCny(context: Pick<PaidContext, "budgetCny">): number {
  const cap = operatorRequestCapCny();
  const user = context.budgetCny;
  return typeof user === "number" && Number.isFinite(user) && user > 0 ? Math.min(cap, user) : cap;
}

export interface AllocatedCall {
  userId: string;
  key: string;
  maxCny: number;
  metadata: Record<string, unknown>;
}

export function allocateCall(maxCny: number, model: string): AllocatedCall {
  const context = paidContext();
  const cap = effectiveRequestCapCny(context);
  if (!Number.isFinite(maxCny) || maxCny < 0) throw new CreditAdmissionError("计费预算配置无效", 503);
  if (context.reservedCny + maxCny > cap) {
    throw new CreditAdmissionError(`本轮 AI 调用预算已达上限（${cap} 元），可在设置 → 工具中调整单轮预算`, 402);
  }
  context.reservedCny += maxCny;
  context.sequence += 1;
  return { userId: context.userId, key: `${context.requestId}:${context.sequence}`, maxCny, metadata: {
    route: context.route, model, sequence: context.sequence, accounting: "cny_microcredits_v1",
  } };
}

/**
 * 预留已结算（actualCny = 实际金额）或已取消（actualCny = 0）后退回差额。
 * 未能结算、仍处于「待核对」的预留不调用它，继续按最坏情况占用本轮预算。
 */
export function releaseCall(call: Pick<AllocatedCall, "maxCny">, actualCny: number): void {
  const context = requests.getStore();
  if (!context) return;
  const actual = Number.isFinite(actualCny) && actualCny > 0 ? Math.min(actualCny, call.maxCny) : 0;
  context.reservedCny = Math.max(0, context.reservedCny - (call.maxCny - actual));
}
