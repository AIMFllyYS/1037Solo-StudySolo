/**
 * What `/api/account/session` hands to the browser: the 1-hour access token and who it belongs
 * to — never the refresh token. Renewal stays on the server, where the refresh token lives in an
 * HttpOnly cookie (Account integration protocol §6, §8). Only call this with a token the server
 * has already verified; the claims are read, not re-checked, here.
 */
export interface BrowserSessionBody {
  access_token: string;
  /** Unix seconds. */
  expires_at: number;
  user: { id: string; email: string | null; user_metadata: Record<string, unknown> };
}

function claimsOf(token: string): Record<string, unknown> {
  try {
    const json = Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8");
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function browserSessionBody(accessToken: string, userId: string): BrowserSessionBody {
  const claims = claimsOf(accessToken);
  const meta = claims.user_metadata;
  return {
    access_token: accessToken,
    expires_at: typeof claims.exp === "number" ? claims.exp : Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      email: typeof claims.email === "string" && claims.email ? claims.email : null,
      user_metadata: meta && typeof meta === "object" ? meta as Record<string, unknown> : {},
    },
  };
}
