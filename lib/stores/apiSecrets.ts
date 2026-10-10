/**
 * 自定义分组 apiKey 与能力端点密钥的本地存储。
 * - persist 名 `gailvlun-settings-v1` 不变；密钥拆到独立 key 并做轻量混淆（不是加密）。
 * - 桌面端另走 Electron safeStorage（DPAPI）。
 */

import {
  normalizeCapabilityEndpoints,
  type CapabilityEndpoints,
} from "@/lib/ai/endpoints/capabilityEndpoints";
import type { CustomApiGroup } from "@/lib/ai/models";

export const SETTINGS_LS_KEY = "gailvlun-settings-v1";
export const API_SECRETS_LS_KEY = "gailvlun-api-secrets-v1";

export const CAPABILITY_SECRET_FIELDS = [
  "imageApiKey",
  "embeddingApiKey",
  "rerankApiKey",
  "webSearchApiKey",
  "unsplashAccessKey",
] as const;

export type StoredApiSecrets = {
  v: 1;
  groups: Record<string, string>;
  /** 能力端点五把密钥；缺省 = 尚未迁过（旧桌面文件只有 groups）。 */
  capability?: Record<string, string>;
};

const OBFUSCATE_PREFIX = "obf1.";
const XOR_SEED = "gailvlun-api-secrets-v1";

function xorKeyBytes(): Uint8Array {
  return new TextEncoder().encode(XOR_SEED);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** 轻量混淆：防顺手 grep，不是加密。 */
export function obfuscateSecret(plain: string): string {
  if (!plain) return "";
  const bytes = new TextEncoder().encode(plain);
  const key = xorKeyBytes();
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
  return OBFUSCATE_PREFIX + bytesToB64(out);
}

export function deobfuscateSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(OBFUSCATE_PREFIX)) return stored;
  try {
    const bytes = b64ToBytes(stored.slice(OBFUSCATE_PREFIX.length));
    const key = xorKeyBytes();
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
    return new TextDecoder().decode(out);
  } catch {
    return "";
  }
}

export function extractPlainGroupKeys(groups: unknown): Record<string, string> {
  if (!Array.isArray(groups)) return {};
  const out: Record<string, string> = {};
  for (const item of groups) {
    if (!item || typeof item !== "object") continue;
    const g = item as Partial<CustomApiGroup>;
    if (typeof g.id !== "string" || !g.id) continue;
    if (typeof g.apiKey !== "string" || !g.apiKey.trim()) continue;
    out[g.id] = g.apiKey;
  }
  return out;
}

export function stripGroupApiKeys<T extends { apiKey?: string }>(groups: T[]): T[] {
  return groups.map((g) => (g.apiKey ? { ...g, apiKey: "" } : g));
}

export function applyGroupApiKeys<T extends { id: string; apiKey?: string }>(
  groups: T[],
  keys: Record<string, string>,
): T[] {
  return groups.map((g) => {
    const k = keys[g.id];
    return typeof k === "string" && k ? { ...g, apiKey: k } : g;
  });
}

export function extractPlainCapabilityKeys(endpoints: unknown): Record<string, string> {
  if (!endpoints || typeof endpoints !== "object" || Array.isArray(endpoints)) return {};
  const src = endpoints as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of CAPABILITY_SECRET_FIELDS) {
    const val = src[field];
    if (typeof val === "string" && val.trim()) out[field] = val;
  }
  return out;
}

export function stripCapabilitySecrets(endpoints: CapabilityEndpoints): CapabilityEndpoints {
  return {
    ...endpoints,
    imageApiKey: "",
    embeddingApiKey: "",
    rerankApiKey: "",
    webSearchApiKey: "",
    unsplashAccessKey: "",
  };
}

export function applyCapabilitySecrets(
  endpoints: CapabilityEndpoints,
  keys: Record<string, string>,
): CapabilityEndpoints {
  const next = { ...endpoints };
  for (const field of CAPABILITY_SECRET_FIELDS) {
    const k = keys[field];
    if (typeof k === "string" && k) next[field] = k;
  }
  return next;
}

function obfuscateRecord(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, key] of Object.entries(input)) {
    if (key) out[id] = obfuscateSecret(key);
  }
  return out;
}

function deobfuscateRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, val] of Object.entries(input as Record<string, unknown>)) {
    if (typeof val === "string" && val) out[id] = deobfuscateSecret(val);
  }
  return out;
}

function plainRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, val] of Object.entries(input as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[id] = val;
  }
  return out;
}

/**
 * 两类密钥都必须显式传：这里是唯一的写入编码点，漏传一边就等于把用户那一边
 * 的密钥静默清空，所以 capability 不给默认值。
 */
export function encodeWebSecrets(
  groups: Record<string, string>,
  capability: Record<string, string>,
): string {
  const payload: StoredApiSecrets = {
    v: 1,
    groups: obfuscateRecord(groups),
    capability: obfuscateRecord(capability),
  };
  return JSON.stringify(payload);
}

export function decodeWebApiSecrets(raw: string | null | undefined): {
  groups: Record<string, string>;
  capability: Record<string, string>;
} {
  if (!raw) return { groups: {}, capability: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredApiSecrets>;
    if (!parsed || parsed.v !== 1) return { groups: {}, capability: {} };
    return {
      groups: deobfuscateRecord(parsed.groups),
      capability: deobfuscateRecord(parsed.capability),
    };
  } catch {
    return { groups: {}, capability: {} };
  }
}

export function decodeWebSecrets(raw: string | null | undefined): Record<string, string> {
  return decodeWebApiSecrets(raw).groups;
}

export function decodeWebCapabilitySecrets(raw: string | null | undefined): Record<string, string> {
  return decodeWebApiSecrets(raw).capability;
}

export function decodeDesktopSecrets(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  return plainRecord((payload as StoredApiSecrets).groups);
}

export function decodeDesktopCapabilitySecrets(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  return plainRecord((payload as StoredApiSecrets).capability);
}

export type SettingsSecretsSplit = {
  groupsForMemory: CustomApiGroup[];
  groupKeys: Record<string, string>;
  capabilityForMemory: CapabilityEndpoints;
  capabilityKeys: Record<string, string>;
  rewriteSettings: boolean;
  rewriteSecrets: boolean;
};

/**
 * 三种迁移（分组密钥与能力端点密钥同一套规则）：
 * 1. 旧 key 有明文、新 key 不存在 → 抽到新 key，剥离旧 JSON
 * 2. 新 key 已存在、旧 key 已剥离 → 用新 key
 * 3. 两者都有 → 新 key 覆盖同名字段，旧 key 里多出来的仍保留，并剥离明文
 *
 * 分组与能力端点互不影响：一边已在新 store、另一边还在旧 blob 时，合并写入、不丢任何一边。
 */
export function splitSettingsSecrets(
  groups: CustomApiGroup[],
  secretsRaw: string | null | undefined,
  legacyCustomApiKey?: string,
  capability?: unknown,
): SettingsSecretsSplit {
  const stored = decodeWebApiSecrets(secretsRaw);
  const fromOldGroups = extractPlainGroupKeys(groups);
  const groupKeys = { ...fromOldGroups, ...stored.groups };
  if (
    !Object.keys(groupKeys).length
    && typeof legacyCustomApiKey === "string"
    && legacyCustomApiKey.trim()
    && groups[0]
  ) {
    groupKeys[groups[0].id] = legacyCustomApiKey;
  }
  const fromOldCapability = extractPlainCapabilityKeys(capability);
  const capabilityKeys = { ...fromOldCapability, ...stored.capability };
  const rewriteSettings = Object.keys(fromOldGroups).length > 0
    || Object.keys(fromOldCapability).length > 0
    || (typeof legacyCustomApiKey === "string" && legacyCustomApiKey.trim() !== "");
  const hasAnySecrets = Object.keys(groupKeys).length > 0 || Object.keys(capabilityKeys).length > 0;
  const rewriteSecrets = hasAnySecrets && (!secretsRaw || rewriteSettings);
  return {
    groupsForMemory: applyGroupApiKeys(stripGroupApiKeys(groups), groupKeys),
    groupKeys,
    capabilityForMemory: applyCapabilitySecrets(
      stripCapabilitySecrets(normalizeCapabilityEndpoints(capability)),
      capabilityKeys,
    ),
    capabilityKeys,
    rewriteSettings,
    rewriteSecrets,
  };
}

export type DesktopSecretsBridge = {
  load: () => Promise<unknown>;
  save: (payload: StoredApiSecrets) => Promise<unknown>;
};

export function getDesktopSecretsBridge(): DesktopSecretsBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const desktop = (window as unknown as { desktop?: { isElectron?: boolean; secrets?: DesktopSecretsBridge } }).desktop;
  if (!desktop?.isElectron || !desktop.secrets) return undefined;
  return desktop.secrets;
}

export function isElectronDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { desktop?: { isElectron?: boolean } }).desktop?.isElectron;
}
