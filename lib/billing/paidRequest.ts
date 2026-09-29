import { resolveLedgerUserId } from "./usageLedger";
import { runPaidContext } from "./paidContext";
import { CreditAdmissionError } from "./centralCredits";

export function withPaidRequest<T extends Request>(handler: (request: T) => Promise<Response>, route: string) {
  return async (request: T): Promise<Response> => {
    const userId = await resolveLedgerUserId(request.headers);
    if (!userId) return Response.json({ error: "请先登录并完成两步验证", code: "authentication_required" }, { status: 401 });
    const key = request.headers.get("idempotency-key") || crypto.randomUUID();
    if (!/^[A-Za-z0-9:_-]{8,100}$/.test(key)) return Response.json({ error: "请求标识格式无效" }, { status: 400 });
    try {
      return await runPaidContext({ userId, requestId: key, route, sequence: 0, reservedCny: 0 }, () => handler(request));
    } catch (error) {
      if (error instanceof CreditAdmissionError) return Response.json({ error: error.message, code: "credit_admission_failed" }, { status: error.status });
      // Provider errors are normalized inside each existing route; do not expose unknown details here.
      return Response.json({ error: "AI 服务暂时不可用", code: "ai_unavailable" }, { status: 503 });
    }
  };
}
