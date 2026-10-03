import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { parseEnv } from "node:util";
import { connectorOrigin, connectorEncryptionKey, githubConnectorConfiguration, googleConnectorConfiguration, inspectConnectorConfiguration, GOOGLE_CONNECTOR_SCOPES } from "./config.server.ts";
import { updateConnectorEnv } from "../../scripts/connectors/configure-env.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const fixture = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  CONNECTOR_DEV_CALLBACK_ORIGIN: "http://localhost:35349",
  CONNECTOR_CALLBACK_ORIGIN: "https://studysolo.example",
  CONNECTOR_ALLOW_PRODUCTION: "false",
  CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CONNECTOR_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  GITHUB_CONNECTOR_APP_ID: "12345",
  GITHUB_CONNECTOR_CLIENT_ID: "syntheticclientid",
  GITHUB_CONNECTOR_CLIENT_SECRET: "fixture-github-secret",
  GITHUB_CONNECTOR_PRIVATE_KEY_BASE64: Buffer.from(pem).toString("base64"),
  GITHUB_CONNECTOR_PRIVATE_KEY_PATH: "missing-key-file",
  GOOGLE_CONNECTOR_CLIENT_ID: "123-synthetic.apps.googleusercontent.com",
  GOOGLE_CONNECTOR_CLIENT_SECRET: "fixture-google-secret",
  GOOGLE_CONNECTOR_SCOPES: GOOGLE_CONNECTOR_SCOPES.join(" "),
});

test("connector configuration uses exact callbacks and environment private key without reading its backup path", () => {
  const env = fixture();
  const github = githubConnectorConfiguration(env);
  const google = googleConnectorConfiguration(env);
  assert.equal(github.keySource, "environment");
  assert.equal(github.callback, "http://localhost:35349/api/connectors/github/callback/");
  assert.equal(google.callback, "http://localhost:35349/api/connectors/google/callback/");
  assert.equal(github.privateKey.asymmetricKeyType, "rsa");
});

test("public readiness projection and configuration errors never disclose credentials or paths", () => {
  const env = fixture();
  const report = inspectConnectorConfiguration(env);
  assert.equal(report.providers.github.configured, true);
  assert.equal(report.providers.google.configured, true);
  assert.equal(report.authorizationImplemented, true);
  assert.equal(report.productionVerificationComplete, false);
  for (const value of [env.GITHUB_CONNECTOR_CLIENT_SECRET, env.GOOGLE_CONNECTOR_CLIENT_SECRET, env.GITHUB_CONNECTOR_PRIVATE_KEY_BASE64, env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY, env.GITHUB_CONNECTOR_PRIVATE_KEY_PATH]) {
    assert.ok(!JSON.stringify(report).includes(value!));
  }
  env.GITHUB_CONNECTOR_PRIVATE_KEY_BASE64 = Buffer.from("a-token-is-not-a-private-key").toString("base64");
  assert.equal(inspectConnectorConfiguration(env).providers.github.reason, "invalid_github_private_key");
});

test("production is blocked independently of .env.local precedence, then requires HTTPS and its own encryption key", () => {
  const env: NodeJS.ProcessEnv = { ...fixture(), NODE_ENV: "production" };
  assert.equal(inspectConnectorConfiguration(env).providers.github.reason, "production_not_enabled");
  env.CONNECTOR_ALLOW_PRODUCTION = "true";
  assert.equal(connectorOrigin(env), "https://studysolo.example");
  assert.deepEqual(connectorEncryptionKey(env), Buffer.from(env.CONNECTOR_TOKEN_ENCRYPTION_KEY!, "base64"));
  env.CONNECTOR_CALLBACK_ORIGIN = "http://localhost:35349";
  assert.throws(() => connectorOrigin(env), /invalid_callback_origin/);
});

test("callbacks reject userinfo, paths, query/fragment injection, remote development hosts and public secret prefixes", () => {
  for (const origin of ["http://user:pass@localhost:35349", "http://localhost:35349/extra", "http://localhost:35349/?key=fixture", "http://localhost:35349/#fragment", "http://remote.example"]) {
    const env = { ...fixture(), CONNECTOR_DEV_CALLBACK_ORIGIN: origin };
    assert.equal(inspectConnectorConfiguration(env).providers.google.reason, "invalid_callback_origin");
  }
  const env = { ...fixture(), NEXT_PUBLIC_GITHUB_CONNECTOR_PRIVATE_KEY_BASE64: "fixture-public-secret" };
  assert.equal(inspectConnectorConfiguration(env).providers.github.reason, "public_credential_forbidden");
  assert.ok(!JSON.stringify(inspectConnectorConfiguration(env)).includes("fixture-public-secret"));
});

test("encryption keys have canonical 32-byte base64 form and Google scope expansion is rejected", () => {
  const env = fixture();
  env.CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY = "short-fixture";
  assert.throws(() => connectorEncryptionKey(env), /invalid_encryption_key/);
  const expanded = { ...fixture(), GOOGLE_CONNECTOR_SCOPES: "https://www.googleapis.com/auth/cloud-platform" };
  assert.equal(inspectConnectorConfiguration(expanded).providers.google.reason, "unapproved_google_scope");
});

test("a mounted PEM is supported but a copied short token is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "connector-config-test-"));
  try {
    const env = fixture();
    delete env.GITHUB_CONNECTOR_PRIVATE_KEY_BASE64;
    env.GITHUB_CONNECTOR_PRIVATE_KEY_PATH = join(root, "app.pem");
    writeFileSync(env.GITHUB_CONNECTOR_PRIVATE_KEY_PATH, pem);
    assert.equal(githubConnectorConfiguration(env).keySource, "file");
    writeFileSync(env.GITHUB_CONNECTOR_PRIVATE_KEY_PATH, "fixture-short-token");
    assert.equal(inspectConnectorConfiguration(env).providers.github.reason, "invalid_github_private_key");
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("connector-config-test-"));
    rmSync(root, { recursive: true, force: true });
  }
});

test("environment updates preserve unrelated settings, remove managed duplicates and round-trip quoted values idempotently", () => {
  const raw = '# retain this comment\r\nUNRELATED="value with spaces"\r\nGITHUB_CONNECTOR_CLIENT_SECRET="old-fixture"\r\nGITHUB_CONNECTOR_CLIENT_SECRET="duplicate-fixture"\r\n';
  const values = { GITHUB_CONNECTOR_CLIENT_SECRET: "new-fixture", GOOGLE_CONNECTOR_CLIENT_SECRET: "google-fixture" };
  const updated = updateConnectorEnv(raw, values);
  assert.ok(updated.includes('# retain this comment\r\nUNRELATED="value with spaces"\r\n'));
  assert.equal(updated.match(/^GITHUB_CONNECTOR_CLIENT_SECRET=/gm)?.length, 1);
  assert.equal(parseEnv(updated).GITHUB_CONNECTOR_CLIENT_SECRET, "new-fixture");
  assert.equal(updateConnectorEnv(updated, values), updated);
});
