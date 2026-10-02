import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SYNC_TABLE,
  isCloudSyncKind,
  type SyncDocumentRow,
  type SyncDocumentsApi,
} from "./types";

function asRow(value: unknown): SyncDocumentRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== "string" || typeof row.client_id !== "string") return null;
  if (!isCloudSyncKind(row.kind)) return null;
  return {
    kind: row.kind,
    client_id: row.client_id,
    payload: row.payload ?? {},
    deleted: row.deleted === true,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

export function createSupabaseSyncClient(client: SupabaseClient, userId: string): SyncDocumentsApi {
  const listPage: NonNullable<SyncDocumentsApi["listPage"]> = async (kinds, cursor) => {
    if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) return { data: [], nextCursor: null, error: { message: "同步分页游标无效" } };
    const query = client.from(SYNC_TABLE).select("id, kind, client_id, payload, deleted, updated_at").eq("user_id", userId).in("kind", [...kinds]).order("id").range(0, 99);
    const { data, error } = await (cursor ? query.gt("id", cursor) : query);
    if (error) return { data: [], nextCursor: null, error: { message: error.message } };
    const last = data?.at(-1) as { id?: unknown } | undefined;
    if ((data?.length ?? 0) === 100 && typeof last?.id !== "string") return { data: [], nextCursor: null, error: { message: "同步分页缺少稳定 id 游标" } };
    return { data: (data ?? []).map(asRow).filter((row): row is SyncDocumentRow => row !== null), nextCursor: (data?.length ?? 0) === 100 ? last!.id as string : null, error: null };
  };
  return {
    listPage,
    async list(kinds) {
      const rows:SyncDocumentRow[]=[];
      let cursor: string | undefined;
      for(let page=0;page<100;page++){
        const {data,error,nextCursor}=await listPage(kinds,cursor);
        if(error)return {data:[],error:{message:error.message}};
        rows.push(...data);
        if(!nextCursor)return {data:rows,error:null};
        cursor=nextCursor;
      }
      return {data:[],error:{message:"同步文档数量超过当前批量读取上限，请分项目导出；未应用不完整数据"}};
    },

    async get(kind, clientId) {
      const { data, error } = await client
        .from(SYNC_TABLE)
        .select("kind, client_id, payload, deleted, updated_at")
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) return { data: null, error: { message: error.message } };
      return { data: asRow(data), error: null };
    },
    async upsert(row) {
      try {
        const response=await fetch('/api/sync',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUserId:userId,row})});
        const result=await response.json();
        if(!response.ok)return {data:null,error:{message:result.error||'Cloud sync failed'}};
        return {data:asRow(result),error:null};
      }catch(error){return {data:null,error:{message:error instanceof Error?error.message:'Cloud sync unavailable'}};}

    },
  };
}

export function createMemorySyncClient(): SyncDocumentsApi & {
  rows: Map<string, SyncDocumentRow>;
  upserts: Array<{ kind: string; client_id: string; deleted: boolean; payload: unknown }>;
} {
  const rows = new Map<string, SyncDocumentRow>();
  const upserts: Array<{ kind: string; client_id: string; deleted: boolean; payload: unknown }> = [];
  let seq = 0;
  const keyOf = (kind: string, clientId: string) => `${kind}:${clientId}`;

  return {
    rows,
    upserts,
    async listPage(kinds, cursor) {
      const page = cursor === undefined ? 0 : Number(cursor);
      if (!Number.isInteger(page) || page < 0) return { data: [], nextCursor: null, error: { message: "invalid_cursor" } };
      const allow = new Set<string>(kinds);
      const matching = [...rows.values()].filter((row) => allow.has(row.kind));
      const data = matching.slice(page * 100, page * 100 + 100);
      return { data, nextCursor: (page + 1) * 100 < matching.length ? String(page + 1) : null, error: null };
    },
    async list(kinds) {
      const allow = new Set<string>(kinds);
      return {
        data: [...rows.values()].filter((row) => allow.has(row.kind)),
        error: null,
      };
    },
    async get(kind, clientId) {
      return { data: rows.get(keyOf(kind, clientId)) ?? null, error: null };
    },
    async upsert(row) {
      seq += 1;
      const stored: SyncDocumentRow = {
        kind: row.kind,
        client_id: row.client_id,
        payload: row.payload,
        deleted: row.deleted,
        updated_at: new Date(Date.now() + seq).toISOString(),
      };
      rows.set(keyOf(row.kind, row.client_id), stored);
      upserts.push({
        kind: row.kind,
        client_id: row.client_id,
        deleted: row.deleted,
        payload: row.payload,
      });
      return { data: stored, error: null };
    },
  };
}
