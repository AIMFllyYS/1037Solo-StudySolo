/** Safe runtime parity check. Values are never printed, even when configuration fails. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createSign } from "node:crypto";
import { inspectConnectorConfiguration, githubConnectorConfiguration, githubConnectorKeyFingerprint } from "../../lib/connectors/config.server.ts";

async function main() {
const production = process.argv.includes("--production");
const mode = production ? "production" : "development";
const env: NodeJS.ProcessEnv = { NODE_ENV: mode };
for (const name of [".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`]) {
  const path = resolve(name);
  if (existsSync(path)) Object.assign(env, parseEnv(readFileSync(path, "utf8")));
}
// Match Next precedence: existing process environment wins over file values.
Object.assign(env, process.env, { NODE_ENV: mode });
const report = inspectConnectorConfiguration(env);
console.log(JSON.stringify(report, null, 2));

if (!production && (!report.providers.github.configured || !report.providers.google.configured)) process.exitCode = 1;

if (process.argv.includes("--live-github") && report.providers.github.configured) {
  try {
    const config = githubConnectorConfiguration(env);
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.clientId })).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const jwt = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(config.privateKey, "base64url")}`;
    const response = await fetch("https://api.github.com/app", {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "StudySolo-Connector-Configuration" },
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => null);
    const verified = response.ok && String(body?.id) === config.appId;
    console.log(JSON.stringify({ liveGithubAppCredentialVerified: verified, httpStatus: response.status, publicKeyFingerprint: githubConnectorKeyFingerprint(env) }));
    if (!verified) process.exitCode = 1;
  } catch { console.error("GitHub application credential check failed; no credential or provider body was logged."); process.exitCode = 1; }
}
}

void main().catch(() => {
  console.error("Connector configuration check failed; no environment values were logged.");
  process.exitCode = 1;
});
