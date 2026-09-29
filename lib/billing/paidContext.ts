import { AsyncLocalStorage } from "node:async_hooks";
import { CreditAdmissionError } from "./centralCredits";

export interface PaidContext {
  userId: string;
  requestId: string;
  route: string;
  sequence: number;
  reservedCny: number;
}
const requests = new AsyncLocalStorage<PaidContext>();
export const runPaidContext = <T>(context: PaidContext, fn: () => T): T => requests.run(context, fn);
export const optionalPaidContext = () => requests.getStore();
export function paidContext(): PaidContext {
  const context = requests.getStore();
  if (!context?.userId) throw new CreditAdmissionError("请先通过统一账号登录后调用 AI", 401);
  return context;
}
export function allocateCall(maxCny: number, model: string) {
  const context = paidContext();
  const cap = Number(process.env.ECOSYSTEM_MAX_REQUEST_CNY || "20");
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(maxCny) || maxCny < 0) throw new CreditAdmissionError("计费预算配置无效", 503);
  if (context.reservedCny + maxCny > cap) throw new CreditAdmissionError("本轮 AI 调用预算已达上限", 402);
  context.reservedCny += maxCny;
  context.sequence += 1;
  return { userId: context.userId, key: `${context.requestId}:${context.sequence}`, metadata: {
    route: context.route, model, sequence: context.sequence, accounting: "cny_microcredits_v1",
  } };
}
