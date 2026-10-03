import type { NextRequest } from "next/server";
import { connectorOwner, ConnectorError } from "@/lib/connectors/actor.server";
import { sandboxConfiguration, SandboxError } from "./config.server";

const AUTHORIZED_SCOPE = Symbol("server-owned-agent-execution");
async function sandboxOwner(request: NextRequest, sensitive: boolean) {
  try { return (await connectorOwner(request, sensitive)).toLowerCase(); }
  catch (error) { if (error instanceof ConnectorError) throw new SandboxError(error.code, error.status); throw new SandboxError("ACCOUNT_UNAVAILABLE", 503); }
}
export interface SandboxScope { readonly owner: string; readonly conversationId: string; readonly canExecute: boolean; readonly [AUTHORIZED_SCOPE]: true }
export function assertSandboxScope(scope: SandboxScope | undefined): asserts scope is SandboxScope {
  if (!scope || scope[AUTHORIZED_SCOPE] !== true || !/^[a-f0-9-]{36}$/i.test(scope.owner) || !/^[A-Za-z0-9_.:-]{1,100}$/.test(scope.conversationId)) throw new SandboxError("AGENT_EXECUTION_NOT_AUTHORIZED", 403);
}
export function validateAgentSurface(request: NextRequest, conversationId: string) {
  const config = sandboxConfiguration();
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(conversationId)) throw new SandboxError("SANDBOX_CONVERSATION_REQUIRED");
  if (request.headers.get("origin") !== config.origin && request.method !== "GET") throw new SandboxError("SANDBOX_ORIGIN_REJECTED", 403);
  let referer: URL;
  try { referer = new URL(request.headers.get("referer") ?? ""); } catch { throw new SandboxError("AGENT_SURFACE_REQUIRED", 403); }
  const path = referer.pathname.replace(/\/$/, "");
  if (referer.origin !== config.origin || !(path === "/agent" || path === `/c/${encodeURIComponent(conversationId)}`)) throw new SandboxError("AGENT_SURFACE_REQUIRED", 403);
}
export async function authorizeSandbox(request: NextRequest, conversationId: string, sensitive = true): Promise<SandboxScope> {
  validateAgentSurface(request, conversationId);
  const owner = await sandboxOwner(request, sensitive);
  return Object.freeze({ owner, conversationId, canExecute: sensitive, [AUTHORIZED_SCOPE]: true as const });
}
export async function authorizeSkillInstaller(request: NextRequest): Promise<SandboxScope> {
  const config = sandboxConfiguration();
  if (request.method !== "GET" && request.headers.get("origin") !== config.origin) throw new SandboxError("SANDBOX_ORIGIN_REJECTED", 403);
  let referer: URL;
  try { referer = new URL(request.headers.get("referer") ?? ""); } catch { throw new SandboxError("AGENT_SURFACE_REQUIRED", 403); }
  if (referer.origin !== config.origin || !/^\/agent(?:\/plugins(?:\/skills\/[a-z0-9-]+)?)?\/?$/.test(referer.pathname)) throw new SandboxError("AGENT_SURFACE_REQUIRED", 403);
  const owner = await sandboxOwner(request, request.method !== "GET");
  return Object.freeze({ owner, conversationId: "skill-installation", canExecute: request.method !== "GET", [AUTHORIZED_SCOPE]: true as const });
}
export async function sandboxScopeForChat(request: NextRequest, body: { id?: string; agentMain?: boolean; noteWindowAgent?: boolean; classContext?: unknown; planMode?: boolean }): Promise<SandboxScope | undefined> {
  if (process.env.CLOUD_SANDBOX_ENABLED !== "true") return undefined;
  if (request.nextUrl.pathname.replace(/\/$/, "") !== "/api/agent/chat" || body.agentMain !== true || !body.id || body.noteWindowAgent || body.classContext || body.planMode) return undefined;
  return authorizeSandbox(request, body.id);
}
