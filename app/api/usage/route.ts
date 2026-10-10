import { NextResponse, type NextRequest } from "next/server";
import { readOwnUsageLedger } from "@/lib/billing/ledger/readUsageLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 只读台账。登录校验在路由内完成，不进 #63 付费闸门 / proxy matcher。
 */
export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  const result = await readOwnUsageLedger(req.headers, { sessionId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ records: result.records });
}
