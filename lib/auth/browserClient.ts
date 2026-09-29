import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultAuthProcessEnv, resolvePublicAuthEnv, type PublicAuthEnv } from "./env.ts";

/** Browser / anon client. Do not pass the service role key here. */
export const BROWSER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

let browserClientSingleton: SupabaseClient | undefined;

function resolveBrowserEnv(env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv): PublicAuthEnv {
  if (env && "anonKey" in env && "supabaseUrl" in env && typeof env.anonKey === "string" && typeof env.supabaseUrl === "string") return { anonKey: env.anonKey, supabaseUrl: env.supabaseUrl };
  return resolvePublicAuthEnv((env ?? defaultAuthProcessEnv()) as Partial<NodeJS.ProcessEnv>);
}

/** Browser / anon client. Do not pass the service role key here. */
export function createBrowserAuthClient(
  env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv,
): SupabaseClient {
  const resolved = resolveBrowserEnv(env);
  return createClient(resolved.supabaseUrl, resolved.anonKey, {
    auth: { ...BROWSER_AUTH_OPTIONS },
  });
}

/** Shared browser client so persistSession / onAuthStateChange stay on one instance. */
export function getBrowserAuthClient(
  env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv,
): SupabaseClient {
  if (!browserClientSingleton) {
    browserClientSingleton = createBrowserAuthClient(env);
  }
  return browserClientSingleton;
}

export function tryGetBrowserAuthClient(
  env?: Partial<NodeJS.ProcessEnv> | PublicAuthEnv,
): SupabaseClient | null {
  try {
    return getBrowserAuthClient(env);
  } catch {
    return null;
  }
}

export function resetBrowserAuthClient(): void {
  browserClientSingleton = undefined;
}
