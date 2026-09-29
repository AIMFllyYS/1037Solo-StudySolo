import { createClient } from "@supabase/supabase-js";
import { resolvePublicAuthEnv } from "./env.ts";
import { isPaidAiApiPath } from "./paidAiRoutes.ts";
import { consumeRateLimit, type RateLimitConsumeOptions } from "./rateLimit.ts";
import { extractAccessToken } from "./sessionCookie.ts";
import { AI_LOGIN_REQUIRED_MESSAGE } from "./loginHint.ts";

export { extractAccessToken } from "./sessionCookie.ts";
export {
  isPaidAiApiPath,
  isPaidAiApiUrl,
  PAID_AI_API_PATHS,
} from "./paidAiRoutes.ts";

export const AI_GATE_UNAUTHORIZED = { error: AI_LOGIN_REQUIRED_MESSAGE } as const;
export const AI_GATE_RATE_LIMITED = { error: "Too many requests" } as const;

export interface GateUser {
  id: string;
  mfaRequired?: boolean;
  clientId?: string;
  aal?: string;
  sessionId?: string;
}

export type VerifyAccessToken = (token: string) => Promise<GateUser | null>;

export interface AiGateRequest {
  pathname: string;
  method: string;
  headers: { get(name: string): string | null };
}

export interface AiGateDeps extends RateLimitConsumeOptions {
  verifyAccessToken?: VerifyAccessToken;
  consume?: typeof consumeRateLimit;
}

export const TRUSTED_PROXY_USER_HEADER = "x-studyreview-user-id";

export type AiGateDecision =
  | { action: "next"; userId?: string }
  | {
      action: "reject";
      status: 401 | 403 | 429;
      body: { error: string };
      headers?: Record<string, string>;
    };

export function readTrustedProxyUserId(headers: { get(name: string): string | null }): string | null {
  const id = headers.get(TRUSTED_PROXY_USER_HEADER)?.trim();
  if (!id || id.length > 128) return null;
  return id;
}

export async function verifySupabaseAccessToken(token: string): Promise<GateUser | null> {
  if (!token) return null;
  try {
    const env = resolvePublicAuthEnv();
    const client = createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.getUser(token);
    const id = data.user?.id;
    if (error || !id || !data.user?.email_confirmed_at) return null;
    const verified=await client.auth.getClaims(token);
    const claims=verified.data?.claims;
    if(verified.error || !claims || claims.sub!==id || claims.iss!==`${env.supabaseUrl}/auth/v1` || claims.aud!=="authenticated")return null;
    const {createServiceAuthClient}=await import("./serviceClient");
    const profile=await createServiceAuthClient().from("user_profiles").select("account_role,is_active").eq("id",id).maybeSingle();
    if(profile.error)throw profile.error;
    if(!profile.data||profile.data.is_active!==true)return null;
    const requiresMfa=["admin","super_admin"].includes(profile.data?.account_role) || (data.user.factors??[]).some(f=>f.status==="verified");
    return {id,mfaRequired:requiresMfa && claims.aal!=="aal2",clientId:typeof claims.client_id==="string"?claims.client_id:undefined,aal:typeof claims.aal==="string"?claims.aal:undefined,sessionId:typeof claims.session_id==="string"?claims.session_id:undefined};
  } catch {
    return null;
  }
}

/**
 * Login gate for paid AI routes. No Electron / BYOK bypass — desktop and
 * bring-your-own-key users still need a Supabase session.
 */
export async function decideAiGate(
  request: AiGateRequest,
  deps: AiGateDeps = {},
): Promise<AiGateDecision> {
  if (!isPaidAiApiPath(request.pathname)) return { action: "next" };
  if (request.method.toUpperCase() === "OPTIONS") return { action: "next" };

  const token = extractAccessToken(request.headers);
  if (!token) {
    return { action: "reject", status: 401, body: { ...AI_GATE_UNAUTHORIZED } };
  }

  const verify = deps.verifyAccessToken ?? verifySupabaseAccessToken;
  let user: GateUser | null = null;
  try {
    user = await verify(token);
  } catch {
    user = null;
  }
  if (!user) {
    return { action: "reject", status: 401, body: { ...AI_GATE_UNAUTHORIZED } };
  }

  if(user.mfaRequired)return {action:"reject",status:403,body:{error:"请在统一账号中心完成两步验证"}};

  const consume = deps.consume ?? consumeRateLimit;
  const hit = consume(`user:${user.id}`, {
    now: deps.now,
    max: deps.max,
    windowMs: deps.windowMs,
  });
  if (!hit.ok) {
    return {
      action: "reject",
      status: 429,
      body: { ...AI_GATE_RATE_LIMITED },
      headers: { "Retry-After": String(hit.retryAfterSec) },
    };
  }
  return { action: "next", userId: user.id };
}
