import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authModeForHost,
  authModeForRequest,
  canonicalUrlFor,
  isFirstPartyHost,
  isLegacyHost,
  normalizeHost,
  CANONICAL_SITE_ORIGIN,
} from "./authMode";

test("authModeForHost 的三种返回", () => {
  // 第一方：身份唯一来源是 Account 写在 .1037solo.com 下的共享会话
  assert.equal(authModeForHost("studysolo.1037solo.com"), "account-shared");
  assert.equal(authModeForHost("1037solo.com"), "account-shared");
  assert.equal(authModeForHost("www.1037solo.com"), "account-shared");
  assert.equal(authModeForHost("account.1037solo.com"), "account-shared");
  assert.equal(authModeForHost("study.1037solo.com"), "account-shared");

  // 历史域名：不再单独登录，308 到正式域名
  assert.equal(authModeForHost("notebook1b.husteread.icu"), "redirect-canonical");
  assert.equal(authModeForHost("notebook2a.husteread.icu"), "redirect-canonical");

  // 本地开发：保留自签 OAuth
  assert.equal(authModeForHost("localhost"), "oauth-native");
  assert.equal(authModeForHost("127.0.0.1"), "oauth-native");
  assert.equal(authModeForHost("localhost:35349"), "oauth-native");
});

test("域名大小写与端口不影响判定", () => {
  assert.equal(normalizeHost("  StudySolo.1037Solo.com:443 "), "studysolo.1037solo.com");
  assert.equal(authModeForHost("StudySolo.1037Solo.COM"), "account-shared");
  assert.equal(authModeForHost("notebook1b.husteread.icu:443"), "redirect-canonical");
});

test("只有精确的主域或子域算第一方，伪装域名不算", () => {
  assert.equal(isFirstPartyHost("1037solo.com"), true);
  assert.equal(isFirstPartyHost("a.b.1037solo.com"), true);
  // 关键攻击面：后缀伪装不得被当作第一方
  assert.equal(isFirstPartyHost("1037solo.com.evil.test"), false);
  assert.equal(isFirstPartyHost("evil1037solo.com"), false);
  assert.equal(isFirstPartyHost("not1037solo.com"), false);
  assert.equal(isFirstPartyHost("husteread.icu"), false);
  assert.equal(authModeForHost("1037solo.com.evil.test"), "oauth-native");
});

test("旧域名判定与第一方判定互斥且不重叠", () => {
  for (const host of ["studysolo.1037solo.com", "notebook1b.husteread.icu", "localhost", "evil.test"]) {
    assert.equal(isFirstPartyHost(host) && isLegacyHost(host), false, host);
  }
  assert.equal(isLegacyHost("notebook2a.husteread.icu"), true);
  assert.equal(isLegacyHost("studysolo.1037solo.com"), false);
});

test("authModeForRequest 以 Host 头为准，缺失时回退 nextUrl", () => {
  const withHost = (host: string | null) =>
    authModeForRequest({
      headers: { get: (n: string) => (n.toLowerCase() === "host" ? host : null) },
      nextUrl: { host: "fallback.example" },
    });
  assert.equal(withHost("studysolo.1037solo.com"), "account-shared");
  assert.equal(withHost("notebook2a.husteread.icu"), "redirect-canonical");
  assert.equal(withHost(null), "oauth-native");
});

test("canonicalUrlFor 保留路径与查询串", () => {
  assert.equal(canonicalUrlFor("/login"), `${CANONICAL_SITE_ORIGIN}/login`);
  assert.equal(
    canonicalUrlFor("/login", "?next=%2Fclass%3Fa%3D1"),
    `${CANONICAL_SITE_ORIGIN}/login?next=%2Fclass%3Fa%3D1`,
  );
  assert.equal(
    canonicalUrlFor("/api/account/session"),
    `${CANONICAL_SITE_ORIGIN}/api/account/session`,
  );
});

test("界面与接口必须拿到同一个判定（不得再靠环境变量隐式开关）", () => {
  // 这是本次修复的核心约束：登录按钮、/api/account/session、proxy、AI 网关
  // 全部经由 authModeForHost，因此对同一主机名必然得到同一个答案。
  for (const host of ["studysolo.1037solo.com", "notebook1b.husteread.icu", "localhost"]) {
    const a = authModeForHost(host);
    const b = authModeForRequest({
      headers: { get: () => host },
      nextUrl: { host },
    });
    assert.equal(a, b, host);
  }
});
