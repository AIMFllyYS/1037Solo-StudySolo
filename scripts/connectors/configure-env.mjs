/** Copies approved application credentials into the project's actual runtime env files. */
import { readFileSync, writeFileSync, copyFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { createPrivateKey, createPublicKey, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

export const CONNECTOR_ENV_NAMES = [
  "CONNECTOR_DEV_CALLBACK_ORIGIN", "CONNECTOR_CALLBACK_ORIGIN", "CONNECTOR_ALLOW_PRODUCTION",
  "CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY", "CONNECTOR_TOKEN_ENCRYPTION_KEY",
  "GITHUB_CONNECTOR_APP_ID", "GITHUB_CONNECTOR_CLIENT_ID", "GITHUB_CONNECTOR_CLIENT_SECRET",
  "GITHUB_CONNECTOR_PRIVATE_KEY_BASE64", "GITHUB_CONNECTOR_PRIVATE_KEY_PATH",
  "GOOGLE_CONNECTOR_CLIENT_ID", "GOOGLE_CONNECTOR_CLIENT_SECRET", "GOOGLE_CONNECTOR_PROJECT_ID", "GOOGLE_CONNECTOR_SCOPES",
  "NCBI_API_KEY",
  "ZOTERO_CONNECTOR_CLIENT_KEY", "ZOTERO_CONNECTOR_CLIENT_SECRET",
];

/** Preserve every unrelated line and comment; update only the managed variables. */
export function updateConnectorEnv(raw, values) {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const written = new Set();
  const out = [];
  for (const line of lines) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (name && Object.hasOwn(values, name)) {
      if (!written.has(name)) out.push(`${name}=${JSON.stringify(values[name])}`);
      written.add(name);
    } else out.push(line);
  }
  const missing = Object.keys(values).filter(name => !written.has(name));
  if (missing.length) {
    out.push("", "# Connector application credentials and public API quota keys (server only)");
    for (const name of missing) out.push(`${name}=${JSON.stringify(values[name])}`);
  }
  return out.join(newline).replace(new RegExp(`${newline}$`), "") + newline;
}

function secure(path) {
  if (process.platform === "win32") {
    const principal = execFileSync("whoami.exe", [], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    execFileSync("icacls.exe", [path, "/inheritance:r", "/grant:r", `${principal}:F`, "SYSTEM:F"], { stdio: "pipe" });
  } else {
    // mkdir/write use owner-only permissions; repair pre-existing files too.
    execFileSync("chmod", ["600", path], { stdio: "pipe" });
  }
}

function retainedKey(previous, name) {
  const value = previous[name];
  if (value) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new Error("Existing connector encryption key is invalid; refusing rotation");
    return value;
  }
  return randomBytes(32).toString("base64");
}

export function configureConnectorEnvironment(root) {
  root = resolve(root);
  const privateRoot = join(root, ".local-archive", "connectors-private");
  const google = JSON.parse(readFileSync(join(privateRoot, "google-oauth-client.json"), "utf8"));
  const github = JSON.parse(readFileSync(join(privateRoot, "github-app-credentials.json"), "utf8"));
  const state = JSON.parse(readFileSync(join(root, "artifacts", "connector-analysis-2026-10-03", "application-drafts.json"), "utf8"));
  const pemPath = join(privateRoot, "github-app-private-key.pem");
  const pem = readFileSync(pemPath);
  const key = createPrivateKey(pem);
  const fingerprint = `SHA256:${createHash("sha256").update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("base64")}`;
  const callbackOrigin = "http://localhost:35349";
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || fingerprint !== state.github.privateKeyPublicFingerprint) throw new Error("GitHub private key does not match the verified registration");
  if (!google.web?.client_secret || google.web.client_id !== state.google.clientId || !google.web.redirect_uris?.includes(`${callbackOrigin}/api/connectors/google/callback/`)) throw new Error("Google application credential mismatch");
  if (!github.client_secret || github.client_id !== state.github.clientId || String(github.app_id) !== String(state.github.appId)) throw new Error("GitHub application credential mismatch");

  const localPath = join(root, ".env.local");
  const productionPath = join(root, ".env.production");
  const localRaw = readFileSync(localPath, "utf8");
  const previous = parseEnv(localRaw);
  const priorProduction = parseEnv(readFileSync(productionPath, "utf8"));
  for (const name of ["CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY", "CONNECTOR_TOKEN_ENCRYPTION_KEY"]) {
    if (previous[name] && priorProduction[name] && previous[name] !== priorProduction[name]) throw new Error("Encryption key profiles differ; refusing implicit rotation");
    previous[name] ??= priorProduction[name];
  }
  const values = {
    CONNECTOR_DEV_CALLBACK_ORIGIN: callbackOrigin,
    CONNECTOR_CALLBACK_ORIGIN: "https://studysolo.1037solo.com",
    CONNECTOR_ALLOW_PRODUCTION: previous.CONNECTOR_ALLOW_PRODUCTION ?? "false",
    CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: retainedKey(previous, "CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY"),
    CONNECTOR_TOKEN_ENCRYPTION_KEY: retainedKey(previous, "CONNECTOR_TOKEN_ENCRYPTION_KEY"),
    GITHUB_CONNECTOR_APP_ID: String(github.app_id),
    GITHUB_CONNECTOR_CLIENT_ID: github.client_id,
    GITHUB_CONNECTOR_CLIENT_SECRET: github.client_secret,
    GITHUB_CONNECTOR_PRIVATE_KEY_BASE64: pem.toString("base64"),
    GITHUB_CONNECTOR_PRIVATE_KEY_PATH: pemPath.replace(/\\/g, "/"),
    GOOGLE_CONNECTOR_CLIENT_ID: google.web.client_id,
    GOOGLE_CONNECTOR_CLIENT_SECRET: google.web.client_secret,
    GOOGLE_CONNECTOR_PROJECT_ID: "studysolo",
    GOOGLE_CONNECTOR_SCOPES: state.google.declaredScopes.join(" "),
  };
  const ncbiPath = join(privateRoot, "ncbi-credentials.json");
  if (existsSync(ncbiPath)) {
    const ncbi = JSON.parse(readFileSync(ncbiPath, "utf8"));
    if (ncbi.purpose !== "public-eutilities-quota" || typeof ncbi.api_key !== "string" || !/^[a-f0-9]{36,64}$/i.test(ncbi.api_key)) throw new Error("NCBI quota key is invalid");
    values.NCBI_API_KEY = ncbi.api_key;
    secure(ncbiPath);
  }
  const zoteroPath = join(privateRoot, "zotero-app-credentials.json");
  if (existsSync(zoteroPath)) {
    const zotero = JSON.parse(readFileSync(zoteroPath, "utf8"));
    if (zotero.application_type !== "browser" || zotero.callback !== `${callbackOrigin}/api/connectors/zotero/callback/` || !/^[A-Za-z0-9]{10,200}$/.test(zotero.client_key ?? "") || !/^[A-Za-z0-9]{10,200}$/.test(zotero.client_secret ?? "")) throw new Error("Zotero application credential is invalid");
    values.ZOTERO_CONNECTOR_CLIENT_KEY = zotero.client_key;
    values.ZOTERO_CONNECTOR_CLIENT_SECRET = zotero.client_secret;
    secure(zoteroPath);
  }
  if (values.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY === values.CONNECTOR_TOKEN_ENCRYPTION_KEY) throw new Error("Development and production encryption keys must be distinct");
  const targets = [localPath, productionPath, join(privateRoot, ".env.connectors.local")];
  for (const target of targets) {
    // Refuse to put credentials in a tracked or non-ignored file.
    execFileSync("git", ["check-ignore", "--quiet", target], { cwd: root, stdio: "pipe" });
  }
  // Validate all files before any write. No secret values go into the result/log.
  const updates = targets.map(path => {
    const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
    const parsed = parseEnv(raw);
    for (const name of Object.keys(parsed)) {
      if (/^NEXT_PUBLIC_.*(?:CONNECTOR|GITHUB|GOOGLE|NCBI|ZOTERO).*(?:SECRET|PRIVATE_KEY|ENCRYPTION_KEY|API_KEY)(?:_[A-Z0-9]+)?$/i.test(name) && parsed[name]) throw new Error("A connector secret uses a public environment prefix; remove it before configuring");
    }
    return { path, raw, updated: updateConnectorEnv(raw, values) };
  });
  const backupRoot = join(privateRoot, `environment-backup-${randomUUID()}`);
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  for (const update of updates) {
    if (existsSync(update.path)) {
      const backup = join(backupRoot, update.path === localPath ? ".env.local" : update.path === productionPath ? ".env.production" : ".env.connectors.local");
      copyFileSync(update.path, backup);
      secure(backup);
    }
    const temp = `${update.path}.connector-${randomUUID()}`;
    writeFileSync(temp, update.updated, { mode: 0o600 });
    secure(temp);
    renameSync(temp, update.path);
    secure(update.path);
  }
  return { updatedFiles: targets.map(path => path.replace(root + "/", "").replace(root + "\\", "")), variableNames: Object.keys(values), productionEnabled: values.CONNECTOR_ALLOW_PRODUCTION === "true", backupDirectory: backupRoot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    console.log(JSON.stringify(configureConnectorEnvironment(root), null, 2));
  } catch {
    console.error("Connector environment configuration failed. Check private credential files and permissions; no values were logged.");
    process.exitCode = 1;
  }
}
