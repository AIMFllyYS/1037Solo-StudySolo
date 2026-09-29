import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import type { SharedConversationSnapshot, SharedLinkSummary } from "./types.ts";

/** 表名常量：route、测试与将来的撤回接口共用一处，避免三处写错同一个名字。 */
export const SHARED_CONVERSATIONS_TABLE = "ss_shared_conversations";

export interface SharedConversationInsert {
  id: string;
  /** 服务端从已鉴权用户取；客户端传什么都不作数。 */
  ownerId: string;
  sourceClientId: string;
  title: string;
  payload: SharedConversationSnapshot;
}

export interface ShareStore {
  create(row: SharedConversationInsert): Promise<void>;
  /** 只列自己的（owner 过滤在 store 里，route 拿到什么 id 都越不过去）。 */
  list(ownerId: string): Promise<SharedLinkSummary[]>;
  /** 返回 false 表示这条分享不存在或不属于这个人。 */
  setEnabled(ownerId: string, id: string, enabled: boolean): Promise<boolean>;
}

/** 测试注入口（同 lib/profile/server.ts 的 setProfileApiTestDeps 思路）。 */
interface ShareApiTestDeps {
  store?: ShareStore;
}

let testDeps: ShareApiTestDeps | null = null;

export function setShareApiTestDeps(deps: ShareApiTestDeps | null): void {
  testDeps = deps;
}

function defaultStore(): ShareStore {
  return {
    async create(row) {
      // service_role 绕过 RLS：owner_id 只能由这里写死，请求体里的 owner 字段在 route 就被丢了。
      const client = createServiceAuthClient();
      const { error } = await client.from(SHARED_CONVERSATIONS_TABLE).insert({
        id: row.id,
        owner_id: row.ownerId,
        source_client_id: row.sourceClientId,
        title: row.title,
        payload: row.payload,
      });
      if (error) throw new Error(error.message);
    },

    async list(ownerId) {
      const client = createServiceAuthClient();
      const { data, error } = await client
        .from(SHARED_CONVERSATIONS_TABLE)
        .select("id, title, created_at, revoked_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String((row as { id: unknown }).id ?? ""),
        title: String((row as { title: unknown }).title ?? ""),
        createdAt: String((row as { created_at: unknown }).created_at ?? ""),
        revoked: Boolean((row as { revoked_at: unknown }).revoked_at),
      }));
    },

    async setEnabled(ownerId, id, enabled) {
      const client = createServiceAuthClient();
      const { data, error } = await client
        .from(SHARED_CONVERSATIONS_TABLE)
        .update({ revoked_at: enabled ? null : new Date().toISOString() })
        // owner 过滤不能省：id 是客户端传上来的，少了这一条就能关掉别人的分享。
        .eq("owner_id", ownerId)
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    },
  };
}

export async function saveSharedConversation(row: SharedConversationInsert): Promise<void> {
  await (testDeps?.store ?? defaultStore()).create(row);
}

export async function listSharedConversations(ownerId: string): Promise<SharedLinkSummary[]> {
  return (testDeps?.store ?? defaultStore()).list(ownerId);
}

export async function setSharedConversationEnabled(ownerId: string, id: string, enabled: boolean): Promise<boolean> {
  return (testDeps?.store ?? defaultStore()).setEnabled(ownerId, id, enabled);
}
