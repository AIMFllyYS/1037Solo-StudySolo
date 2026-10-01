import { currentAccessToken } from "@/lib/auth/browserSession";
import { resolvePublicAuthEnv } from "@/lib/auth/env";
import { membershipLabel, normalizeNickname, type MembershipTier } from "./displayName";

export interface AccountProfile {
  userId: string;
  email: string | null;
  nickname: string | null;
  tier: MembershipTier;
  membership: string;
}

function asTier(value: unknown): MembershipTier {
  return value === "plus" || value === "pro" || value === "free" ? value : "free";
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) throw new Error("请重新登录后查看账户");
  if (!response.ok) throw new Error("账户信息暂不可用");
  const body = (await response.json()) as {
    userId?: string;
    email?: string | null;
    nickname?: string | null;
    tier?: string;
  };
  if (!body.userId) throw new Error("账户信息暂不可用");
  const tier = asTier(body.tier);
  return {
    userId: body.userId,
    email: typeof body.email === "string" ? body.email : null,
    nickname: typeof body.nickname === "string" && body.nickname.trim() ? body.nickname.trim() : null,
    tier,
    membership: membershipLabel(tier),
  };
}

export async function saveAccountNickname(nickname: string | null): Promise<AccountProfile> {
  const cleaned = nickname == null ? null : normalizeNickname(nickname);
  const response = await fetch("/api/profile", {
    method: "PATCH",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: cleaned }),
  });
  if (response.status === 401) throw new Error("请重新登录后再改昵称");
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "昵称未能保存");
  }
  const body = (await response.json()) as {
    userId?: string;
    email?: string | null;
    nickname?: string | null;
    tier?: string;
  };
  if (!body.userId) throw new Error("昵称未能保存");
  const token = currentAccessToken();
  if (token) {
    // Best effort: keep the Account-wide display name in step (Supabase Auth user metadata).
    // Uses only the short-lived access token; the browser has no SDK auth session.
    try {
      const env = resolvePublicAuthEnv();
      await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: env.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { display_name: cleaned, nickname: cleaned } }),
      });
    } catch { /* the StudySolo nickname above is already saved */ }
  }
  const tier = asTier(body.tier);
  return {
    userId: body.userId,
    email: typeof body.email === "string" ? body.email : null,
    nickname: typeof body.nickname === "string" && body.nickname.trim() ? body.nickname.trim() : null,
    tier,
    membership: membershipLabel(tier),
  };
}
