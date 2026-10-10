import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, unlinkSync, rmdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const { createDesktopKeyStorage } = require("./keyStorage.cjs");

function fixture(t: { after: (callback: () => void) => void }, encrypted: boolean) {
  const userData = mkdtempSync(join(tmpdir(), "studysolo-key-storage-"));
  const vault = new Map<string, string>();
  const safeStorage = {
    isEncryptionAvailable: () => encrypted,
    encryptString: (value: string) => { const id = `opaque-${vault.size}`; vault.set(id, value); return Buffer.from(id); },
    decryptString: (value: Buffer) => { const result = vault.get(value.toString()); if (result == null) throw new Error("invalid ciphertext"); return result; },
  };
  t.after(() => {
    for (const name of ["keys.enc", "custom-api-secrets.enc"]) { const file = join(userData, name); if (existsSync(file)) unlinkSync(file); }
    rmdirSync(userData);
  });
  return { userData, safeStorage, storage: createDesktopKeyStorage({ userData, safeStorage }) };
}

test("desktop required keys and opaque encryption round-trip preserve the saved key names", t => {
  const { userData, safeStorage, storage } = fixture(t, true);
  assert.equal(storage.hasRequiredKeys({}), false);
  const clean = storage.saveKeys({ RELAY_BASE_URL: " https://test.invalid/v1 ", RELAY_API_KEY: " test-only ", RELAY_MODEL_ID: " model ", unexpected: "discard" });
  assert.equal(clean.RELAY_API_KEY, "test-only");
  assert.equal(Object.hasOwn(clean, "unexpected"), false);
  assert.equal(storage.hasRequiredKeys(clean), true);
  assert.match(readFileSync(join(userData, "keys.enc"), "utf8"), /^opaque-/);
  const reopened = createDesktopKeyStorage({ userData, safeStorage });
  assert.deepEqual(reopened.loadKeys(), clean);
});

test("custom groups keep existing capability secrets when the payload omits that field", t => {
  const { storage } = fixture(t, true);
  assert.deepEqual(storage.loadCustomApiSecrets(), { v: 1, groups: {}, capability: {} });
  storage.saveCustomApiSecrets({ groups: { first: "test-group", ignored: 5 }, capability: { image: "test-capability" } });
  storage.saveCustomApiSecrets({ groups: { second: "test-other" } });
  assert.deepEqual(storage.loadCustomApiSecrets(), { v: 1, groups: { second: "test-other" }, capability: { image: "test-capability" } });
});

test("platform fallback and damaged files retain the original nonthrowing load behavior", t => {
  const { userData, storage } = fixture(t, false);
  storage.saveKeys({ RELAY_BASE_URL: "https://test.invalid/v1", RELAY_API_KEY: "test-only", RELAY_MODEL_ID: "model" });
  assert.equal(JSON.parse(readFileSync(join(userData, "keys.enc"), "utf8")).RELAY_MODEL_ID, "model");
  writeFileSync(join(userData, "keys.enc"), "invalid json");
  assert.deepEqual(storage.loadKeys(), {});
  writeFileSync(join(userData, "custom-api-secrets.enc"), "invalid json");
  assert.deepEqual(storage.loadCustomApiSecrets(), { v: 1, groups: {}, capability: {} });
});
