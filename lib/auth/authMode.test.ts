import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountBackendUrl,
  authModeForHost,
  authModeForRequest,
  canonicalUrlFor,
  isFirstPartyHost,
  isLegacyHost,
  isLocalDevHost,
  normalizeHost,
  CANONICAL_SITE_ORIGIN,
  LOCAL_ACCOUNT_BACKEND_URL,
  LOCAL_ACCOUNT_URL,
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

  // 本机开发：与线上同一套共享会话，Account 跑在本机
  assert.equal(authModeForHost("localhost"), "account-local");
  assert.equal(authModeForHost("127.0.0.1"), "account-local");
  assert.equal(authModeForHost("localhost:35349"), "account-local");
  assert.equal(authModeForHost("[::1]:35349"), "account-local");

  // 生产构建里的 localhost 行为不变
  assert.equal(authModeForHost("localhost:35349", "production"), "oauth-native");
  assert.equal(authModeForHost("studysolo.1037solo.com", "production"), "account-shared");
});

test("本机开发不是历史域名：绝不跳到线上", () => {
  for (const host of ["localhost", "127.0.0.1", "localhost:35349"]) {
    assert.equal(isLocalDevHost(host), true, host);
    assert.equal(isLegacyHost(host), false, host);
    assert.equal(isFirstPartyHost(host), false, host);
  }
  assert.equal(isLocalDevHost("localhost", "production"), false);
  assert.equal(isLocalDevHost("localhost.evil.test"), false);
  assert.equal(isLocalDevHost("studysolo.1037solo.com"), false);
});

test("accountBackendUrl：线上只认配置，本机开发只用本机", () => {
  // 线上：只读配置，未配置返回空串（路由报 503），不做任何回退
  assert.equal(accountBackendUrl("account-shared", "https://account.1037solo.com/"), "https://account.1037solo.com");
  assert.equal(accountBackendUrl("account-shared", ""), "");
  assert.equal(accountBackendUrl("account-shared", undefined), "");
  // 本机开发：未配置用本机 3041；配置了本机地址就用它；配置成线上地址也改回本机
  assert.equal(accountBackendUrl("account-local", undefined), LOCAL_ACCOUNT_BACKEND_URL);
  assert.equal(accountBackendUrl("account-local", "http://localhost:4041"), "http://localhost:4041");
  assert.equal(accountBackendUrl("account-local", "https://account.1037solo.com"), LOCAL_ACCOUNT_BACKEND_URL);
  assert.equal(LOCAL_ACCOUNT_BACKEND_URL, "http://127.0.0.1:3041");
  assert.equal(LOCAL_ACCOUNT_URL, "http://localhost:3040");
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
