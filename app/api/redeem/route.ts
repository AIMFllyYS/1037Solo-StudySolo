import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit, requestClientIp } from "@/lib/auth/rateLimit";
import { resolveSessionUserId } from "@/lib/billing/quotaGate";
import {
  publicRedeemMessage,
  redeemCodeForUser,
  REDEEM_IP_RATE_LIMIT_MAX,
  REDEEM_PUBLIC_ERROR,
  REDEEM_RATE_LIMIT_MAX,
  REDEEM_RATE_LIMIT_WINDOW_MS,
} from "@/lib/billing/redeemCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await resolveSessionUserId(req.headers);
  if (!userId) {
    return NextResponse.json({ error: publicRedeemMessage("unauthorized") }, { status: 401 });
  }

  const userHit = consumeRateLimit(`redeem:user:${userId}`, {
    max: REDEEM_RATE_LIMIT_MAX,
    windowMs: REDEEM_RATE_LIMIT_WINDOW_MS,
  });
  const ipHit = consumeRateLimit(`redeem:ip:${requestClientIp(req.headers)}`, {
    max: REDEEM_IP_RATE_LIMIT_MAX,
    windowMs: REDEEM_RATE_LIMIT_WINDOW_MS,
  });
  if (!userHit.ok || !ipHit.ok) {
    const retryAfter = Math.max(
      userHit.ok ? 1 : userHit.retryAfterSec,
      ipHit.ok ? 1 : ipHit.retryAfterSec,
    );
    return NextResponse.json(
      { error: publicRedeemMessage("rate_limited") },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  try {
    const result = await redeemCodeForUser(userId, body.code);
    if (!result.ok) {
      return NextResponse.json({ error: REDEEM_PUBLIC_ERROR }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      tier: result.tier,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      status: result.status,
      lifetime: result.lifetime,
      isStudentVerified: result.isStudentVerified,
    });
  } catch (error) {
    console.warn("[redeem] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "统一兑换服务暂不可用，请稍后重试。" }, { status: 503 });
  }
}
