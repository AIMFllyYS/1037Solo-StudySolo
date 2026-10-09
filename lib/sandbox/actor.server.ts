import type { NextRequest } from "next/server";
import { connectorOwner, ConnectorError } from "@/lib/connectors/actor.server";
import { sandboxAppOrigin, SandboxError } from "./config.server";
import type { SandboxAction } from "./types";

const AUTHORIZED_SCOPE = Symbol("server-owned-agent-execution");
/**
 * 云沙箱的「近期验证」窗口。原先沿用连接器的 10 分钟：用户每次跑沙箱都被要求重新验证身份，属于过度防御——
 * 沙箱本身已经有登录态 + 会话归属 + 同源/来源面 + 账号变更(ACCOUNT_CHANGED)等多层校验，
 * 且只在 Agent 主对话里可用。这里放宽为「一次登录验证 12 小时内有效」，仍保留 MFA 已登录要求；
 * 连接器等其它高敏操作仍用默认 10 分钟。
 */
export const SANDBOX_RECENT_AUTH_MAX_AGE_SEC = 12 * 60 * 60;
async function sandboxOwner(request: NextRequest, sensitive: boolean) {
  try { return (await connectorOwner(request, sensitive, SANDBOX_RECENT_AUTH_MAX_AGE_SEC)).toLowerCase(); }
  catch (error) { if (error instanceof ConnectorError) throw new SandboxError(error.code, error.status); throw new SandboxError("ACCOUNT_UNAVAILABLE", 503); }
}
export interface SandboxScope { readonly owner: string; readonly conversationId: string; readonly canExecute: boolean; readonly authorizeOperation?: (action: SandboxAction) => Promise<SandboxScope>; readonly [AUTHORIZED_SCOPE]: true }
/** Reducing an existing resource's exposure/cost is not a new execution grant. */
export function sandboxActionRequiresRecentAuth(action: SandboxAction) { return ["open", "exec", "write", "publish"].includes(action); }
export function assertSandboxScope(scope: SandboxScope | undefined): asserts scope is SandboxScope {
  if (!scope || scope[AUTHORIZED_SCOPE] !== true || !/^[a-f0-9-]{36}$/i.test(scope.owner) || !/^[A-Za-z0-9_.:-]{1,100}$/.test(scope.conversationId)) throw new SandboxError("AGENT_EXECUTION_NOT_AUTHORIZED", 403);
}
export function validateAgentSurface(request: NextRequest, conversationId: string) {
  const origin = sandboxAppOrigin();
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(conversationId)) throw new SandboxError("SANDBOX_CONVERSATION_REQUIRED");
  if (request.headers.get("origin") !== origin && request.method !== "GET") throw new SandboxError("SANDBOX_ORIGIN_REJECTED", 403);
  let referer: URL;
  try { referer = new URL(request.headers.get("referer") ?? ""); } catch { throw new SandboxError("AGENT_SURFACE_REQUIRED", 403); }
  const path = referer.pathname.replace(/\/$/, "");
  if (referer.origin !== origin || !(path === "/agent" || path === `/c/${encodeURIComponent(conversationId)}`)) throw new SandboxError("AGENT_SURFACE_REQUIRED", 403);
}
export async function authorizeSandbox(request: NextRequest, conversationId: string, sensitive = true): Promise<SandboxScope> {
  validateAgentSurface(request, conversationId);
  const owner = await sandboxOwner(request, sensitive);
  return Object.freeze({ owner, conversationId, canExecute: sensitive, [AUTHORIZED_SCOPE]: true as const });
}
export async function authorizeSkillInstaller(request: NextRequest): Promise<SandboxScope> {
  const origin = sandboxAppOrigin();
  if (request.method !== "GET" && request.headers.get("origin") !== origin) throw new SandboxError("SANDBOX_ORIGIN_REJECTED", 403);
  let referer: URL;
  try { referer = new URL(request.headers.get("referer") ?? ""); } catch { throw new SandboxError("AGENT_SURFACE_REQUIRED", 403); }
  if (referer.origin !== origin || !/^\/agent(?:\/plugins(?:\/skills\/[a-z0-9-]+)?)?\/?$/.test(referer.pathname)) throw new SandboxError("AGENT_SURFACE_REQUIRED", 403);
  const owner = await sandboxOwner(request, request.method !== "GET");
  return Object.freeze({ owner, conversationId: "skill-installation", canExecute: request.method !== "GET", [AUTHORIZED_SCOPE]: true as const });
}
export async function sandboxScopeForChat(request: NextRequest, body: { id?: string; agentMain?: boolean; noteWindowAgent?: boolean; classContext?: unknown; planMode?: boolean }): Promise<SandboxScope | undefined> {
  if (process.env.CLOUD_SANDBOX_ENABLED !== "true") return undefined;
  if (request.nextUrl.pathname.replace(/\/$/, "") !== "/api/agent/chat" || body.agentMain !== true || !body.id || body.noteWindowAgent || body.classContext || body.planMode) return undefined;
  const scope = await authorizeSandbox(request, body.id, false);
  return Object.freeze({ ...scope, authorizeOperation: async (action: SandboxAction) => {
    const live = await authorizeSandbox(request, scope.conversationId, false);
    if (live.owner !== scope.owner) throw new SandboxError("ACCOUNT_CHANGED", 409);
    const current = await authorizeSandbox(request, scope.conversationId, sandboxActionRequiresRecentAuth(action));
    if (current.owner !== scope.owner) throw new SandboxError("ACCOUNT_CHANGED", 409);
    return current;
  } });
}
