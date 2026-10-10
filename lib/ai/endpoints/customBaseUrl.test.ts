import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSafeCustomBaseUrl,
  checkCustomBaseUrl,
  UnsafeCustomBaseUrlError,
} from "./customBaseUrl.ts";

function assertRejected(raw: string, reason: "invalid" | "protocol" | "private") {
  const result = checkCustomBaseUrl(raw);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, reason);
    assert.match(result.message, /自定义 API 地址/);
  }
  assert.throws(
    () => assertSafeCustomBaseUrl(raw),
    (err: unknown) => err instanceof UnsafeCustomBaseUrlError && err.reason === reason,
  );
}

test("checkCustomBaseUrl：https 公网端点可用", () => {
  const result = checkCustomBaseUrl("  https://api.openai.com/v1  ");
  assert.deepEqual(result, { ok: true, url: "https://api.openai.com/v1" });
  assert.equal(assertSafeCustomBaseUrl("https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1");
});

test("checkCustomBaseUrl：http 公网端点可用", () => {
  const result = checkCustomBaseUrl("http://api.example.com/v1");
  assert.deepEqual(result, { ok: true, url: "http://api.example.com/v1" });
});

test("checkCustomBaseUrl：公网 IPv4 / IPv6 可用", () => {
  assert.equal(checkCustomBaseUrl("https://8.8.8.8/v1").ok, true);
  assert.equal(checkCustomBaseUrl("http://172.32.0.1/v1").ok, true);
  assert.equal(checkCustomBaseUrl("https://[2001:4860:4860::8888]/v1").ok, true);
  assert.equal(checkCustomBaseUrl("http://[::ffff:808:808]/v1").ok, true);
});

test("checkCustomBaseUrl：拒绝非 http(s) 协议", () => {
  assertRejected("file:///etc/passwd", "protocol");
  assertRejected("ftp://api.example.com/v1", "protocol");
  assertRejected("javascript:alert(1)", "protocol");
  assertRejected("ws://api.example.com/v1", "protocol");
});

test("checkCustomBaseUrl：拒绝回环主机", () => {
  assertRejected("http://localhost/v1", "private");
  assertRejected("http://LocalHost/v1", "private");
  assertRejected("http://foo.localhost/v1", "private");
  assertRejected("http://127.0.0.1/v1", "private");
  assertRejected("http://127.1/v1", "private");
  assertRejected("http://0x7f000001/v1", "private");
  assertRejected("http://2130706433/v1", "private");
  assertRejected("http://[::1]/v1", "private");
  assertRejected("http://[::ffff:127.0.0.1]/v1", "private");
});

test("checkCustomBaseUrl：拒绝私网与链路本地", () => {
  assertRejected("http://10.0.0.8/v1", "private");
  assertRejected("http://172.16.0.1/v1", "private");
  assertRejected("http://172.31.255.255/v1", "private");
  assertRejected("https://192.168.1.1/v1", "private");
  assertRejected("http://169.254.169.254/latest", "private");
  assertRejected("http://100.64.0.1/v1", "private");
  assertRejected("http://0.0.0.0/v1", "private");
  assertRejected("http://[fe80::1]/v1", "private");
  assertRejected("http://[fd00::1]/v1", "private");
  assertRejected("http://foo.local/v1", "private");
  assertRejected("http://myserver/v1", "private");
});

test("checkCustomBaseUrl：拒绝无效地址", () => {
  assertRejected("", "invalid");
  assertRejected("   ", "invalid");
  assertRejected("not a url", "invalid");
  assertRejected("https://", "invalid");
});
