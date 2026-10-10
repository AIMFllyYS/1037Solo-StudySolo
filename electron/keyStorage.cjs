// Desktop secret IO is separate from server/window/IPC orchestration. Sender checks remain in main.js.
const fs = require("node:fs");
const path = require("node:path");

function createDesktopKeyStorage({ userData, safeStorage }) {
// 自由中转 = 用户自填的 OpenAI 兼容端点（URL + API Key + 模型 ID），不必使用项目中转站。
// SiliconFlow / MiMo / Zhipu / Unsplash 仍为可选。
// Adding a key here is the whole upgrade story for returning users: the "设置" window
// reopens any time, prefills the keys they already saved, and a new field just rides
// along into the same DPAPI-encrypted keys.enc — no plaintext env file to hand-edit.
const KEY_NAMES = [
  "RELAY_BASE_URL",
  "RELAY_API_KEY",
  "RELAY_MODEL_ID",
  "AI_API_KEY",
  "MIMO_API_KEY",
  "ZHIPU_API_KEY",
  "UNSPLASH_ACCESS_KEY",
];

function hasRequiredKeys(keys) {
  return !!(
    keys &&
    String(keys.RELAY_BASE_URL || "").trim() &&
    String(keys.RELAY_API_KEY || "").trim() &&
    String(keys.RELAY_MODEL_ID || "").trim()
  );
}

const KEYS_FILE = path.join(userData, "keys.enc");
const CUSTOM_SECRETS_FILE = path.join(userData, "custom-api-secrets.enc");

// keys.enc falls back to PLAINTEXT JSON on platforms without safeStorage (e.g. some
// Linux keyrings), so lock the file to the current user regardless of platform.
function writeSecretFile(file, data) {
  fs.writeFileSync(file, data, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600); // mode only applies at creation — fix up existing files too
  } catch {}
} // set while the blocking first-run gate is open

// ---------- key storage (encrypted at rest via OS DPAPI on Windows) ----------
function loadKeys() {
  try {
    const buf = fs.readFileSync(KEYS_FILE);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  const clean = {};
  for (const k of KEY_NAMES) clean[k] = typeof keys[k] === "string" ? keys[k].trim() : "";
  const json = JSON.stringify(clean);
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, "utf8");
  writeSecretFile(KEYS_FILE, data);
  return clean;
}

function cleanSecretRecord(input) {
  const src = input && typeof input === "object" ? input : {};
  const clean = {};
  for (const [id, val] of Object.entries(src)) {
    if (typeof id === "string" && typeof val === "string") clean[id] = val;
  }
  return clean;
}

function loadCustomApiSecrets() {
  try {
    const buf = fs.readFileSync(CUSTOM_SECRETS_FILE);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return { v: 1, groups: {}, capability: {} };
    return {
      v: 1,
      groups: cleanSecretRecord(obj.groups),
      capability: cleanSecretRecord(obj.capability),
    };
  } catch {
    return { v: 1, groups: {}, capability: {} };
  }
}

function saveCustomApiSecrets(payload) {
  const groups = cleanSecretRecord(payload && payload.groups);
  const capability = payload && payload.capability !== undefined
    ? cleanSecretRecord(payload.capability)
    : loadCustomApiSecrets().capability;
  const json = JSON.stringify({ v: 1, groups, capability });
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, "utf8");
  writeSecretFile(CUSTOM_SECRETS_FILE, data);
  return { ok: true };
}
  return { hasRequiredKeys, loadKeys, saveKeys, loadCustomApiSecrets, saveCustomApiSecrets };
}
module.exports = { createDesktopKeyStorage };
