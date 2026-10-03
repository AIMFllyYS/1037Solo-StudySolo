/** Application credentials only. Never import this module into browser code. */
import { createPrivateKey, createPublicKey, createHash, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

type Env = Partial<NodeJS.ProcessEnv>;
function rejectPublicCredentials(env: Env) {
  const name = Object.keys(env).find(key => /^NEXT_PUBLIC_.*(?:CONNECTOR|GITHUB|GOOGLE).*(?:SECRET|PRIVATE_KEY|ENCRYPTION_KEY)(?:_[A-Z0-9]+)?$/i.test(key) && env[key]);
  if (name) throw new ConnectorConfigurationError("public_credential_forbidden", [name]);
}
export const GOOGLE_CONNECTOR_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
] as const;

export class ConnectorConfigurationError extends Error {
  constructor(readonly code: string, readonly variables: readonly string[] = []) {
    super(code); // Never interpolate environment values, filesystem errors or secrets.
  }
}

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) throw new ConnectorConfigurationError("missing_or_invalid_configuration", [name]);
  return value;
}

function decodeKey(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new ConnectorConfigurationError("invalid_encryption_key", [name]);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value) throw new ConnectorConfigurationError("invalid_encryption_key", [name]);
  return bytes;
}

export function connectorOrigin(env: Env = process.env): string {
  rejectPublicCredentials(env);
  const production = env.NODE_ENV === "production";
  if (production && env.CONNECTOR_ALLOW_PRODUCTION !== "true") throw new ConnectorConfigurationError("production_not_enabled");
  const name = production ? "CONNECTOR_CALLBACK_ORIGIN" : "CONNECTOR_DEV_CALLBACK_ORIGIN";
  let url: URL;
  try { url = new URL(required(env, name)); } catch { throw new ConnectorConfigurationError("invalid_callback_origin", [name]); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ConnectorConfigurationError("invalid_callback_origin", [name]);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (production ? url.protocol !== "https:" || loopback : !loopback || url.protocol !== "http:") {
    throw new ConnectorConfigurationError("invalid_callback_origin", [name]);
  }
  return url.origin;
}

export function connectorEncryptionKey(env: Env = process.env): Buffer {
  const name = env.NODE_ENV === "production" ? "CONNECTOR_TOKEN_ENCRYPTION_KEY" : "CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY";
  return decodeKey(required(env, name), name);
}

export function googleConnectorConfiguration(env: Env = process.env) {
  const origin = connectorOrigin(env);
  connectorEncryptionKey(env);
  const clientId = required(env, "GOOGLE_CONNECTOR_CLIENT_ID");
  if (!/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new ConnectorConfigurationError("invalid_google_client_id", ["GOOGLE_CONNECTOR_CLIENT_ID"]);
  const clientSecret = required(env, "GOOGLE_CONNECTOR_CLIENT_SECRET");
  const scopes = [...new Set(required(env, "GOOGLE_CONNECTOR_SCOPES").split(/\s+/))];
  if (!scopes.length || scopes.some(scope => !GOOGLE_CONNECTOR_SCOPES.includes(scope as typeof GOOGLE_CONNECTOR_SCOPES[number]))) {
    throw new ConnectorConfigurationError("unapproved_google_scope", ["GOOGLE_CONNECTOR_SCOPES"]);
  }
  return { origin, callback: `${origin}/api/connectors/google/callback/`, clientId, clientSecret, scopes };
}

export function githubConnectorConfiguration(env: Env = process.env) {
  const origin = connectorOrigin(env);
  connectorEncryptionKey(env);
  const appId = required(env, "GITHUB_CONNECTOR_APP_ID");
  const clientId = required(env, "GITHUB_CONNECTOR_CLIENT_ID");
  const clientSecret = required(env, "GITHUB_CONNECTOR_CLIENT_SECRET");
  if (!/^[1-9]\d{0,15}$/.test(appId) || !/^[A-Za-z0-9]{10,100}$/.test(clientId)) throw new ConnectorConfigurationError("invalid_github_application", ["GITHUB_CONNECTOR_APP_ID", "GITHUB_CONNECTOR_CLIENT_ID"]);
  const inline = env.GITHUB_CONNECTOR_PRIVATE_KEY_BASE64?.trim();
  let pem: Buffer;
  let keySource: "environment" | "file";
  try {
    if (inline) {
      if (inline.length > 32768 || !/^[A-Za-z0-9+/]+={0,2}$/.test(inline) || inline.length % 4) throw new Error();
      pem = Buffer.from(inline, "base64");
      if (pem.toString("base64") !== inline) throw new Error();
      keySource = "environment";
    } else {
      const path = required(env, "GITHUB_CONNECTOR_PRIVATE_KEY_PATH");
      if (statSync(path).size > 32768) throw new Error();
      // External secret mount only; do not trace private files into Next artifacts.
      pem = readFileSync(/* turbopackIgnore: true */ path);
      keySource = "file";
    }
  } catch { throw new ConnectorConfigurationError("invalid_github_private_key", [inline ? "GITHUB_CONNECTOR_PRIVATE_KEY_BASE64" : "GITHUB_CONNECTOR_PRIVATE_KEY_PATH"]); }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  } catch { throw new ConnectorConfigurationError("invalid_github_private_key"); }
  return { origin, callback: `${origin}/api/connectors/github/callback/`, appId, clientId, clientSecret, privateKey, keySource };
}

function resultOf(read: () => unknown) {
  try { read(); return { configured: true, reason: null, variables: [] as readonly string[] }; }
  catch (error) {
    return { configured: false, reason: error instanceof ConnectorConfigurationError ? error.code : "configuration_unavailable", variables: error instanceof ConnectorConfigurationError ? error.variables : [] };
  }
}

/** Explicit safe projection; never serialize a credential object into an API or log. */
export function inspectConnectorConfiguration(env: Env = process.env) {
  return {
    stage: "application_credentials" as const,
    runtime: env.NODE_ENV === "production" ? "production" : "development",
    providers: {
      github: resultOf(() => githubConnectorConfiguration(env)),
      google: resultOf(() => googleConnectorConfiguration(env)),
    },
    // Implementation availability is separate from personal authorization and production acceptance.
    authorizationImplemented: true,
    authorizationScope: "runtime_implementation" as const,
    nativeAgentIntegrationImplemented: true,
    productionVerificationComplete: false,
    connectionManagerPath: "/agent/plugins",
    developmentAuthorizationImplemented: true,
    developmentAuthorizationPath: "/api/connectors/development/",
  };
}

/** Public fingerprint for comparing a locally supplied key with GitHub's registration. */
export function githubConnectorKeyFingerprint(env: Env = process.env): string {
  const key = githubConnectorConfiguration(env).privateKey;
  const der = createPublicKey(key).export({ type: "spki", format: "der" });
  return `SHA256:${createHash("sha256").update(der).digest("base64")}`;
}
