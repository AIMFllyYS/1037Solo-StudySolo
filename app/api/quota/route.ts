import { loadQuotaSnapshot, resolveSessionUserId } from '@/lib/billing/quotaGate';
import type { QuotaView } from '@/lib/billing/quotaView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

/** User identity is derived exclusively from the verified session, never request parameters. */
export async function GET(req: Request) {
  try {
    const userId = await resolveSessionUserId(req.headers);
    if (!userId) return Response.json({ error: '请先登录以查看额度。' }, { status: 401, headers });
    const snapshot = await loadQuotaSnapshot(userId);
    if (!snapshot) return Response.json({ error: '账户额度暂不可用。' }, { status: 503, headers });
    const view: QuotaView = {
      userId, tier: snapshot.tier, sharedWallet: snapshot.sharedWallet, heldCny: snapshot.heldCny,
      periodStart: snapshot.period.start.toISOString(), periodEnd: snapshot.period.end.toISOString(),
      updatedAt: new Date().toISOString(),
      platform: { cap: snapshot.cap.platform, used: snapshot.used.platform, remaining: snapshot.remaining.platform },
      byok: { cap: snapshot.cap.byok, used: snapshot.used.byok, remaining: snapshot.remaining.byok },
    };
    return Response.json(view, { headers });
  } catch {
    return Response.json({ error: '额度服务暂不可用，请稍后重试。' }, { status: 503, headers });
  }
}
