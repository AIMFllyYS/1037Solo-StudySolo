/** Account-bound OAuth handshake; production configuration and the encrypted store remain gated. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { connectorOrigin, googleConnectorConfiguration, githubConnectorConfiguration } from "./config.server";
import { readRecord, writeRecord, claimRecord } from "./development-vault.server";
import { withLease, createRecordOnce } from "./persistence.server";
import { connectorOwner, requireConnectorOrigin, connectorFailure } from "./actor.server";
import { connectorResponseJson } from "./response.server";
import { connectorBrowserFailure } from "./browser-result.server";

export const DEVELOPMENT_PROVIDERS = ["notion", "todoist", "google", "github"] as const;
export type DevelopmentProvider = typeof DEVELOPMENT_PROVIDERS[number];
type Client = { clientId: string; clientSecret?: string; authMethod: "none" | "client_secret_post"; callback: string; authorization: string; token: string; issuer: string; resource?: string; scope: string };
type Pending = { owner: string; provider: DevelopmentProvider; state: string; verifier: string; bindingHash: string; expiresAt: number; client: Client };
export type DevelopmentGrant = { owner: string; provider: DevelopmentProvider | "zotero"; accountId: string; accountLabel?: string; accessToken: string; refreshToken?: string; expiresAt: number | null; scope: string; issuer: string; resource?: string; callback: string; createdAt: string; defaultWritePolicy: "disabled" };
type Grant = DevelopmentGrant;
const random = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function equalDigest(a: string, b: string) { return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const error = (code: string, status = 400) => NextResponse.json({ code }, { status, headers });
export function developmentProvider(value: string): DevelopmentProvider | null { return DEVELOPMENT_PROVIDERS.includes(value as DevelopmentProvider) ? value as DevelopmentProvider : null; }

/** A normal link avoids browser differences in CSP enforcement across form redirect chains. */
export function developmentAuthorizationPage(url: URL, provider: string) {
  const href = url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>关联 ${provider}</title><h1>关联 ${provider}</h1><p>下一页将由服务提供者显示具体授权范围。完成后回到学习服务管理。</p><p><a href="${href}">继续前往 ${provider} 授权</a></p></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" } });
}

export function requireDevelopment(request: NextRequest) {
  if (process.env.NODE_ENV === "production") throw error("DEVELOPMENT_AUTH_ONLY", 403);
  const origin = connectorOrigin();
  if (request.nextUrl.origin !== origin || request.headers.get("host") !== new URL(origin).host) throw error("ORIGIN_REJECTED", 403);
  return origin;
}

export async function ownerOf(request: NextRequest) {
  try { return await connectorOwner(request, true); } catch (cause) { throw connectorFailure(cause); }
}

async function jsonRequest(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  return connectorResponseJson(response);
}

async function clientFor(provider: DevelopmentProvider, origin: string): Promise<Client> {
  const callback = `${origin}/api/connectors/${provider}/callback/`;
  if (provider === "google") {
    const config = googleConnectorConfiguration();
    return { clientId: config.clientId, clientSecret: config.clientSecret, callback, authMethod: "client_secret_post", authorization: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", issuer: "https://accounts.google.com", scope: config.scopes.join(" ") };
  }
  if (provider === "github") {
    const config = githubConnectorConfiguration();
    return { clientId: config.clientId, clientSecret: config.clientSecret, callback, authMethod: "client_secret_post", authorization: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", issuer: "https://github.com", scope: "" };
  }
  const expected = provider === "notion"
    ? { issuer: "https://mcp.notion.com/", authorization: "https://mcp.notion.com/authorize", token: "https://mcp.notion.com/token", register: "https://mcp.notion.com/register", resource: "https://mcp.notion.com/mcp", scope: "default" }
    : { issuer: "https://todoist.com/", authorization: "https://todoist.com/oauth/authorize", token: "https://todoist.com/oauth/access_token", register: "https://todoist.com/oauth/register", resource: "https://ai.todoist.net/mcp", scope: "data:read_write" };
  const context = `client:${provider}:${callback}:v1`;
  // The application client is shared by users of this exact callback. Serialize
  // first registration and re-read within the lease, or concurrent authorizations
  // can bind to different clients while refresh later reads only the last one.
  return withLease(`oauth-client:${provider}:${callback}`, async () => {
    const existing = await readRecord<Client>(context);
    if (existing) {
      if (existing.callback !== callback || existing.authorization !== expected.authorization || existing.token !== expected.token || existing.issuer !== expected.issuer || existing.resource !== expected.resource) throw new Error("client_configuration_changed");
      return existing;
    }
    const metadata = await jsonRequest(`${new URL(expected.issuer).origin}/.well-known/oauth-authorization-server`);
    if (new URL(String(metadata.issuer)).href !== expected.issuer || metadata.authorization_endpoint !== expected.authorization || metadata.token_endpoint !== expected.token || metadata.registration_endpoint !== expected.register || !Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes("S256")) throw new Error("discovery_changed");
    const registered = await jsonRequest(expected.register, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_name: origin.startsWith("https:") ? "1037Solo StudySolo" : "1037Solo StudySolo Development", client_uri: "https://studysolo.1037solo.com", redirect_uris: [callback], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }),
  });
  if (typeof registered.client_id !== "string" || !registered.client_id || registered.token_endpoint_auth_method && registered.token_endpoint_auth_method !== "none") throw new Error("registration_failed");
  const client: Client = { clientId: registered.client_id, callback, authMethod: "none", ...expected };
    await createRecordOnce(context, client);
    // An expired distributed lease can leave two completed registrations. Only
    // the first persisted client may authorize users; the other stays unused.
    const saved = await readRecord<Client>(context);
    if (!saved || saved.callback !== callback || saved.authorization !== expected.authorization || saved.token !== expected.token || saved.issuer !== expected.issuer || saved.resource !== expected.resource) throw new Error("client_configuration_changed");
    return saved;
  });
}

export async function developmentConnect(request: NextRequest, provider: DevelopmentProvider) {
  try {
    const origin = requireConnectorOrigin(request, true);
    const owner = await ownerOf(request);
    const client = await clientFor(provider, origin);
    if (provider === "google") {
      const selected = await request.formData().catch(() => null);
      const requested = selected?.getAll("scope").filter((item): item is string => typeof item === "string");
      if (selected?.has("scope_selection") && !requested?.length) throw error("GOOGLE_SCOPE_REQUIRED");
      if (requested?.length) {
        const allowed = new Set(googleConnectorConfiguration().scopes);
        if (requested.some(scope => !allowed.has(scope))) throw error("UNAPPROVED_GOOGLE_SCOPE", 403);
        client.scope = [...new Set(["openid", "https://www.googleapis.com/auth/userinfo.email", ...requested])].join(" ");
      }
    }
    const state = random(), verifier = random(), binding = random();
    await writeRecord(`pending:${state}`, { owner, provider, state, verifier, bindingHash: digest(binding), expiresAt: Date.now() + 600000, client } satisfies Pending);
    const url = new URL(client.authorization);
    url.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: client.callback, response_type: "code", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    if (client.scope) url.searchParams.set("scope", client.scope);
    if (client.resource) url.searchParams.set("resource", client.resource);
    if (provider === "google") { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); }
    const response = developmentAuthorizationPage(url, provider);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    response.cookies.set(`connector_dev_${provider}`, binding, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: `/api/connectors/${provider}/`, maxAge: 600 });
    return response;
  } catch (cause) { return connectorBrowserFailure(request, provider, cause, "CONNECTOR_PREPARATION_FAILED"); }
}

async function providerAccount(provider: DevelopmentProvider, tokens: Record<string, unknown>): Promise<string> {
  if (provider === "google" && typeof tokens.scope === "string" && tokens.scope.split(/\s+/).includes("openid")) {
    const info = await jsonRequest("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } });
    if (typeof info.sub !== "string" || !info.sub) throw new Error("provider_identity_missing");
    if (typeof info.email === "string") tokens.account_label = info.email;
    return info.sub;
  }
  if (provider === "notion") {
    const workspace = tokens.workspace_id;
    const user = tokens.user_id ?? (tokens.owner as { user?: { id?: string } } | undefined)?.user?.id;
    if (typeof workspace !== "string" || !workspace) throw new Error("workspace_identity_missing");
    return `${workspace}:${typeof user === "string" ? user : "workspace"}`;
  }
  const url = provider === "google" ? "https://gmail.googleapis.com/gmail/v1/users/me/profile" : provider === "github" ? "https://api.github.com/user" : "https://api.todoist.com/api/v1/user";
  const info = await jsonRequest(url, { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json", "User-Agent": "StudySolo-Development-Authentication" } });
  const id = provider === "google" ? info.emailAddress : info.id;
  if (!(typeof id === "string" && id.length > 0 || typeof id === "number" && id > 0)) throw new Error("provider_identity_missing");
  // Private account identifiers are encrypted in the vault and never returned to the UI.
  return String(id);
}

export async function developmentCallback(request: NextRequest, provider: DevelopmentProvider) {
  let result: Response;
  try {
    requireConnectorOrigin(request);
    const state = request.nextUrl.searchParams.get("state") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw error("OAUTH_STATE_INVALID");
    const pending = await readRecord<Pending>(`pending:${state}`);
    const binding = request.cookies.get(`connector_dev_${provider}`)?.value ?? "";
    if (!pending || pending.state !== state || pending.provider !== provider || pending.expiresAt <= Date.now() || !equalDigest(pending.bindingHash, digest(binding))) throw error("OAUTH_STATE_INVALID");
    if (request.nextUrl.searchParams.has("error")) throw error("OAUTH_CANCELLED");
    const owner = await ownerOf(request);
    if (owner !== pending.owner) throw error("OAUTH_OWNER_CHANGED", 403);
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096 || /[\r\n\0]/.test(code)) throw error("OAUTH_CODE_INVALID");
    if (!await claimRecord(`pending:${state}`)) throw error("OAUTH_ALREADY_CONSUMED");
    const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: pending.client.callback, client_id: pending.client.clientId, code_verifier: pending.verifier });
    if (pending.client.clientSecret) form.set("client_secret", pending.client.clientSecret);
    if (pending.client.resource) form.set("resource", pending.client.resource);
    const tokens = await jsonRequest(pending.client.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form });
    if (tokens.error || typeof tokens.access_token !== "string" || tokens.access_token.length < 8 || tokens.access_token.length > 16384 || typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer") throw new Error("token_exchange_failed");
    const accountId = await providerAccount(provider, tokens);
    const old = await readRecord<Grant>(`grant:${owner}:${provider}`);
    const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : old?.accountId === accountId ? old.refreshToken : undefined;
    const seconds = typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in) && tokens.expires_in > 0 ? tokens.expires_in : null;
    const grant: Grant = { owner, provider, accountId, ...(typeof tokens.account_label === "string" ? { accountLabel: tokens.account_label } : {}), accessToken: tokens.access_token, ...(refreshToken ? { refreshToken } : {}), expiresAt: seconds ? Date.now() + seconds * 1000 : null, scope: typeof tokens.scope === "string" ? tokens.scope : pending.client.scope, issuer: pending.client.issuer, resource: pending.client.resource, callback: pending.client.callback, createdAt: new Date().toISOString(), defaultWritePolicy: "disabled" };
    await withLease(`refresh:${owner}:${provider}`, async () => {
      const current = await readRecord<Grant>(`grant:${owner}:${provider}`);
      if (typeof tokens.refresh_token !== "string") grant.refreshToken = current?.accountId === accountId ? current.refreshToken : undefined;
      await writeRecord(`grant:${owner}:${provider}`, grant);
    });
    result = NextResponse.redirect(`${connectorOrigin()}/agent/plugins?connected=${provider}`, 303);
  } catch (cause) { result = await connectorBrowserFailure(request, provider, cause, "OAUTH_NOT_COMPLETED_RETRY_REQUIRED"); }
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  if (result instanceof NextResponse) result.cookies.set(`connector_dev_${provider}`, "", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: `/api/connectors/${provider}/`, maxAge: 0 });
  return result;
}

export async function developmentDashboard(request: NextRequest) {
  try {
    requireDevelopment(request);
    const owner = await ownerOf(request);
    const states = await Promise.all([...DEVELOPMENT_PROVIDERS, "zotero" as const].map(async provider => {
      const grant = await readRecord<Grant>(`grant:${owner}:${provider}`);
      return { provider, grant };
    }));
    const rows = states.map(({provider, grant}) => {
      const status = !grant ? "尚未授权" : grant.expiresAt !== null && grant.expiresAt <= Date.now() ? "凭证已过期，请重新授权" : `开发授权已保存${grant.refreshToken ? "（含续期凭证）" : "（无续期凭证）"}`;
      return `<tr><td>${provider}</td><td>${status}</td><td><form method="post" action="/api/connectors/${provider}/connect"><button>${grant ? "重新授权" : "开始授权"}</button></form></td></tr>`;
    }).join("");
    return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>StudySolo 开发认证</title><h1>StudySolo 开发认证</h1><p>仅用于本机开发准备，凭证加密保存并绑定当前 Account 用户。尚未接入学习 Agent，也未部署生产环境。</p><p>Notion 授权取决于其同意页权限；Todoist 默认请求读写权限。本项目入口仅保存授权，不执行内容写入。Google 请求已登记的邮件读取/发送、云盘、日历、联系人读取权限；GitHub 复用现有只读 App。</p><table><thead><tr><th>服务</th><th>认证状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table><p>Crossref 无需账号；PubMed 普通检索无需账号，NCBI key 用于提高配额；Zotero 开发者注册单独准备；Anki 先使用本地导入。</p></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "strict-origin", "Content-Security-Policy": "default-src 'none'; form-action 'self' https://mcp.notion.com https://app.notion.com https://www.notion.so https://www.notion.com https://todoist.com https://app.todoist.com https://accounts.google.com https://github.com https://www.zotero.org; frame-ancestors 'none'; base-uri 'none'" } });
  } catch (cause) { return cause instanceof Response ? cause : error("DEVELOPMENT_DASHBOARD_UNAVAILABLE", 503); }
}
