import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeOpenAIBaseUrl } from "./openaiBaseUrl.ts";

const require = createRequire(import.meta.url);
const electronFn = require(join(dirname(fileURLToPath(import.meta.url)), "../../../electron/openaiBaseUrl.js"))
  .normalizeOpenAIBaseUrl as typeof normalizeOpenAIBaseUrl;

const CASES: Array<[string, string]> = [
  ["https://relay.protocom.org/", "https://relay.protocom.org/v1"],
  ["https://relay.protocom.org/v1", "https://relay.protocom.org/v1"],
  ["https://relay.protocom.org/v1/", "https://relay.protocom.org/v1"],
  ["https://relay.protocom.org", "https://relay.protocom.org/v1"],
  ["https://proxy.io/anthropic", "https://proxy.io/anthropic/v1"],
  ["https://proxy.io/anthropic/", "https://proxy.io/anthropic/v1"],
  ["https://proxy.io/anthropic/v1", "https://proxy.io/anthropic/v1"],
  ["", ""],
  ["   ", ""],
];

test("normalizeOpenAIBaseUrl：带 /v1、不带、尾斜杠、/anthropic 后缀均幂等", () => {
  for (const [input, expected] of CASES) {
    assert.equal(normalizeOpenAIBaseUrl(input), expected, input);
  }
});

test("Electron 连通性测试与运行时共用同一套 /v1 归一化", () => {
  for (const [input] of CASES) {
    assert.equal(electronFn(input), normalizeOpenAIBaseUrl(input), input);
  }
});
