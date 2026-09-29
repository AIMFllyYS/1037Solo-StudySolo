import { tryGetBrowserAuthClient } from "@/lib/auth/browserClient";
import { isShareId } from "./slug.ts";
import { isSharedConversationSnapshot, type SharedConversationSnapshot } from "./types.ts";

interface RpcResponse {
  data: unknown;
  error: { message: string } | null;
}

type SharedConversationRpc = (shareId: string) => Promise<RpcResponse>;

/** 测试注入口（同 lib/profile/server.ts 的 setProfileApiTestDeps 思路）。 */
interface ShareReadTestDeps {
  rpc?: SharedConversationRpc;
}

let testDeps: ShareReadTestDeps | null = null;

export function setShareReadTestDeps(deps: ShareReadTestDeps | null): void {
  testDeps = deps;
}

async function defaultRpc(shareId: string): Promise<RpcResponse> {
  // 浏览器 anon client：公开读不需要登录态，未配置 Supabase 时这里直接返回 null。
  const client = tryGetBrowserAuthClient();
  if (!client) return { data: null, error: { message: "supabase-unconfigured" } };
  return (await client.rpc("ss_get_shared_conversation", { p_id: shareId })) as unknown as RpcResponse;
}

/**
 * 读一条公开分享，返回可直接渲染的快照。
 *
 * 分享页对「链接不存在 / 已撤回 / 已过期 / id 非法 / Supabase 没配 / 网络炸了」只能给出
 * 同一句「不存在或已撤回」（v1 不区分过期态），所以这里一律返回 null 而不抛——
 * 把失败原因分成多种既没有可操作的区别，也等于给攻击者一个探测 id 是否存在的信道。
 */
export async function readSharedConversation(shareId: string): Promise<SharedConversationSnapshot | null> {
  if (!isShareId(shareId)) return null;
  try {
    const { data, error } = await (testDeps?.rpc ?? defaultRpc)(shareId);
    if (error) return null;
    // 返回 table 的函数经 PostgREST 出来是行数组；空数组 = 不存在 / 已撤回 / 已过期。
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return null;
    const payload = (row as { payload?: unknown }).payload;
    // jsonb 在 RPC 这一跳已经没有类型了，渲染前必须自己验形状。
    return isSharedConversationSnapshot(payload) ? payload : null;
  } catch {
    return null;
  }
}
