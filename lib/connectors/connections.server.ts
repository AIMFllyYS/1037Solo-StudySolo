import { randomUUID, createHash } from "node:crypto";
import { readRecord, readVersionedRecord, compareRecord, writeRecord, withLease } from "./persistence.server";
import { connectorOrigin, googleConnectorConfiguration, githubConnectorConfiguration } from "./config.server";
import { CONNECTOR_IDS, CONNECTOR_REGISTRY, type OAuthConnectorId, type ConnectorConnectionStatus } from "./registry";
import type { DevelopmentGrant } from "./development-oauth.server";
import { ConnectorError } from "./actor.server";
import { providerJson } from "./http.server";
export type ConnectorGrant = DevelopmentGrant & { revokedAt?: string; reauthRequired?: boolean; revision?: number };
type Client = { clientId: string; clientSecret?: string; authMethod: string; callback: string; token: string; resource?: string };
const context = (owner: string, provider: string) => `grant:${owner}:${provider}`;
// UI reconciliation only. Credentials, expiry and refresh revision cannot reset a user's draft.
const grantVersion = (grant: ConnectorGrant) => createHash("sha256").update(JSON.stringify([grant.owner, grant.provider, grant.accountId, grant.createdAt, grant.scope.split(/\s+/).filter(Boolean).sort()])).digest("hex");

export async function readGrant(owner: string, provider: OAuthConnectorId) {
  const grant = await readRecord<ConnectorGrant>(context(owner, provider));
  if (grant && (grant.owner !== owner || grant.provider !== provider)) throw new ConnectorError("CONNECTION_OWNER_MISMATCH", 403);
  return grant;
}
/** An invalid provider credential must not leave the UI claiming a usable link. */
export async function requireGrantReauthorization(owner: string, provider: OAuthConnectorId, accessToken: string) {
  await withLease(`refresh:${owner}:${provider}`, async () => {
    const snapshot = await readVersionedRecord<ConnectorGrant>(context(owner, provider));
    const grant = snapshot?.value;
    // A late 401 from an old request cannot invalidate a newly rebound account.
    if (!grant || grant.owner !== owner || grant.provider !== provider || grant.revokedAt || grant.accessToken !== accessToken) return;
    await compareRecord(context(owner, provider), snapshot!.revision, { ...grant, reauthRequired: true });
  });
}
async function clientFor(provider: OAuthConnectorId): Promise<Client> {
  if (provider === "google") { const config = googleConnectorConfiguration(); return { ...config, authMethod: "client_secret_post", token: "https://oauth2.googleapis.com/token" }; }
  if (provider === "github") { const config = githubConnectorConfiguration(); return { ...config, authMethod: "client_secret_post", token: "https://github.com/login/oauth/access_token" }; }
  const client = await readRecord<Client>(`client:${provider}:${connectorOrigin()}/api/connectors/${provider}/callback/:v1`);
  const expected = provider === "notion" ? "https://mcp.notion.com/token" : "https://todoist.com/oauth/access_token";
  if (!client || client.token !== expected) throw new ConnectorError("OAUTH_CLIENT_NOT_CONFIGURED", 503);
  return client;
}
export async function activeGrant(owner: string, provider: OAuthConnectorId, signal?: AbortSignal): Promise<ConnectorGrant> {
  const first = await readGrant(owner, provider);
  if (!first || first.revokedAt || first.reauthRequired) throw new ConnectorError("CONNECTION_REQUIRED", 403);
  if (first.expiresAt === null || first.expiresAt > Date.now() + 60000) return first;
  return withLease(`refresh:${owner}:${provider}`, async () => {
    const snapshot = await readVersionedRecord<ConnectorGrant>(context(owner, provider));
    const grant = snapshot?.value;
    if (!grant || grant.revokedAt || grant.reauthRequired) throw new ConnectorError("CONNECTION_REQUIRED", 403);
    if (grant.owner !== owner || grant.provider !== provider) throw new ConnectorError("CONNECTION_OWNER_MISMATCH", 403);
    if (grant.expiresAt === null || grant.expiresAt > Date.now() + 60000) return grant;
    if (!grant.refreshToken || provider === "zotero") throw new ConnectorError("REAUTHORIZATION_REQUIRED", 403);
    const client = await clientFor(provider);
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: grant.refreshToken, client_id: client.clientId });
    if (client.clientSecret) body.set("client_secret", client.clientSecret);
    if (client.resource) body.set("resource", client.resource);
    let tokens: Record<string, unknown>;
    try { tokens = await providerJson(client.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }, signal); }
    catch (error) {
      if (!(error instanceof ConnectorError) || error.code !== "PROVIDER_RATE_LIMITED") { await compareRecord(context(owner, provider), snapshot!.revision, { ...grant, reauthRequired: true }); }
      throw error;
    }
    if (tokens.error || typeof tokens.access_token !== "string" || typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer") {
      await compareRecord(context(owner, provider), snapshot!.revision, { ...grant, reauthRequired: true }); throw new ConnectorError("REAUTHORIZATION_REQUIRED", 403);
    }
    const expires = typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in) && tokens.expires_in > 0 ? Date.now() + tokens.expires_in * 1000 : null;
    const updated: ConnectorGrant = { ...grant, accessToken: tokens.access_token, refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : grant.refreshToken, expiresAt: expires, scope: typeof tokens.scope === "string" ? tokens.scope : grant.scope, revision: (grant.revision ?? 0) + 1 };
    // Retain the rotated token encrypted before replacing the current record.
    await writeRecord(`rotation:${owner}:${provider}:${randomUUID()}`, updated);
    if (!await compareRecord(context(owner, provider), snapshot!.revision, updated)) {
      const current = await readGrant(owner, provider);
      if (!current || current.revokedAt || current.reauthRequired) throw new ConnectorError("CONNECTION_CHANGED", 409);
      return current;
    }
    return updated;
  });
}
export async function connectionStatus(owner: string): Promise<ConnectorConnectionStatus[]> {
  return Promise.all(CONNECTOR_IDS.map(async (provider): Promise<ConnectorConnectionStatus> => {
    const descriptor = CONNECTOR_REGISTRY[provider];
    if (descriptor.auth === "public" || descriptor.auth === "local") return { provider, name: descriptor.name, kind: descriptor.kind, state: "available", writable: false };
    try {
      let grant = await readGrant(owner, provider as OAuthConnectorId);
      if (grant && !grant.revokedAt && !grant.reauthRequired && grant.expiresAt !== null && grant.expiresAt <= Date.now() + 60000 && grant.refreshToken) {
        grant = await activeGrant(owner, provider as OAuthConnectorId);
      }
      return { provider, name: descriptor.name, kind: descriptor.kind, state: !grant || grant.revokedAt ? "disconnected" : grant.reauthRequired || grant.expiresAt !== null && grant.expiresAt <= Date.now() && !grant.refreshToken ? "reauthorization_required" : "connected", canDisconnect: !!grant && !grant.revokedAt, writable: descriptor.writable, scopes: grant && !grant.revokedAt ? grant.scope.split(/\s+/).filter(Boolean) : [], ...(grant && !grant.revokedAt ? { grantVersion: grantVersion(grant) } : {}), expiresAt: grant?.expiresAt ?? null };
    } catch (cause) {
      const code = cause instanceof ConnectorError ? cause.code : "CONNECTOR_UNAVAILABLE";
      const reauth = ["CONNECTION_REQUIRED", "REAUTHORIZATION_REQUIRED", "PROVIDER_AUTHORIZATION_EXPIRED"].includes(code);
      const current = reauth ? await readGrant(owner, provider as OAuthConnectorId).catch(() => null) : null;
      return { provider, name: descriptor.name, kind: descriptor.kind, state: reauth ? "reauthorization_required" : "unavailable", canDisconnect: reauth && !!current && !current.revokedAt, writable: false, ...(current && !current.revokedAt ? { grantVersion: grantVersion(current), scopes: current.scope.split(/\s+/).filter(Boolean) } : {}), error: code };
    }
  }));
}
export async function disconnectConnector(owner: string, provider: OAuthConnectorId) {
  return withLease(`refresh:${owner}:${provider}`, async () => {
    const grant = await readGrant(owner, provider); if (!grant || grant.revokedAt) return { disconnected: true, remoteRevocation: "not_applicable" };
    // Local authority is revoked before attempting any network operation. Retain encrypted history.
    await writeRecord(`revoked:${owner}:${provider}:${randomUUID()}`, grant);
    await writeRecord(context(owner, provider), { ...grant, accessToken: "", refreshToken: undefined, revokedAt: new Date().toISOString(), revision: (grant.revision ?? 0) + 1 });
    let remoteRevocation = "manual_provider_review_required";
    if (provider === "google") {
      const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: grant.accessToken }), redirect: "error", signal: AbortSignal.timeout(10000) }).catch(() => null);
      remoteRevocation = response?.ok ? "revoked" : "unavailable"; await response?.body?.cancel();
    }
    return { disconnected: true, remoteRevocation };
  });
}
