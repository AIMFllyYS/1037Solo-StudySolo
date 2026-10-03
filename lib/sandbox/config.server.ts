import { createHash } from "node:crypto";

export class SandboxError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

export const SANDBOX_LIMITS = Object.freeze({ lifetimeSeconds: 900, commandSeconds: 600, outputBytes: 262144, fileBytes: 20 * 1024 * 1024, textBytes: 256 * 1024, monthlyMicroCny: 100_000_000, runMicroCny: 100_000_000, activeSessions: 1, userDailySessions: 10 });
const REGIONS = ["cn-hangzhou", "cn-shanghai", "cn-beijing", "cn-shenzhen", "cn-hongkong", "ap-southeast-1", "us-east-1", "us-west-1"];
export function sandboxConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  if (Object.keys(env).some(name => /^NEXT_PUBLIC_.*(?:CLOUD_SANDBOX|E2B).*(?:KEY|SECRET|TOKEN)/.test(name) && env[name])) throw new SandboxError("SANDBOX_PUBLIC_CREDENTIAL_FORBIDDEN", 503);
  if (env.CLOUD_SANDBOX_ENABLED !== "true") throw new SandboxError("SANDBOX_NOT_ENABLED", 503);
  const region = env.CLOUD_SANDBOX_REGION ?? "cn-hangzhou";
  if (!REGIONS.includes(region)) throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503);
  const domain = env.CLOUD_SANDBOX_DOMAIN ?? `${region}.sandbox.aliyuncs.com`;
  if (![`${region}.sandbox.aliyuncs.com`, `${region}.e2b.fc.aliyuncs.com`].includes(domain)) throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503);
  const apiUrl = env.CLOUD_SANDBOX_API_URL ?? `https://api.${domain}`;
  if (apiUrl !== `https://api.${domain}`) throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503);
  const apiKey = env.CLOUD_SANDBOX_API_KEY?.trim();
  if (!apiKey || apiKey.length < 25 || apiKey.length > 512 || /[\s\0]/.test(apiKey)) throw new SandboxError("SANDBOX_CREDENTIALS_MISSING", 503);
  const template = env.CLOUD_SANDBOX_TEMPLATE?.trim();
  if (!template || !/^[A-Za-z0-9_.:/-]{1,128}$/.test(template)) throw new SandboxError("SANDBOX_TEMPLATE_MISSING", 503);
  const origin = env.CLOUD_SANDBOX_APP_ORIGIN ?? (env.NODE_ENV === "production" ? "https://studysolo.1037solo.com" : "http://localhost:35349");
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503); }
  if (parsed.origin !== origin || parsed.username || parsed.password || (env.NODE_ENV === "production" ? parsed.protocol !== "https:" : !["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503);
  const key = env.CLOUD_SANDBOX_ENCRYPTION_KEY;
  if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, "base64").length !== 32) throw new SandboxError("SANDBOX_ENCRYPTION_KEY_MISSING", 503);
  // Account-wide infrastructure cap, independent of user credit billing. Cannot be raised past human-approved ¥100.
  const cap = (name: string, ceiling: number) => {
    const amount = Number(env[name] ?? ceiling / 1_000_000);
    if (!Number.isFinite(amount) || amount <= 0 || amount * 1_000_000 > ceiling) throw new SandboxError("SANDBOX_BUDGET_INVALID", 503);
    return Math.floor(amount * 1_000_000);
  };
  // Keep room for template/snapshot storage and preparation outside task compute.
  // This is a conservative allowance, not a claim about the actual invoice.
  const fixedCostCny = Number(env.CLOUD_SANDBOX_FIXED_COST_CNY ?? 30);
  if (!Number.isFinite(fixedCostCny) || fixedCostCny < 0 || fixedCostCny > 100) throw new SandboxError("SANDBOX_BUDGET_INVALID", 503);
  const fixedMicroCny = Math.ceil(fixedCostCny * 1_000_000);
  const monthlyMicroCny = cap("CLOUD_SANDBOX_MONTHLY_BUDGET_CNY", SANDBOX_LIMITS.monthlyMicroCny) - fixedMicroCny;
  const runMicroCny = cap("CLOUD_SANDBOX_RUN_BUDGET_CNY", SANDBOX_LIMITS.runMicroCny) - fixedMicroCny;
  if (monthlyMicroCny <= 0 || runMicroCny <= 0) throw new SandboxError("SANDBOX_BUDGET_INVALID", 503);
  const runId = env.CLOUD_SANDBOX_BUDGET_RUN_ID ?? "studysolo-2026-10-04";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new SandboxError("SANDBOX_CONFIGURATION_INVALID", 503);
  const configHash = createHash("sha256").update([region, apiUrl, domain, template, apiKey].join("\0")).digest("hex");
  return { region, domain, apiUrl, apiKey, template, origin, key: Buffer.from(key, "base64"), configHash, monthlyMicroCny, runMicroCny, runId };
}

export function safeRelativePath(value = ".") {
  if (!value || value.length > 256 || value.startsWith("/") || /[\\\0\r\n]/.test(value) || value.split("/").some(part => part === "..")) throw new SandboxError("SANDBOX_PATH_INVALID");
  return value;
}
export function sandboxFailure(error: unknown) {
  const known = error instanceof SandboxError;
  return Response.json({ code: known ? error.code : "SANDBOX_UNAVAILABLE" }, { status: known ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
}
