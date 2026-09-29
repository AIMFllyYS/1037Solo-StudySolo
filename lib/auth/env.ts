/**
 * Auth / SMTP env resolution. Secrets stay in process env; this module
 * never writes them to disk.
 */

export const DEFAULT_AUTH_PROJECT_REF = "zizaonaxfguvlzdcbxzw";
export const DEFAULT_AUTH_SUPABASE_URL = `https://${DEFAULT_AUTH_PROJECT_REF}.supabase.co`;

const SUPABASE_HOST_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;

export interface PublicAuthEnv {
  supabaseUrl: string;
  anonKey: string;
}

export interface ServiceAuthEnv extends PublicAuthEnv {
  serviceRoleKey: string;
}

export interface ManagementAuthEnv {
  accessToken: string;
  projectRef: string;
}

export interface SmtpEnv {
  host: string;
  port: string;
  user: string;
  pass: string;
  senderName: string;
  adminEmail: string;
}

/** Drop surrounding quotes and an inline `#` comment (`.env.local` style). */
export function stripEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
  if (quote) {
    const end = trimmed.indexOf(quote, 1);
    if (end > 0) return trimmed.slice(1, end);
  }
  const hash = trimmed.search(/\s+#/);
  return (hash >= 0 ? trimmed.slice(0, hash) : trimmed).trim();
}

function envText(env: Partial<NodeJS.ProcessEnv>, key: string): string {
  const raw = env[key];
  return raw == null ? "" : stripEnvValue(raw);
}

function definedEntries(env: Partial<NodeJS.ProcessEnv>): Partial<NodeJS.ProcessEnv> {
  const out: Partial<NodeJS.ProcessEnv> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * Next / Turbopack 只会把「写死的 `process.env.NEXT_PUBLIC_*`」打进浏览器包。
 * 默认参数 `= process.env` 或 `env["NEXT_PUBLIC_…"]` 在客户端要么是空对象，
 * 要么 `process` 根本不存在（抛错被 tryGetBrowserAuthClient 吞掉 → 登录页
 * 「Auth is not configured」）。这里的属性访问必须保持静态字面量。
 */
export function inlinedPublicAuthEnv(): Partial<NodeJS.ProcessEnv> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function liveProcessEnv(): Partial<NodeJS.ProcessEnv> | null {
  try {
    if (typeof process === "undefined") return null;
    return process.env ?? null;
  } catch {
    return null;
  }
}

/** 浏览器只用内联的 NEXT_PUBLIC_*；Node / 测试再叠上真实 process.env。 */
export function defaultAuthProcessEnv(): Partial<NodeJS.ProcessEnv> {
  const inlined = definedEntries(inlinedPublicAuthEnv());
  const live = liveProcessEnv();
  return live ? { ...live, ...inlined } : inlined;
}

function trimUrl(value: string): string {
  return stripEnvValue(value).replace(/\/+$/, "");
}

function requireSupabaseUrl(url: string): string {
  if (!SUPABASE_HOST_RE.test(url)) {
    throw new Error("SUPABASE_URL must be https://<ref>.supabase.co");
  }
  return url;
}

export function resolvePublicAuthEnv(env: Partial<NodeJS.ProcessEnv> = defaultAuthProcessEnv()): PublicAuthEnv {
  const supabaseUrl = requireSupabaseUrl(
    trimUrl(
      env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_AUTH_SUPABASE_URL,
    ),
  );
  const anonKey =
    envText(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    envText(env, "SUPABASE_ANON_KEY") ||
    envText(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    envText(env, "SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) {
    throw new Error("Need NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)");
  }
  return { supabaseUrl, anonKey };
}

export function resolveServiceAuthEnv(env: Partial<NodeJS.ProcessEnv> = defaultAuthProcessEnv()): ServiceAuthEnv {
  const pub = resolvePublicAuthEnv(env);
  const serviceRoleKey =
    envText(env, "SUPABASE_SERVICE_ROLE_KEY") || envText(env, "SUPABASE_SECRET_KEY");
  if (!serviceRoleKey) {
    throw new Error("Need SUPABASE_SERVICE_ROLE_KEY");
  }
  return { ...pub, serviceRoleKey };
}

export function resolveManagementAuthEnv(
  env: Partial<NodeJS.ProcessEnv> = defaultAuthProcessEnv(),
): ManagementAuthEnv {
  const accessToken = envText(env, "SUPABASE_ACCESS_TOKEN");
  const projectRef =
    envText(env, "SUPABASE_PROJECT_REF") ||
    envText(env, "NEXT_PUBLIC_SUPABASE_URL").match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ||
    DEFAULT_AUTH_PROJECT_REF;
  if (!accessToken) {
    throw new Error("Need SUPABASE_ACCESS_TOKEN");
  }
  return { accessToken, projectRef };
}

export function resolveSmtpEnv(env: Partial<NodeJS.ProcessEnv> = defaultAuthProcessEnv()): SmtpEnv {
  const host = envText(env, "ALIYUN_SMTP_HOST");
  const port = envText(env, "ALIYUN_SMTP_PORT") || "465";
  const user = envText(env, "ALIYUN_SMTP_USER");
  const pass = envText(env, "ALIYUN_SMTP_PASSWORD");
  const senderName = envText(env, "ALIYUN_SMTP_SENDER_NAME") || "StudySolo";
  if (!host || !user || !pass) {
    throw new Error("Need ALIYUN_SMTP_HOST, ALIYUN_SMTP_USER, ALIYUN_SMTP_PASSWORD");
  }
  return { host, port, user, pass, senderName, adminEmail: user };
}
