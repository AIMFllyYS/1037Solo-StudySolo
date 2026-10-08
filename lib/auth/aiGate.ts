import {verifyAccount} from './sign-in/account-verify';
import {accountBackendUrl,authModeForHost} from './authMode';
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
      status: 401 | 403 | 429 | 503;
      body: { error: string; code?:string };
      headers?: Record<string, string>;
    };

export function readTrustedProxyUserId(headers: { get(name: string): string | null }): string | null {
  const id = headers.get(TRUSTED_PROXY_USER_HEADER)?.trim();
  if (!id || id.length > 128) return null;
  return id;
}

/** Compatibility name; canonical identity comes only from Account introspection. */
export async function verifySupabaseAccessToken(token: string): Promise<GateUser | null> {
  const result=await verifyAccount(token,{accountBackendUrl:accountBackendUrl('account-shared')});
  if(result.kind!=='ok')return null;
  const identity=result.identity as typeof result.identity & {client_id?:string};
  return {id:identity.user_id,mfaRequired:identity.mfa_required,aal:identity.aal,sessionId:identity.session_id,clientId:identity.client_id};
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

  let user: GateUser | null = null;
  try {
    if(deps.verifyAccessToken)user=await deps.verifyAccessToken(token);
    else{
      const result=await verifyAccount(token,{accountBackendUrl:accountBackendUrl(authModeForHost(request.headers.get('host')??''))});
      if(result.kind==='unavailable')return {action:'reject',status:503,body:{error:'统一账号服务暂不可用，登录状态已保留。',code:'ACCOUNT_UNAVAILABLE'},headers:{'Retry-After':'5'}};
      if(result.kind==='forbidden')return {action:'reject',status:403,body:{error:'当前账号尚未通过统一账号验证。',code:result.code}};
      if(result.kind==='ok')user={id:result.identity.user_id,mfaRequired:result.identity.mfa_required};
    }
  } catch { return {action:'reject',status:503,body:{error:'统一账号服务暂不可用。',code:'ACCOUNT_UNAVAILABLE'}}; }
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
