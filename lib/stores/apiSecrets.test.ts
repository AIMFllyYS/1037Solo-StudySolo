import assert from "node:assert/strict";
import { test } from "node:test";
import {
  API_SECRETS_LS_KEY,
  CAPABILITY_SECRET_FIELDS,
  SETTINGS_LS_KEY,
  applyCapabilitySecrets,
  applyGroupApiKeys,
  decodeWebApiSecrets,
  decodeWebCapabilitySecrets,
  decodeWebSecrets,
  encodeWebSecrets,
  extractPlainCapabilityKeys,
  extractPlainGroupKeys,
  obfuscateSecret,
  deobfuscateSecret,
  splitSettingsSecrets,
  stripCapabilitySecrets,
  stripGroupApiKeys,
} from "./apiSecrets.ts";
import { EMPTY_CAPABILITY_ENDPOINTS, normalizeCapabilityEndpoints } from "@/lib/ai/endpoints/capabilityEndpoints";
import type { CustomApiGroup } from "@/lib/ai/models";

const groups = (): CustomApiGroup[] => [
  { id: "a", name: "A", baseUrl: "https://a.example/v1", apiKey: "sk-aaa", models: [] },
  { id: "b", name: "B", baseUrl: "https://b.example/v1", apiKey: "sk-bbb", models: [] },
];

test("persist 名 gailvlun-settings-v1 未改；密钥走独立 key", () => {
  assert.equal(SETTINGS_LS_KEY, "gailvlun-settings-v1");
  assert.equal(API_SECRETS_LS_KEY, "gailvlun-api-secrets-v1");
  assert.notEqual(API_SECRETS_LS_KEY, SETTINGS_LS_KEY);
});

test("混淆往返且明文不出现在编码结果里", () => {
  const plain = "sk-live-secret-key";
  const stored = obfuscateSecret(plain);
  assert.notEqual(stored, plain);
  assert.equal(stored.includes("sk-live"), false);
  assert.equal(deobfuscateSecret(stored), plain);
  assert.equal(deobfuscateSecret(plain), plain);
});

test("splitSettingsSecrets：旧 key 存在、新 key 不存在 → 抽出密钥", () => {
  const split = splitSettingsSecrets(groups(), null);
  assert.equal(split.rewriteSettings, true);
  assert.equal(split.rewriteSecrets, true);
  assert.equal(split.groupKeys.a, "sk-aaa");
  assert.equal(split.groupKeys.b, "sk-bbb");
  assert.equal(split.groupsForMemory[0]?.apiKey, "sk-aaa");
  assert.equal(extractPlainGroupKeys(stripGroupApiKeys(split.groupsForMemory)).a, undefined);
});

test("splitSettingsSecrets：新 key 已存在、旧 JSON 已剥离 → 用新 key", () => {
  const stripped = stripGroupApiKeys(groups());
  const secretsRaw = encodeWebSecrets({ a: "sk-aaa", b: "sk-bbb" }, {});
  const split = splitSettingsSecrets(stripped, secretsRaw);
  assert.equal(split.rewriteSettings, false);
  assert.equal(split.rewriteSecrets, false);
  assert.equal(split.groupsForMemory[1]?.apiKey, "sk-bbb");
  assert.equal(JSON.stringify(stripped).includes("sk-aaa"), false);
});

test("splitSettingsSecrets：两者都有 → 新 key 覆盖同 id", () => {
  const oldGroups: CustomApiGroup[] = [
    { id: "a", name: "A", baseUrl: "https://a.example/v1", apiKey: "sk-old-a", models: [] },
    { id: "c", name: "C", baseUrl: "https://c.example/v1", apiKey: "sk-old-c", models: [] },
  ];
  const secretsRaw = encodeWebSecrets({ a: "sk-new-a", b: "sk-new-b" }, {});
  const split = splitSettingsSecrets(oldGroups, secretsRaw);
  assert.equal(split.groupKeys.a, "sk-new-a");
  assert.equal(split.groupKeys.b, "sk-new-b");
  assert.equal(split.groupKeys.c, "sk-old-c");
  assert.equal(split.rewriteSettings, true);
  assert.equal(split.groupsForMemory.find((g) => g.id === "a")?.apiKey, "sk-new-a");
});

test("encodeWebSecrets 不含可直接 grep 的明文", () => {
  const raw = encodeWebSecrets({ a: "sk-aaa" }, {});
  assert.equal(raw.includes("sk-aaa"), false);
  assert.equal(decodeWebSecrets(raw).a, "sk-aaa");
});

test("apply/strip 往返", () => {
  const original = groups();
  const keys = extractPlainGroupKeys(original);
  const stripped = stripGroupApiKeys(original);
  assert.equal(stripped.every((g) => g.apiKey === ""), true);
  const restored = applyGroupApiKeys(stripped, keys);
  assert.deepEqual(restored.map((g) => g.apiKey), ["sk-aaa", "sk-bbb"]);
});

test("splitSettingsSecrets：旧 blob 有能力密钥、新 key 不存在 → 抽出", () => {
  const split = splitSettingsSecrets([], null, undefined, {
    ...EMPTY_CAPABILITY_ENDPOINTS,
    webSearchApiKey: "sk-zhipu",
    imageApiKey: "sk-image",
  });
  assert.equal(split.rewriteSettings, true);
  assert.equal(split.rewriteSecrets, true);
  assert.equal(split.capabilityKeys.webSearchApiKey, "sk-zhipu");
  assert.equal(split.capabilityKeys.imageApiKey, "sk-image");
  assert.equal(split.capabilityForMemory.webSearchApiKey, "sk-zhipu");
  assert.equal(extractPlainCapabilityKeys(stripCapabilitySecrets(split.capabilityForMemory)).webSearchApiKey, undefined);
});

test("splitSettingsSecrets：新 key 已有能力密钥、旧 JSON 已剥离 → 用新 key", () => {
  const secretsRaw = encodeWebSecrets({}, { webSearchApiKey: "sk-zhipu", unsplashAccessKey: "sk-unsplash" });
  const split = splitSettingsSecrets([], secretsRaw, undefined, EMPTY_CAPABILITY_ENDPOINTS);
  assert.equal(split.rewriteSettings, false);
  assert.equal(split.rewriteSecrets, false);
  assert.equal(split.capabilityForMemory.webSearchApiKey, "sk-zhipu");
  assert.equal(split.capabilityForMemory.unsplashAccessKey, "sk-unsplash");
});

test("splitSettingsSecrets：两者都有能力密钥 → 新 key 覆盖同字段，旧多出来的保留", () => {
  const secretsRaw = encodeWebSecrets({}, { webSearchApiKey: "sk-new-search", embeddingApiKey: "sk-embed" });
  const split = splitSettingsSecrets([], secretsRaw, undefined, {
    ...EMPTY_CAPABILITY_ENDPOINTS,
    webSearchApiKey: "sk-old-search",
    imageApiKey: "sk-old-image",
  });
  assert.equal(split.capabilityKeys.webSearchApiKey, "sk-new-search");
  assert.equal(split.capabilityKeys.embeddingApiKey, "sk-embed");
  assert.equal(split.capabilityKeys.imageApiKey, "sk-old-image");
  assert.equal(split.rewriteSettings, true);
  assert.equal(split.capabilityForMemory.imageApiKey, "sk-old-image");
});

test("splitSettingsSecrets：旧 blob 有能力密钥、新 key 已有分组 → 合并且不丢分组", () => {
  const secretsRaw = encodeWebSecrets({ a: "sk-aaa" }, {});
  const split = splitSettingsSecrets(
    stripGroupApiKeys(groups()),
    secretsRaw,
    undefined,
    { ...EMPTY_CAPABILITY_ENDPOINTS, webSearchApiKey: "sk-zhipu" },
  );
  assert.equal(split.groupKeys.a, "sk-aaa");
  assert.equal(split.capabilityKeys.webSearchApiKey, "sk-zhipu");
  assert.equal(split.rewriteSettings, true);
  assert.equal(split.rewriteSecrets, true);
});

test("encodeWebSecrets 能力密钥不含明文；五字段齐全", () => {
  assert.deepEqual([...CAPABILITY_SECRET_FIELDS], [
    "imageApiKey",
    "embeddingApiKey",
    "rerankApiKey",
    "webSearchApiKey",
    "unsplashAccessKey",
  ]);
  const raw = encodeWebSecrets({ a: "sk-aaa" }, { webSearchApiKey: "sk-zhipu" });
  assert.equal(raw.includes("sk-aaa"), false);
  assert.equal(raw.includes("sk-zhipu"), false);
  assert.equal(decodeWebSecrets(raw).a, "sk-aaa");
  assert.equal(decodeWebCapabilitySecrets(raw).webSearchApiKey, "sk-zhipu");
  assert.equal(decodeWebApiSecrets(raw).capability.webSearchApiKey, "sk-zhipu");
  const endpoints = applyCapabilitySecrets(
    stripCapabilitySecrets(normalizeCapabilityEndpoints({ imageBaseUrl: "https://img.example" })),
    { webSearchApiKey: "sk-zhipu" },
  );
  assert.equal(endpoints.imageBaseUrl, "https://img.example");
  assert.equal(endpoints.webSearchApiKey, "sk-zhipu");
  assert.equal(endpoints.imageApiKey, "");
});
