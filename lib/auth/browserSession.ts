/**
 * The browser's only copy of the sign-in: the short-lived access token from
 * `/api/account/session`, held in memory. There is no refresh token here and the
 * Supabase SDK keeps no session of its own — renewal happens on the server
 * (`restoreAccountSession()` re-asks it), so nothing long-lived is reachable from page JS.
 */
import type { AuthSessionPayload } from "./session.ts";

export interface BrowserSession {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
  user: { id: string; email: string | null; user_metadata: Record<string, unknown> };
}

let current: BrowserSession | null = null;
const listeners = new Set<(session: BrowserSession | null) => void>();

export function getBrowserSession(): BrowserSession | null {
  return current;
}

export function setBrowserSession(next: BrowserSession | null): void {
  current = next;
  for (const listener of listeners) listener(next);
}

export function onBrowserSessionChange(listener: (session: BrowserSession | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The access token if it is still good for `marginSec` more seconds. */
export function currentAccessToken(marginSec = 0, now = Date.now()): string | null {
  return current && current.expiresAt - marginSec > now / 1000 ? current.accessToken : null;
}

let renew: (() => Promise<unknown>) | null = null;
/** account.ts registers how to ask the server again (restoreAccountSession). */
export function setAccessTokenRenewer(fn: (() => Promise<unknown>) | null): void {
  renew = fn;
}

/**
 * A usable access token for this page. Within a minute of expiry it asks the server again
 * (the server renews from its HttpOnly cookie); there is no refresh token in the browser.
 */
export async function freshAccessToken(): Promise<string | null> {
  const token = currentAccessToken(60);
  if (token || !current || !renew) return token ?? currentAccessToken();
  try { await renew(); } catch { /* keep the old token; the API answers 401 if it is really gone */ }
  return currentAccessToken();
}

/** Same shape the old SDK session had, for code that reads `{ access_token, user }`. */
export function browserSessionPayload(session: BrowserSession | null = current): AuthSessionPayload | null {
  return session ? { access_token: session.accessToken, user: session.user } : null;
}

/** Parses the server's answer, keeping only the access token and user (anything else is dropped). */
export function parseBrowserSession(body: unknown): BrowserSession | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const user = value.user as Record<string, unknown> | undefined;
  if (typeof value.access_token !== "string" || !value.access_token) return null;
  if (typeof value.expires_at !== "number" || !user || typeof user.id !== "string" || !user.id) return null;
  const meta = user.user_metadata;
  return {
    accessToken: value.access_token,
    expiresAt: value.expires_at,
    user: {
      id: user.id,
      email: typeof user.email === "string" && user.email ? user.email : null,
      user_metadata: meta && typeof meta === "object" ? meta as Record<string, unknown> : {},
    },
  };
}
