import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GET as probeGET } from "@/lib/browser/probeEmbed";
import { consumeRateLimit, requestClientIp } from "@/lib/auth/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 匿名可打的出站探测：按 IP 限个宽松的窗口，防止被当成公网扫描器滥用。 */
const CAN_EMBED_IP_RATE_LIMIT_MAX = 60;

export async function GET(req: NextRequest) {
  const hit = consumeRateLimit(`can-embed:${requestClientIp(req.headers)}`, {
    max: CAN_EMBED_IP_RATE_LIMIT_MAX,
  });
  if (!hit.ok) {
    // 与 probe-failed 一致放行内嵌：限流只是探测不可用的一种形态。
    return NextResponse.json(
      { embeddable: true, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(hit.retryAfterSec) } },
    );
  }
  return probeGET(req);
}
