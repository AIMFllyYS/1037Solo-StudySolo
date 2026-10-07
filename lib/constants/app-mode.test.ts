import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_MODE_LABELS,
  APP_MODE_PATHS,
  APP_NAME,
  appModeFromPathname,
  appModeTitle,
  hrefForAppMode,
  hrefForMobileAppMode,
  isAppMode,
  isAppModePath,
  isAgentPluginsPath,
  isAgentAssetsPath,
  isAuthPath,
  isRememberableStudioPath,
  parseAppMode,
  parseAppModePersist,
  resolveAppMode,
  resolveMobileAppMode,
  usesMobileStudioChrome,
  usesStudioChrome,
} from "./app-mode";

test("模式表与顶栏文案：StudySolo · Studio", () => {
  assert.equal(APP_NAME, "StudySolo");
  assert.equal(appModeTitle("studio"), "StudySolo · Studio");
  assert.equal(appModeTitle("agent"), "StudySolo · Agent");
  assert.equal(appModeTitle("class"), "StudySolo · Class");
  assert.equal(appModeTitle("review"), "StudySolo · Review");
  assert.deepEqual(APP_MODE_LABELS, { studio: "Studio", agent: "Agent", class: "Class", review: "Review" });
  assert.deepEqual(APP_MODE_PATHS, { studio: "/", agent: "/agent", class: "/class", review: "/review" });
});

test("isAppMode / parseAppMode 拒绝未知值", () => {
  assert.equal(isAppMode("studio"), true);
  assert.equal(isAppMode("agent"), true);
  assert.equal(isAppMode("class"), true);
  assert.equal(isAppMode("review"), true);
  assert.equal(isAppMode("nope"), false);
  assert.equal(parseAppMode("class"), "class");
  assert.equal(parseAppMode("review"), "review");
  assert.equal(parseAppMode("nope"), "studio");
  assert.equal(parseAppMode(null), "studio");
});

test("Review 模式：/review 顶层路由独立成壳，学科复习页 /<subject>/review 仍归 Studio", () => {
  assert.equal(appModeFromPathname("/review"), "review");
  assert.equal(appModeFromPathname("/review/"), "review");
  assert.equal(isAppModePath("/review"), true);
  assert.equal(usesStudioChrome("/review"), false);
  assert.equal(usesMobileStudioChrome("/review"), false);
  assert.equal(resolveAppMode("/review", "studio"), "review");
  assert.equal(resolveMobileAppMode("/review", "studio"), "review");
  assert.equal(hrefForAppMode("review", "/anatomy/detail/1.1"), "/review");
  assert.equal(hrefForMobileAppMode("review", "/anatomy/detail/1.1"), "/review");
  // /review 不是「回 Studio 的落点」。
  assert.equal(isRememberableStudioPath("/review"), false);
  // app/review 静态段优先于 [subject]，学科复习页（/<subject>/review/...）仍是 Studio。
  assert.equal(appModeFromPathname("/anatomy/review/1.1"), "studio");
  assert.equal(usesStudioChrome("/anatomy/review/1.1"), true);
});

test("pathname 映射：Agent / Class 独立，登录不改 persist", () => {
  assert.equal(appModeFromPathname("/agent"), "agent");
  assert.equal(appModeFromPathname("/agent/"), "agent");
  assert.equal(appModeFromPathname("/class"), "class");
  assert.equal(appModeFromPathname("/login"), null);
  assert.equal(appModeFromPathname("/"), "studio");
  assert.equal(appModeFromPathname("/anatomy/detail/1.1"), "studio");
  assert.equal(isAppModePath("/agent"), true);
  assert.equal(isAppModePath("/class"), true);
  assert.equal(isAppModePath("/"), false);
  assert.equal(isAuthPath("/login"), true);
  assert.equal(usesStudioChrome("/"), true);
  assert.equal(usesStudioChrome("/login"), true);
  assert.equal(usesStudioChrome("/agent"), false);
  assert.equal(usesStudioChrome("/class"), false);
  assert.equal(usesMobileStudioChrome("/"), true);
  assert.equal(usesMobileStudioChrome("/agent"), true);
  assert.equal(usesMobileStudioChrome("/login"), true);
  assert.equal(usesMobileStudioChrome("/anatomy/detail/1.1"), true);
  assert.equal(usesMobileStudioChrome("/class"), false);
});

test("C 路由 /c/<sessionId> 归 Agent；分享页 /s/<id> 保持 Studio 默认", () => {
  // 打开 /c/<id> 就是进 Agent 工作区（左栏 + 中央对话 + 右侧工作区）。
  assert.equal(appModeFromPathname("/c/6f1c2a4b8d90"), "agent");
  assert.equal(appModeFromPathname("/c/6f1c2a4b8d90/"), "agent");
  assert.equal(isAppModePath("/c/6f1c2a4b8d90"), true);
  assert.equal(usesStudioChrome("/c/6f1c2a4b8d90"), false);
  assert.equal(resolveAppMode("/c/6f1c2a4b8d90", "studio"), "agent");
  // 深链不是「回 Studio 的落点」：切回 Studio 不该落到某一条对话上。
  assert.equal(isRememberableStudioPath("/c/6f1c2a4b8d90"), false);
  // 手机与 /agent 同口径：仍用 Studio 五段底栏，但标题/persist 判成 Agent。
  assert.equal(usesMobileStudioChrome("/c/6f1c2a4b8d90"), true);
  assert.equal(resolveMobileAppMode("/c/6f1c2a4b8d90", "studio"), "agent");

  // 分享公开页是独立公开页，不是 Agent 工作区：既不加进 isAppModePath，也不改默认的 studio 判定
  // （它的裸壳由 AppShell 自己分支，见 share 契约）。
  assert.equal(appModeFromPathname("/s/6f1c2a4b8d90"), "studio");
  assert.equal(isAppModePath("/s/6f1c2a4b8d90"), false);
  assert.equal(usesStudioChrome("/s/6f1c2a4b8d90"), true);
});

test("resolveAppMode：URL 优先，登录页当 Studio 壳", () => {
  assert.equal(resolveAppMode("/agent", "studio"), "agent");
  assert.equal(resolveAppMode("/class", "studio"), "class");
  assert.equal(resolveAppMode("/", "agent"), "studio");
  assert.equal(resolveAppMode("/login", "agent"), "studio");
});

test("mobile plugin account management is a precise exception to the Studio shell", () => {
  for (const path of ["/agent/plugins", "/agent/plugins/", "/agent/plugins/mcp/google"]) {
    assert.equal(isAgentPluginsPath(path), true);
    assert.equal(usesMobileStudioChrome(path), false);
    assert.equal(resolveMobileAppMode(path, "studio"), "agent");
  }
  for (const path of ["/agent/pluginsevil", "/agent/plugins-other", "/agent", "/agent/scheduled"]) {
    assert.equal(isAgentPluginsPath(path), false);
    assert.equal(usesMobileStudioChrome(path), true);
  }
});
test('mobile asset management remains accessible without admitting arbitrary Agent pages', () => {
  assert.equal(isAgentAssetsPath('/agent/assets'), true);
  assert.equal(isAgentAssetsPath('/agent/assets/file/cloud-id'), true);
  assert.equal(usesMobileStudioChrome('/agent/assets'), false);
  assert.equal(isAgentAssetsPath('/agent/assetsevil'), false);
  assert.equal(usesMobileStudioChrome('/agent/projects'), true);
  assert.equal(usesMobileStudioChrome('/agent'), true);
});

test("resolveMobileAppMode：Studio 路由可保留 persist 的 Agent", () => {
  assert.equal(resolveMobileAppMode("/", "agent"), "agent");
  assert.equal(resolveMobileAppMode("/anatomy/detail/1.1", "agent"), "agent");
  assert.equal(resolveMobileAppMode("/", "studio"), "studio");
  assert.equal(resolveMobileAppMode("/class", "agent"), "class");
  assert.equal(resolveMobileAppMode("/login", "agent"), "studio");
  assert.equal(resolveMobileAppMode("/agent", "studio"), "agent");
});

test("切回 Studio 走 lastStudioPath，忽略 Agent/Class/登录路径", () => {
  assert.equal(isRememberableStudioPath("/anatomy/detail/1.1"), true);
  assert.equal(isRememberableStudioPath("/agent"), false);
  assert.equal(isRememberableStudioPath("/login"), false);
  assert.equal(hrefForAppMode("agent", "/anatomy/detail/1.1"), "/agent");
  assert.equal(hrefForAppMode("class", "/anatomy/detail/1.1"), "/class");
  assert.equal(hrefForAppMode("studio", "/anatomy/detail/1.1"), "/anatomy/detail/1.1");
  assert.equal(hrefForAppMode("studio", "/agent"), "/");
  assert.equal(hrefForMobileAppMode("agent", "/anatomy/detail/1.1"), "/anatomy/detail/1.1");
  assert.equal(hrefForMobileAppMode("class", "/anatomy/detail/1.1"), "/class");
  assert.equal(hrefForMobileAppMode("studio", "/anatomy/detail/1.1"), "/anatomy/detail/1.1");
});

test("persist JSON 与裸字符串兼容", () => {
  assert.deepEqual(parseAppModePersist(null), { mode: "studio", lastStudioPath: "/" });
  assert.deepEqual(
    parseAppModePersist(JSON.stringify({ mode: "agent", lastStudioPath: "/physics/detail/1.1" })),
    { mode: "agent", lastStudioPath: "/physics/detail/1.1" },
  );
  assert.deepEqual(
    parseAppModePersist(JSON.stringify({ mode: "nope", lastStudioPath: "/agent" })),
    { mode: "studio", lastStudioPath: "/" },
  );
  assert.deepEqual(parseAppModePersist("class"), { mode: "class", lastStudioPath: "/" });
  assert.deepEqual(parseAppModePersist("{"), { mode: "studio", lastStudioPath: "/" });
});

test("mobile Agent return rejects a plugin route stored as lastStudioPath", () => {
  assert.equal(isRememberableStudioPath('/agent/plugins'), false);
  const restored = parseAppModePersist(JSON.stringify({ mode: 'agent', lastStudioPath: '/agent/plugins' }));
  assert.deepEqual(restored, { mode: 'agent', lastStudioPath: '/' });
  assert.equal(hrefForMobileAppMode('agent', '/agent/plugins'), '/');
  assert.equal(hrefForMobileAppMode('agent', '/probability/detail/1.1'), '/probability/detail/1.1');
});
