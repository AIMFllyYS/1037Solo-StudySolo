/**
 * 已登录用户读自己的 usage_ledger。service_role 只在服务端按 user_id 过滤，不进浏览器。
 */

import { resolveLedgerUserId, type UsageKind } from "@/lib/billing/usageLedger";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { toUsageLedgerViewRow, type UsageLedgerViewRow } from "@/lib/billing/ledgerView";

const LEDGER_SELECT =
  "id, occurred_at, session_id, kind, selected_model_id, actual_model_id, prompt_tokens, completion_tokens, cached_tokens, image_count, cost_cny, route";

export interface UsageLedgerDbRow {
  id: string;
  occurred_at: string;
  session_id: string | null;
  kind: UsageKind | string;
  selected_model_id: string | null;
  actual_model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  image_count: number;
  cost_cny: number | string;
  route: string;
}

export type ListUsageLedgerRows = (
  userId: string,
  sessionId?: string | null,
) => Promise<UsageLedgerDbRow[]>;

export interface ReadUsageLedgerDeps {
  resolveUserId?: typeof resolveLedgerUserId;
  listRows?: ListUsageLedgerRows;
}

export async function defaultListUsageLedgerRows(
  userId: string,
  sessionId?: string | null,
): Promise<UsageLedgerDbRow[]> {
  const client = createServiceAuthClient();
  let query = client
    .from("ss_usage_ledger")
    .select(LEDGER_SELECT)
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as UsageLedgerDbRow[];
}

export async function readOwnUsageLedger(
  headers: { get(name: string): string | null },
  opts?: { sessionId?: string | null },
  deps: ReadUsageLedgerDeps = {},
): Promise<{ ok: true; records: UsageLedgerViewRow[] } | { ok: false; status: 401 | 500; error: string }> {
  const userId = await (deps.resolveUserId ?? resolveLedgerUserId)(headers);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  try {
    const rows = await (deps.listRows ?? defaultListUsageLedgerRows)(userId, opts?.sessionId);
    return { ok: true, records: rows.map((row) => toUsageLedgerViewRow(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Failed to read usage ledger",
    };
  }
}
