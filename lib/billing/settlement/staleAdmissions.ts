// 超时预留回收：一笔预留既没结算也没取消（流中途断开、结算请求失败、进程重启），
// 就会一直占着用户的可用额度。没有定时任务可挂，所以在用户下一次发起付费请求时，
// 顺手把「他自己的、超过 STALE_AFTER_MS 仍处于 reserved」的预留取消掉。
//
// 取费策略：这些调用的真实用量已无从核验，取消 = 不收费（平台承担）。宁可少收，
// 也不让无法核验的预留无限期占用用户额度。
import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";
import { cancelCredit } from "./centralCredits";

/** 预留超过这个时长仍未结算即视为失联。远大于单次回答的最长等待（600s）。 */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** 同一用户两次回收之间的最小间隔（进程内节流），避免每个请求都查库。 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PER_SWEEP = 20;

const lastSweep = new Map<string, number>();

interface StaleRow { request_key: string; reserved_microcredits: number; route: string }

export async function releaseStaleAdmissions(userId: string, now = Date.now()): Promise<number> {
  const last = lastSweep.get(userId);
  if (last != null && now - last < SWEEP_INTERVAL_MS) return 0;
  lastSweep.set(userId, now);
  if (lastSweep.size > 5000) lastSweep.clear();

  const db = createServiceAuthClient();
  const cutoff = new Date(now - STALE_AFTER_MS).toISOString();
  const { data, error } = await db
    .from("ss_ai_admissions")
    .select("request_key,reserved_microcredits,route")
    .eq("user_id", userId)
    .eq("state", "reserved")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_SWEEP);
  if (error || !Array.isArray(data)) return 0;

  let released = 0;
  for (const row of data as StaleRow[]) {
    try {
      await cancelCredit({
        userId,
        requestKey: row.request_key,
        reserved: row.reserved_microcredits,
        metadata: { route: row.route, reason: "stale_reservation_timeout" },
      });
      released += 1;
    } catch (err) {
      console.error("[billing] stale reservation release failed", {
        key: row.request_key, reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (released > 0) console.info("[billing] released stale reservations", { userId, released });
  return released;
}
