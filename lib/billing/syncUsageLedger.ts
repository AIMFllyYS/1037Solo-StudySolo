/**
 * 客户端把服务端台账灌进 billing store。失败时保留本地记录，不按当前模型重算。
 */

import {
  billingRecordsFromLedger,
  mergeLedgerWithLocal,
  toUsageLedgerViewRow,
  type UsageLedgerViewRow,
} from "@/lib/billing/ledgerView";
import { useSettings } from "@/lib/stores/settings";
import { useBillingStore } from "@/lib/stores/billing";

export async function fetchUsageLedgerRows(
  fetchImpl: typeof fetch = fetch,
): Promise<UsageLedgerViewRow[] | null> {
  try {
    const res = await fetchImpl("/api/usage", { method: "GET", credentials: "same-origin" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as { records?: unknown };
    if (!Array.isArray(body.records)) return null;
    return body.records
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((row) => toUsageLedgerViewRow(row));
  } catch {
    return null;
  }
}

/** 成功拉到台账则整表替换；未登录 / 失败则不动 store。 */
export async function refreshBillingFromLedger(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const rows = await fetchUsageLedgerRows(fetchImpl);
  if (!rows) return false;
  const customGroups = useSettings.getState().customApiGroups;
  const server = billingRecordsFromLedger(rows, customGroups);
  const merged = mergeLedgerWithLocal(server, useBillingStore.getState().records);
  useBillingStore.getState().replaceFromLedger(merged);
  return true;
}
