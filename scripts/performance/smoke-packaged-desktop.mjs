import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, parse, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron as electron } from "playwright-core";

const PORT = 35349;
const STARTUP_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const APP_ORIGIN = "http://127.0.0.1:" + PORT;
const RUN_ID = process.env.GITHUB_RUN_ID || randomUUID();
const ARTIFACT_DIR = resolve("artifacts/performance/client-ui-smoke");

function parseRootArg(argv) {
  const arg = argv.find((value) => value.startsWith("--root="));
  if (!arg) throw new Error("usage: --root=dist-desktop-staged-<id>/win-unpacked");
  const root = resolve(arg.slice("--root=".length));
  const relativeRoot = relative(process.cwd(), root).replaceAll("\\", "/");
  if (!/^dist-desktop-staged-[a-z0-9-]+\/win-unpacked$/.test(relativeRoot)) {
    throw new Error("unsafe_packaged_smoke_root");
  }
  return root;
}

function isolatedWindowsEnvironment() {
  const original = process.env;
  const profileRoot = join(original.RUNNER_TEMP || tmpdir(), "studysolo-blank-profile-" + randomUUID());
  const appData = join(profileRoot, "Roaming");
  const localAppData = join(profileRoot, "Local");
  const temp = join(profileRoot, "Temp");
  for (const directory of [profileRoot, appData, localAppData, temp]) mkdirSync(directory, { recursive: true });

  // Start Electron with only OS runtime paths and a fresh profile, never the
  // CI runner's workflow, provider, Account, or signing environment.
  const inheritedNames = [
    "PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "OS", "PROCESSOR_ARCHITECTURE",
    "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles", "CommonProgramFiles(x86)",
  ];
  const env = Object.fromEntries(inheritedNames.filter((name) => original[name]).map((name) => [name, original[name]]));
  const root = parse(profileRoot).root;
  const homePath = relative(root, profileRoot).replaceAll("/", sep).replaceAll("\\", sep);
  env.APPDATA = appData;
  env.LOCALAPPDATA = localAppData;
  env.TEMP = temp;
  env.TMP = temp;
  env.USERPROFILE = profileRoot;
  env.HOMEDRIVE = root.replace(/[\\/]+$/, "");
  env.HOMEPATH = sep + homePath;
  env.NODE_ENV = "production";
  return { env, appData };
}

async function localStatus() {
  try {
    const response = await fetch(APP_ORIGIN + "/", { signal: AbortSignal.timeout(1_500) });
    return response.status;
  } catch {
    return null;
  }
}

async function waitForLocalStatus(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await localStatus() === expected) return;
    await delay(500);
  }
  throw new Error(expected === null ? "packaged_app_server_did_not_stop" : "packaged_app_server_health_timeout");
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const finish = (result) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolvePromise(result);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(child.exitCode !== null), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopApplication(application) {
  if (!application) return;
  const child = application.process();
  if (child.exitCode === null) {
    try {
      // This is the app's own quit path, so before-quit can stop its bundled server.
      await application.evaluate(({ app }) => app.quit());
    } catch {
      // A prior startup failure may already have closed the main process.
    }
    if (!(await waitForProcessExit(child, SHUTDOWN_TIMEOUT_MS))) {
      try {
        await application.close();
      } catch {
        // Fall through to a bounded cleanup of this Playwright-owned process tree.
      }
    }
    if (!(await waitForProcessExit(child, 10_000)) && child.exitCode === null) {
      const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 15_000,
      });
      if (result.error || result.status !== 0) throw new Error("owned_packaged_app_tree_cleanup_failed");
      await waitForProcessExit(child, 10_000);
      throw new Error("packaged_app_required_forced_cleanup");
    }
  }
}

async function launchPackagedApp(executable, profile) {
  if (await localStatus() !== null) throw new Error("desktop_smoke_port_already_in_use");
  const application = await electron.launch({
    executablePath: executable,
    args: [],
    cwd: process.cwd(),
    env: profile.env,
    timeout: STARTUP_TIMEOUT_MS,
  });
  try {
    const page = await application.firstWindow({ timeout: STARTUP_TIMEOUT_MS });
    await page.waitForLoadState("domcontentloaded", { timeout: STARTUP_TIMEOUT_MS });
    await waitForLocalStatus(200, STARTUP_TIMEOUT_MS);
    const userDataPath = await application.evaluate(({ app }) => app.getPath("userData"));
    const expectedUserData = resolve(profile.appData, "Gailvlun");
    if (userDataPath.toLowerCase() !== expectedUserData.toLowerCase()) {
      throw new Error("legacy_user_data_path_not_isolated");
    }
    for (const filename of ["keys.enc", "custom-api-secrets.enc"]) {
      if (existsSync(join(userDataPath, filename))) {
        throw new Error("unexpected_credential_file_in_blank_profile:" + filename);
      }
    }
    return { application, page };
  } catch (error) {
    await stopApplication(application).catch(() => {});
    throw error;
  }
}

async function openRoute(page, route) {
  await page.goto(APP_ORIGIN + route, { waitUntil: "domcontentloaded", timeout: STARTUP_TIMEOUT_MS });
  await page.waitForLoadState("networkidle", { timeout: 45_000 });
}

async function assertGuestAgentState(page, runNumber) {
  const notice = page.getByTestId("chat-access-notice");
  await notice.waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await notice.getByRole("button").waitFor({ state: "visible", timeout: 10_000 });

  const stopActions = await page.locator("button").evaluateAll((buttons) => buttons
    .filter((button) => /stop generating|停止生成|中止生成/i.test([
      button.getAttribute("title") || "",
      button.getAttribute("aria-label") || "",
      button.innerText || "",
    ].join(" ")))
    .map((button) => button.getAttribute("title") || button.getAttribute("aria-label") || "stop"));
  if (stopActions.length > 0) throw new Error("guest_agent_rendered_false_stop_action");

  const layout = await page.evaluate(() => {
    const root = document.querySelector("[data-agent-global]");
    const main = root?.querySelector('[data-panel-id="agent-shell-main"]');
    const dock = root?.querySelector('[data-panel-id="agent-shell-dock"]');
    if (!main || !dock) return null;
    const mainWidth = main.getBoundingClientRect().width;
    const dockWidth = dock.getBoundingClientRect().width;
    return {
      mainWidth,
      dockWidth,
      dockRatio: dockWidth / (mainWidth + dockWidth),
    };
  });
  if (!layout || layout.mainWidth <= 0 || layout.dockWidth <= 0 || layout.dockRatio < 0.52 || layout.dockRatio > 0.68) {
    throw new Error("agent_default_dock_ratio_out_of_range");
  }

  const screenshot = join(ARTIFACT_DIR, "studysolo-agent-guest-run-" + runNumber + "-" + RUN_ID + ".png");
  await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
  return { layout, screenshot, signedOutNoticeVisible: true, loginActionVisible: true, stopActionCount: 0 };
}

async function guestWebContentsState(application, webContentsId) {
  return application.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id);
    if (!guest) throw new Error("browser_webview_contents_missing");
    return {
      type: guest.getType(),
      url: guest.getURL(),
      zoomFactor: guest.getZoomFactor(),
      metrics: await guest.executeJavaScript("({timeOrigin:performance.timeOrigin,innerWidth:window.innerWidth,devicePixelRatio:window.devicePixelRatio})"),
    };
  }, webContentsId);
}

async function waitForGuestState(application, webContentsId, predicate, failure, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await guestWebContentsState(application, webContentsId);
      if (predicate(state)) return state;
    } catch {
      // The embedded renderer may be navigating. Retry against the same guest ID.
    }
    await delay(250);
  }
  throw new Error(failure);
}

async function testBrowserTabNativeZoom(application, page) {
  await openRoute(page, "/");
  const browserTab = page.getByTestId("center-tab-browser");
  await browserTab.waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await browserTab.click();

  const toolbar = page.locator(".mobile-browser-toolbar");
  const addressInput = toolbar.locator("input");
  await addressInput.waitFor({ state: "visible", timeout: 30_000 });
  await addressInput.fill(APP_ORIGIN + "/agent");
  await addressInput.press("Enter");

  const webview = page.locator("webview");
  await webview.waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForFunction(() => {
    const view = document.querySelector("webview");
    return !!view && typeof view.getWebContentsId === "function" && view.getURL().startsWith(location.origin + "/agent");
  }, undefined, { timeout: 60_000 });
  const webContentsId = await webview.evaluate((view) => view.getWebContentsId());
  const baseline = await waitForGuestState(
    application,
    webContentsId,
    (state) => state.url.startsWith(APP_ORIGIN + "/agent") && Math.abs(state.zoomFactor - 1) < 0.001,
    "browser_webview_did_not_load_self_owned_test_route",
    60_000,
  );
  if (baseline.type !== "webview") throw new Error("browser_route_was_not_running_in_native_webview_guest");

  await page.getByTestId("browser-page-controls").click();
  await page.getByTestId("browser-zoom-in").click();
  const zoomed = await waitForGuestState(
    application,
    webContentsId,
    (state) => Math.abs(state.zoomFactor - 1.1) < 0.01,
    "browser_tab_zoom_did_not_reach_native_webview",
  );
  const menuValue = await (async () => {
    await page.getByTestId("browser-page-controls").click();
    const value = await page.getByTestId("browser-zoom-in").innerText();
    if (!/110%/.test(value)) throw new Error("browser_zoom_menu_did_not_report_110_percent");
    return value;
  })();
  await page.keyboard.press("Escape");
  const zoomScreenshot = join(ARTIFACT_DIR, "studysolo-browser-webview-zoom-110-" + RUN_ID + ".png");
  await page.screenshot({ path: zoomScreenshot, fullPage: false, animations: "disabled" });

  await page.getByTestId("browser-page-controls").click();
  await page.getByTestId("browser-menu-refresh").click();
  const refreshed = await waitForGuestState(
    application,
    webContentsId,
    (state) => state.metrics.timeOrigin !== baseline.metrics.timeOrigin && Math.abs(state.zoomFactor - 1.1) < 0.01,
    "browser_tab_refresh_did_not_reload_native_webview_at_current_zoom",
    30_000,
  );

  await page.getByTestId("browser-page-controls").click();
  await page.getByTestId("browser-zoom-reset").click();
  const reset = await waitForGuestState(
    application,
    webContentsId,
    (state) => Math.abs(state.zoomFactor - 1) < 0.001,
    "browser_tab_reset_did_not_restore_native_webview_to_100_percent",
  );

  return {
    testRoute: "/agent (self-owned local app content)",
    guestWebContentsType: baseline.type,
    baselineZoomFactor: baseline.zoomFactor,
    zoomedFactor: zoomed.zoomFactor,
    zoomMenuValue: menuValue,
    refreshAdvancedTimeOrigin: refreshed.metrics.timeOrigin !== baseline.metrics.timeOrigin,
    zoomFactorAfterRefresh: refreshed.zoomFactor,
    resetFactor: reset.zoomFactor,
    screenshot: zoomScreenshot,
    publicWebsiteCompatibility: "not tested",
  };
}

async function runSmoke(executable, profile, runNumber, testBrowser) {
  const { application, page } = await launchPackagedApp(executable, profile);
  let primaryError;
  let agentEvidence;
  let browserEvidence;
  try {
    await openRoute(page, "/agent");
    agentEvidence = await assertGuestAgentState(page, runNumber);
    if (testBrowser) browserEvidence = await testBrowserTabNativeZoom(application, page);
  } catch (error) {
    primaryError = error;
  }

  try {
    await stopApplication(application);
    await waitForLocalStatus(null, 20_000);
  } catch (error) {
    primaryError ??= error;
  }
  if (primaryError) throw primaryError;
  return { agent: agentEvidence, browser: browserEvidence };
}

async function main() {
  if (process.platform !== "win32") throw new Error("packaged_desktop_smoke_requires_windows");
  const root = parseRootArg(process.argv.slice(2));
  const executable = join(root, "StudySolo.exe");
  if (!existsSync(executable)) throw new Error("packaged_studysolo_executable_missing");
  if (await localStatus() !== null) throw new Error("desktop_smoke_port_already_in_use");

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const profile = isolatedWindowsEnvironment();
  const firstRun = await runSmoke(executable, profile, 1, true);
  const secondRun = await runSmoke(executable, profile, 2, false);
  const evidencePath = join(ARTIFACT_DIR, "studysolo-electron-ui-smoke-" + RUN_ID + ".json");
  const evidence = {
    product: "StudySolo",
    appId: "com.gailvlun.desktop",
    localPort: PORT,
    runs: 2,
    userData: "isolated temporary APPDATA/Gailvlun verified",
    agentGuest: firstRun.agent,
    browserTab: firstRun.browser,
    reopenGuest: secondRun.agent,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify({ result: "passed", evidencePath, screenshots: [firstRun.agent.screenshot, firstRun.browser.screenshot], dockRatio: firstRun.agent.layout.dockRatio, nativeZoom: firstRun.browser.zoomedFactor, refresh: firstRun.browser.refreshAdvancedTimeOrigin, reset: firstRun.browser.resetFactor }) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "packaged_app_smoke_failed") + "\n");
  process.exitCode = 1;
});
