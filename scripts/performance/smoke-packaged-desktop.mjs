import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, parse, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const PORT = 35349;
const STARTUP_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const APP_ORIGIN = "http://127.0.0.1:" + PORT;
const RUN_ID = process.env.GITHUB_RUN_ID || randomUUID();
const ARTIFACT_DIR = resolve("artifacts/performance/client-ui-smoke");
export const INSPECTOR_URL_RE = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+)/;
const MAX_PENDING_LOG_LINE = 16_384;

export function redact(value) {
  return String(value)
    .replace(/(?:https?|wss?):\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(/(token|signature|sig|key)=([^&\s]*)/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED_TOKEN]")
    .replace(/(password|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

/** Buffers fragmented stdout/stderr lines without retaining an unbounded partial line. */
export class BoundedLineCollector {
  constructor(onLine, maxPendingChars = MAX_PENDING_LOG_LINE) {
    this.onLine = onLine;
    this.maxPendingChars = maxPendingChars;
    this.pending = "";
    this.discarding = false;
  }

  write(chunk) {
    const lines = (this.pending + String(chunk)).split("\n");
    this.pending = lines.pop() ?? "";
    for (const rawLine of lines) {
      if (this.discarding) {
        this.discarding = false;
        continue;
      }
      const line = rawLine.replace(/\r$/, "");
      if (line.length <= this.maxPendingChars) this.onLine(line);
    }
    if (this.discarding) {
      if (this.pending.length > 0) this.pending = "";
    } else if (this.pending.length > this.maxPendingChars) {
      this.pending = "";
      this.discarding = true;
    }
  }

  flush() {
    if (!this.discarding && this.pending.length > 0 && this.pending.length <= this.maxPendingChars) {
      this.onLine(this.pending.replace(/\r$/, ""));
    }
    this.pending = "";
    this.discarding = false;
  }
}

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

  // Only inherit the Windows runtime paths; the packaged app gets a fresh,
  // isolated profile and no workflow/provider/Account/signing environment.
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

async function waitForLocalStatus(expected, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error("packaged_app_exited_early:" + child.exitCode);
    }
    if (await localStatus() === expected) return;
    await delay(500);
  }
  throw new Error(expected === null ? "packaged_app_server_did_not_stop" : "packaged_app_server_health_timeout");
}

export function waitForProcessExit(child, timeoutMs) {
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

export class NodeInspectorClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      let packet;
      try {
        packet = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (packet.id === undefined) return;
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(packet.id);
      if (packet.error) pending.reject(new Error("inspector_command_failed:" + pending.method));
      else pending.resolve(packet.result || {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("inspector_connection_closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    if (!/^ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+$/.test(url)) {
      throw new Error("unexpected_inspector_endpoint");
    }
    if (typeof WebSocket !== "function") throw new Error("node_websocket_unavailable");
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => rejectPromise(new Error("inspector_connect_timeout")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolvePromise();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        rejectPromise(new Error("inspector_connect_failed"));
      }, { once: true });
    });
    return new NodeInspectorClient(socket);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error("inspector_command_timeout:" + method));
      }, 15_000);
      this.pending.set(id, { method, resolve: resolvePromise, reject: rejectPromise, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.socket.readyState !== 1) return;
    await new Promise((resolvePromise) => {
      const finish = () => {
        clearTimeout(timer);
        resolvePromise();
      };
      const timer = setTimeout(finish, 1_500);
      this.socket.addEventListener("close", finish, { once: true });
      this.socket.close();
    });
  }
}

async function evaluateMain(inspector, expression) {
  const response = await inspector.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error("main_process_evaluation_failed");
  return response.result?.value;
}

function mainIife(body) {
  return "(async()=>{const electron=process.mainModule&&process.mainModule.require('electron');"
    + "if(!electron)throw new Error('electron_main_module_unavailable');"
    + body
    + "})()";
}

export function connectChildOutput(child) {
  const state = { inspectorUrl: null, lines: [] };
  const consumeLine = (kind, line) => {
    if (kind === "stderr") {
      const match = line.match(INSPECTOR_URL_RE);
      if (match && !state.inspectorUrl) state.inspectorUrl = match[1];
    }
    state.lines.push(kind + ": " + redact(line));
    if (state.lines.length > 400) state.lines.shift();
  };
  const stdout = new BoundedLineCollector((line) => consumeLine("stdout", line));
  const stderr = new BoundedLineCollector((line) => consumeLine("stderr", line));
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => stdout.write(chunk));
  child.stderr?.on("data", (chunk) => stderr.write(chunk));
  child.stdout?.once("end", () => stdout.flush());
  child.stderr?.once("end", () => stderr.flush());
  child.once("error", (error) => {
    state.spawnError = error;
  });
  return state;
}

export async function waitForInspector(state, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.inspectorUrl) return state.inspectorUrl;
    if (state.spawnError) throw new Error("packaged_app_spawn_failed");
    if (child.exitCode !== null) throw new Error("packaged_app_exited_before_inspector:" + child.exitCode);
    await delay(100);
  }
  throw new Error("packaged_app_inspector_timeout");
}

function rendererExpression(webContentsId, expression) {
  return mainIife(
    "const guest=electron.webContents.fromId(" + Number(webContentsId) + ");"
      + "if(!guest)throw new Error('web_contents_missing');"
      + "return await guest.executeJavaScript(" + JSON.stringify(expression) + ",true);",
  );
}

async function evaluateRenderer(inspector, webContentsId, expression) {
  return evaluateMain(inspector, rendererExpression(webContentsId, expression));
}

async function waitForRenderer(inspector, child, webContentsId, expression, predicate, failure, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("packaged_app_exited_early:" + child.exitCode);
    try {
      const value = await evaluateRenderer(inspector, webContentsId, expression);
      if (predicate(value)) return value;
    } catch {
      // Renderer navigations can briefly destroy the current execution context.
    }
    await delay(250);
  }
  throw new Error(failure);
}

async function attachRendererDebugger(inspector, webContentsId) {
  const attached = await evaluateMain(inspector, mainIife(
    "const guest=electron.webContents.fromId(" + Number(webContentsId) + ");"
      + "if(!guest)throw new Error('web_contents_missing');"
      + "if(!guest.debugger.isAttached())guest.debugger.attach('1.3');"
      + "return guest.debugger.isAttached();",
  ));
  if (!attached) throw new Error("renderer_debugger_attach_failed");
}

async function sendRendererCommand(inspector, webContentsId, method, params) {
  return evaluateMain(inspector, mainIife(
    "const guest=electron.webContents.fromId(" + Number(webContentsId) + ");"
      + "if(!guest||!guest.debugger.isAttached())throw new Error('renderer_debugger_unavailable');"
      + "return await guest.debugger.sendCommand("
      + JSON.stringify(method) + "," + JSON.stringify(params) + ");",
  ));
}

async function domRect(inspector, webContentsId, selector) {
  const expression = "(()=>{const e=document.querySelector(" + JSON.stringify(selector) + ");"
    + "if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);"
    + "return{x:r.x,y:r.y,width:r.width,height:r.height,visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden',disabled:!!e.disabled};})()";
  const rect = await evaluateRenderer(inspector, webContentsId, expression);
  if (!rect?.visible || rect.disabled) throw new Error("ui_control_not_visible_or_enabled:" + selector);
  return rect;
}

async function clickSelector(inspector, webContentsId, selector) {
  const rect = await domRect(inspector, webContentsId, selector);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1, buttons: 0,
  });
}

async function replaceFocusedText(inspector, webContentsId, text) {
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, modifiers: 2,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.insertText", { text });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
  });
  await sendRendererCommand(inspector, webContentsId, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
  });
}

async function appWindowState(inspector) {
  return evaluateMain(inspector, mainIife(
    "const windows=electron.BrowserWindow.getAllWindows();"
      + "const win=windows.find(candidate=>candidate.webContents.getURL().startsWith("
      + JSON.stringify(APP_ORIGIN) + "));"
      + "return{userDataPath:electron.app.getPath('userData'),window:win?{id:win.webContents.id,"
      + "url:win.webContents.getURL(),visible:win.isVisible(),width:win.getBounds().width,"
      + "height:win.getBounds().height}:null};",
  ));
}

async function loadRoute(inspector, route) {
  const url = APP_ORIGIN + route;
  return evaluateMain(inspector, mainIife(
    "const win=electron.BrowserWindow.getAllWindows().find(candidate=>candidate.webContents.getURL().startsWith("
      + JSON.stringify(APP_ORIGIN) + "));"
      + "if(!win)throw new Error('main_window_missing');"
      + "await win.loadURL(" + JSON.stringify(url) + ");return true;",
  ));
}

async function captureWindowPng(inspector, webContentsId, destination) {
  const base64 = await evaluateMain(inspector, mainIife(
    "const win=electron.BrowserWindow.fromWebContents(electron.webContents.fromId("
      + Number(webContentsId) + "));"
      + "if(!win)throw new Error('main_window_missing');"
      + "const image=await win.capturePage();return image.toPNG().toString('base64');",
  ));
  if (typeof base64 !== "string" || base64.length === 0) throw new Error("window_screenshot_missing");
  writeFileSync(destination, Buffer.from(base64, "base64"), { flag: "wx" });
}

function agentStateScript() {
  return "(()=>{const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();"
    + "const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};"
    + "const notice=document.querySelector('[data-testid=\"chat-access-notice\"]');"
    + "const loginButton=notice?.querySelector('button');"
    + "const stopButtons=Array.from(document.querySelectorAll('button')).filter(b=>"
    + "/\\bstop\\b|停止生成|中止生成/i.test([b.title,b.getAttribute('aria-label')||'',b.innerText||''].join(' ')));"
    + "const root=document.querySelector('[data-agent-global]');"
    + "const main=root?.querySelector('[data-panel-id=\"agent-shell-main\"]');"
    + "const dock=root?.querySelector('[data-panel-id=\"agent-shell-dock\"]');"
    + "const mainWidth=main?.getBoundingClientRect().width||0;"
    + "const dockWidth=dock?.getBoundingClientRect().width||0;"
    + "return{path:location.pathname,noticeVisible:visible(notice),loginActionVisible:visible(loginButton),"
    + "stopCount:stopButtons.length,mainWidth,dockWidth,dockRatio:dockWidth/(mainWidth+dockWidth)};})()";
}

async function assertGuestAgent(inspector, child, webContentsId, runNumber) {
  const state = await waitForRenderer(
    inspector, child, webContentsId, agentStateScript(),
    (value) => value?.path === "/agent" && value.noticeVisible && value.loginActionVisible,
    "guest_agent_login_notice_or_login_action_missing",
    STARTUP_TIMEOUT_MS,
  );
  if (state.stopCount !== 0) throw new Error("guest_agent_rendered_false_stop_action");
  if (state.mainWidth <= 0 || state.dockWidth <= 0 || state.dockRatio < 0.52 || state.dockRatio > 0.68) {
    throw new Error("agent_default_dock_ratio_out_of_range");
  }

  const screenshot = join(ARTIFACT_DIR, "studysolo-agent-guest-run-" + runNumber + "-" + RUN_ID + ".png");
  await captureWindowPng(inspector, webContentsId, screenshot);
  return {
    signedOutNoticeVisible: true,
    loginActionVisible: true,
    stopActionCount: state.stopCount,
    mainWidth: state.mainWidth,
    dockWidth: state.dockWidth,
    dockRatio: state.dockRatio,
    screenshot,
  };
}

async function browserGuestState(inspector, guestId) {
  return evaluateMain(inspector, mainIife(
    "const guest=electron.webContents.fromId(" + Number(guestId) + ");"
      + "if(!guest)throw new Error('browser_webview_contents_missing');"
      + "return{type:guest.getType(),url:guest.getURL(),zoomFactor:guest.getZoomFactor(),"
      + "metrics:await guest.executeJavaScript('({timeOrigin:performance.timeOrigin,innerWidth:window.innerWidth,devicePixelRatio:window.devicePixelRatio})')};",
  ));
}

async function waitForBrowserGuest(inspector, guestId, predicate, failure, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await browserGuestState(inspector, guestId);
      if (predicate(state)) return state;
    } catch {
      // The guest can replace its JS context while it navigates or reloads.
    }
    await delay(250);
  }
  throw new Error(failure);
}

async function waitForWebviewId(inspector, child, hostId) {
  const expression = "(()=>{const view=document.querySelector('webview');"
    + "return view&&typeof view.getWebContentsId==='function'&&view.getURL().startsWith("
    + JSON.stringify(APP_ORIGIN + "/agent") + ")?view.getWebContentsId():null;})()";
  return waitForRenderer(inspector, child, hostId, expression, (id) => Number.isInteger(id) && id > 0,
    "browser_tab_did_not_open_native_webview", 60_000);
}

async function testBrowserTab(inspector, child, hostId) {
  await attachRendererDebugger(inspector, hostId);
  await loadRoute(inspector, "/");
  await waitForRenderer(
    inspector, child, hostId,
    "(()=>{const b=document.querySelector('[data-testid=\"center-tab-browser\"]');"
      + "return !!b&&b.getClientRects().length>0;})()",
    Boolean,
    "browser_tab_entry_not_visible",
  );
  await clickSelector(inspector, hostId, '[data-testid="center-tab-browser"]');
  await waitForRenderer(
    inspector, child, hostId,
    "(()=>{const t=document.querySelector('.mobile-browser-toolbar');"
      + "const i=t?.querySelector('input');return!!i&&i.getClientRects().length>0;})()",
    Boolean,
    "browser_tab_toolbar_missing",
  );

  const addressRect = await domRect(inspector, hostId, ".mobile-browser-toolbar input");
  const addressX = addressRect.x + addressRect.width / 2;
  const addressY = addressRect.y + addressRect.height / 2;
  await sendRendererCommand(inspector, hostId, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x: addressX, y: addressY,
  });
  await sendRendererCommand(inspector, hostId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x: addressX, y: addressY, button: "left", clickCount: 1, buttons: 1,
  });
  await sendRendererCommand(inspector, hostId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x: addressX, y: addressY, button: "left", clickCount: 1, buttons: 0,
  });
  await replaceFocusedText(inspector, hostId, APP_ORIGIN + "/agent");

  const guestId = await waitForWebviewId(inspector, child, hostId);
  const baseline = await waitForBrowserGuest(
    inspector, guestId,
    (state) => state.type === "webview" && state.url.startsWith(APP_ORIGIN + "/agent") && Math.abs(state.zoomFactor - 1) < 0.001,
    "browser_webview_did_not_load_self_owned_test_route",
    60_000,
  );

  await clickSelector(inspector, hostId, '[data-testid="browser-page-controls"]');
  await clickSelector(inspector, hostId, '[data-testid="browser-zoom-in"]');
  const zoomed = await waitForBrowserGuest(
    inspector, guestId,
    (state) => Math.abs(state.zoomFactor - 1.1) < 0.01,
    "browser_tab_zoom_did_not_reach_native_webview",
  );
  await clickSelector(inspector, hostId, '[data-testid="browser-page-controls"]');
  const menuValue = await evaluateRenderer(
    inspector, hostId,
    "document.querySelector('[data-testid=\"browser-zoom-in\"]')?.innerText||''",
  );
  if (!/110%/.test(menuValue)) throw new Error("browser_zoom_menu_did_not_report_110_percent");
  const zoomScreenshot = join(ARTIFACT_DIR, "studysolo-browser-webview-zoom-110-" + RUN_ID + ".png");
  await captureWindowPng(inspector, hostId, zoomScreenshot);

  await clickSelector(inspector, hostId, '[data-testid="browser-menu-refresh"]');
  const refreshed = await waitForBrowserGuest(
    inspector, guestId,
    (state) => state.metrics.timeOrigin !== baseline.metrics.timeOrigin && Math.abs(state.zoomFactor - 1.1) < 0.01,
    "browser_tab_refresh_did_not_reload_native_webview_at_current_zoom",
    30_000,
  );

  await clickSelector(inspector, hostId, '[data-testid="browser-page-controls"]');
  await clickSelector(inspector, hostId, '[data-testid="browser-zoom-reset"]');
  const reset = await waitForBrowserGuest(
    inspector, guestId,
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

async function stopOwnedApplication(child, inspector) {
  let quitAcknowledged = false;
  if (child.exitCode === null && inspector) {
    try {
      quitAcknowledged = await evaluateMain(
        inspector,
        mainIife("setImmediate(()=>electron.app.quit());return true;"),
      ) === true;
    } catch {
      // If the app has already failed, process-tree cleanup below is limited to this child PID.
    }
    if (quitAcknowledged) await inspector.close();
  }
  if (!quitAcknowledged && !(await waitForProcessExit(child, 5_000)) && child.exitCode === null && inspector) {
    try {
      quitAcknowledged = await evaluateMain(inspector, mainIife(
        "setImmediate(()=>{for(const win of electron.BrowserWindow.getAllWindows())win.close()});return true;",
      )) === true;
    } catch {
      // Try to close this app's own process tree below if the inspector was lost.
    }
    if (quitAcknowledged) await inspector.close();
  }
  if (!(await waitForProcessExit(child, SHUTDOWN_TIMEOUT_MS)) && child.exitCode === null) {
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

async function runSmoke(executable, profile, runNumber, testBrowser) {
  if (await localStatus() !== null) throw new Error("desktop_smoke_port_already_in_use");
  const child = spawn(executable, ["--inspect=0"], {
    cwd: process.cwd(),
    env: profile.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = connectChildOutput(child);
  let inspector = null;
  let primaryError;
  let agentEvidence;
  let browserEvidence;
  let appWindow;

  try {
    const inspectorUrl = await waitForInspector(output, child, 30_000);
    inspector = await NodeInspectorClient.connect(inspectorUrl);
    await inspector.send("Runtime.enable");
    await waitForLocalStatus(200, STARTUP_TIMEOUT_MS, child);
    const expectedUserData = resolve(profile.appData, "Gailvlun");

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      appWindow = await appWindowState(inspector);
      if (appWindow.window?.url.startsWith(APP_ORIGIN)) break;
      await delay(250);
    }
    if (!appWindow?.window?.url.startsWith(APP_ORIGIN)) throw new Error("packaged_main_window_not_created");
    if (!appWindow.window.visible || appWindow.window.width < 1024 || appWindow.window.height < 680) {
      throw new Error("packaged_main_window_not_visible_or_sized");
    }
    if (appWindow.userDataPath.toLowerCase() !== expectedUserData.toLowerCase()) {
      throw new Error("legacy_user_data_path_not_isolated");
    }
    for (const filename of ["keys.enc", "custom-api-secrets.enc"]) {
      if (existsSync(join(appWindow.userDataPath, filename))) {
        throw new Error("unexpected_credential_file_in_blank_profile:" + filename);
      }
    }

    await loadRoute(inspector, "/agent");
    agentEvidence = await assertGuestAgent(inspector, child, appWindow.window.id, runNumber);
    if (testBrowser) browserEvidence = await testBrowserTab(inspector, child, appWindow.window.id);
  } catch (error) {
    primaryError = error;
  }

  try {
    await stopOwnedApplication(child, inspector);
    await waitForLocalStatus(null, 20_000);
  } catch (error) {
    primaryError ??= error;
  }
  inspector?.close();

  const logPath = join(ARTIFACT_DIR, "studysolo-electron-inspector-run-" + runNumber + "-" + RUN_ID + ".log");
  writeFileSync(logPath, output.lines.join("\n") + "\n", { flag: "wx" });
  if (primaryError) throw primaryError;
  return { agent: agentEvidence, browser: browserEvidence, startupLog: logPath };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("packaged_desktop_smoke_ci_only");
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
    redactedStartupLogs: [firstRun.startupLog, secondRun.startupLog],
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify({
    result: "passed",
    evidencePath,
    screenshots: [firstRun.agent.screenshot, firstRun.browser.screenshot, secondRun.agent.screenshot],
    dockRatio: firstRun.agent.dockRatio,
    nativeZoom: firstRun.browser.zoomedFactor,
    refresh: firstRun.browser.refreshAdvancedTimeOrigin,
    reset: firstRun.browser.resetFactor,
  }) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(redact(error instanceof Error ? error.message : "packaged_app_smoke_failed") + "\n");
    process.exitCode = 1;
  });
}
