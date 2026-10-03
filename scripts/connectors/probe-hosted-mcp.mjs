/** Public protocol discovery only. Never registers clients, signs in or reads user content. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const providers = [
  { id: "notion", endpoint: "https://mcp.notion.com/mcp", hosts: ["mcp.notion.com", "api.notion.com", "www.notion.so"] },
  // The official MCP protected-resource document names todoist.com as its issuer.
  { id: "todoist", endpoint: "https://ai.todoist.net/mcp", hosts: ["ai.todoist.net", "todoist.com", "api.todoist.com", "app.todoist.com"] },
];

function trustedUrl(raw, provider) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !provider.hosts.includes(url.hostname)) {
    const error = new Error("untrusted_discovery_origin");
    error.blockedDiscoveryHost = url.hostname;
    throw error;
  }
  return url;
}

async function json(response) {
  if (!response.ok || !response.body) throw new Error("metadata_unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 32768) throw new Error("metadata_too_large");
      chunks.push(Buffer.from(next.value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function metadata(url, provider) {
  return json(await fetch(trustedUrl(url, provider), { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15000) }));
}

async function probe(provider) {
  const report = { provider: provider.id, endpoint: provider.endpoint, authenticated: false, clientRegistered: false, userContentRead: false };
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "readiness-audit", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "StudySolo public readiness audit", version: "0.5.1" } } }),
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    report.unauthenticatedStatus = response.status;
    const header = response.headers.get("www-authenticate") ?? "";
    const resourceUrl = header.match(/resource_metadata="([^"\s]+)"/i)?.[1];
    await response.body?.cancel();
    if (!resourceUrl) return { ...report, discoveryVerified: false, reason: "resource_metadata_not_advertised" };
    const resource = await metadata(resourceUrl, provider);
    if (typeof resource.resource !== "string" || trustedUrl(resource.resource, provider).toString() !== trustedUrl(provider.endpoint, provider).toString()) throw new Error("resource_mismatch");
    const issuer = resource.authorization_servers?.[0];
    if (typeof issuer !== "string") throw new Error("issuer_not_advertised");
    const issuerUrl = trustedUrl(issuer, provider);
    const authUrl = `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname === "/" ? "" : issuerUrl.pathname}`;
    const auth = await metadata(authUrl, provider);
    if (typeof auth.authorization_endpoint !== "string" || typeof auth.token_endpoint !== "string") throw new Error("oauth_endpoints_not_advertised");
    const urlOf = name => typeof auth[name] === "string" ? trustedUrl(auth[name], provider).toString() : null;
    return {
      ...report, discoveryVerified: true,
      resource: resource.resource,
      resourceMetadata: trustedUrl(resourceUrl, provider).toString(), issuer: issuerUrl.toString(),
      authorizationEndpoint: urlOf("authorization_endpoint"), tokenEndpoint: urlOf("token_endpoint"), registrationEndpoint: urlOf("registration_endpoint"),
      pkceS256Advertised: Array.isArray(auth.code_challenge_methods_supported) && auth.code_challenge_methods_supported.includes("S256"),
      tokenEndpointAuthMethods: auth.token_endpoint_auth_methods_supported ?? [],
      refreshGrantAdvertised: Array.isArray(auth.grant_types_supported) && auth.grant_types_supported.includes("refresh_token"),
      clientIdMetadataDocumentAdvertised: auth.client_id_metadata_document_supported === true,
    };
  } catch (error) {
    const known = ["untrusted_discovery_origin", "metadata_unavailable", "metadata_too_large", "issuer_not_advertised", "resource_mismatch", "oauth_endpoints_not_advertised"];
    return { ...report, discoveryVerified: false, reason: known.includes(error?.message) ? error.message : "public_discovery_unavailable", ...(error?.blockedDiscoveryHost ? { blockedDiscoveryHost: error.blockedDiscoveryHost } : {}) };
  }
}

const results = await Promise.all(providers.map(probe));
const report = { observedAtUtc: new Date().toISOString(), scope: "unauthenticated_protocol_metadata", providers: results };
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directory = resolve(root, "artifacts/connector-analysis-2026-10-03");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "hosted-mcp-discovery.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
