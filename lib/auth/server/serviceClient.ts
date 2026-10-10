import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultAuthProcessEnv, resolveServiceAuthEnv, type ServiceAuthEnv } from "../env.ts";

/**
 * Service-role client (Auth Admin + RLS bypass). Server / scripts only.
 * Never import this from a Client Component.
 */
export function createServiceAuthClient(
  env?: Partial<NodeJS.ProcessEnv> | ServiceAuthEnv,
): SupabaseClient {
  const resolved: ServiceAuthEnv =
    env && "serviceRoleKey" in env && typeof env.serviceRoleKey === "string" && typeof env.supabaseUrl === "string"
      ? { serviceRoleKey: env.serviceRoleKey, supabaseUrl: env.supabaseUrl, anonKey: env.anonKey ?? "" }
      : resolveServiceAuthEnv((env ?? defaultAuthProcessEnv()) as Partial<NodeJS.ProcessEnv>);
  return createClient(resolved.supabaseUrl, resolved.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
