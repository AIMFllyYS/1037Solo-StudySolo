import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultAuthProcessEnv, resolvePublicAuthEnv, type PublicAuthEnv } from "./env.ts";
import { freshAccessToken } from "./browserSession.ts";

/** Browser / anon client. Do not pass the service role key here. */
export const BROWSER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

let browserDataSingleton: SupabaseClient | undefined;

function resolveBrowserEnv(env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv): PublicAuthEnv {
  if (env && "anonKey" in env && "supabaseUrl" in env && typeof env.anonKey === "string" && typeof env.supabaseUrl === "string") return { anonKey: env.anonKey, supabaseUrl: env.supabaseUrl };
  return resolvePublicAuthEnv((env ?? defaultAuthProcessEnv()) as Partial<NodeJS.ProcessEnv>);
}

/**
 * Auth-capable anon client for scripts and tests only (e.g. scripts/auth-setup.ts sends an OTP).
 * The app never uses it: in the browser the Supabase SDK must not hold a session. Do not pass
 * the service role key here.
 */
export function createBrowserAuthClient(
  env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv,
): SupabaseClient {
  const resolved = resolveBrowserEnv(env);
  return createClient(resolved.supabaseUrl, resolved.anonKey, {
    auth: { ...BROWSER_AUTH_OPTIONS },
  });
}

export function resetBrowserDataClient(): void {
  browserDataSingleton = undefined;
}

/**
 * The client the app uses for database reads and writes (RLS as the signed-in user, or anon).
 * It takes its token from the in-memory browser session on every request and has no auth
 * session of its own, so it can never hold or renew a refresh token. `client.auth` is
 * disabled on it by supabase-js; sign-in, password and MFA all happen in the Account site.
 */
export function tryGetBrowserDataClient(
  env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv,
  token: () => Promise<string | null> = freshAccessToken,
): SupabaseClient | null {
  if (browserDataSingleton) return browserDataSingleton;
  try {
    const resolved = resolveBrowserEnv(env);
    browserDataSingleton = createClient(resolved.supabaseUrl, resolved.anonKey, { accessToken: token,global:{headers:{'x-study-client-version':'2'}} });
    return browserDataSingleton;
  } catch {
    return null;
  }
}
