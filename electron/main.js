// Electron main process — StudySolo desktop shell (Route A: env injection).
//
// Lifecycle:
//   ready -> load encrypted keys from userData
//          -> spawn the Next standalone server as a child (Electron-as-Node),
//             injecting baked config + the user's 3 keys as env
//          -> wait for the local port, then open the app window on 127.0.0.1:PORT
//   "设置" menu reopens the setup window; saving restarts the server + reloads.
//   quit -> kill the server child.
//
// The Next app code is unchanged; it just reads process.env.* from the injected env.

const { app, BrowserWindow, ipcMain, safeStorage, Menu, dialog, shell, session } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const BAKED = require("./config");
const { normalizeOpenAIBaseUrl } = require("./openaiBaseUrl");
const { withoutOperatorCredentials } = require("./serverEnvironment");

// 自由中转 = 可选的 OpenAI 兼容端点（URL + API Key + 模型 ID）。
// Provider keys are user-owned; an empty setup never inherits operator keys.
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

// Keep the shipped storage directory when the product display name changes.
// Set it before resolving secret paths or creating any Chromium session; the
// same directory retains DPAPI files, IndexedDB and browser partitions.
const legacyUserData = path.join(app.getPath("appData"), "Gailvlun");
fs.mkdirSync(legacyUserData, { recursive: true, mode: 0o700 });
app.setPath("userData", legacyUserData);
app.setPath("sessionData", legacyUserData);
const KEYS_FILE = path.join(app.getPath("userData"), "keys.enc");
const CUSTOM_SECRETS_FILE = path.join(app.getPath("userData"), "custom-api-secrets.enc");

// keys.enc falls back to PLAINTEXT JSON on platforms without safeStorage (e.g. some
// Linux keyrings), so lock the file to the current user regardless of platform.
function writeSecretFile(file, data) {
  fs.writeFileSync(file, data, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600); // mode only applies at creation — fix up existing files too
  } catch {}
}

let serverProc = null;
let serverPort = null;
let mainWindow = null;
let setupWindow = null;

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

// ---------- server orchestration ----------
// Fixed loopback port → stable renderer origin (http://127.0.0.1:35349) so the app's
// IndexedDB/localStorage survive restarts. A RANDOM port per launch changes the origin
// every time, which silently orphans ALL stored data (chat history / skills / review
// cards) — the root cause of "everything's gone after reboot". Never change APP_PORT
// once shipped, or users lose access to data saved under the previous origin.
const APP_PORT = Number(BAKED.APP_PORT) || 35349;

function checkPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

// Wait until APP_PORT is bindable. On a "save keys → restart server" cycle the previous
// child may still be releasing it, so poll briefly. If a FOREIGN app holds it we time out
// and let the caller surface a clear message — we NEVER silently switch ports (switching
// would change the origin and lose the user's data).
async function waitPortFree(port, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkPortFree(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function standaloneDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
}

function waitForServer(port, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ping = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Next 服务启动超时"));
        else setTimeout(ping, 400);
      });
    };
    ping();
  });
}

async function startServer(keys) {
  stopServer();
  serverPort = APP_PORT;
  if (!(await waitPortFree(APP_PORT))) {
    throw new Error(
      `本地端口 ${APP_PORT} 被其它程序占用。该端口用于 StudySolo 的本地数据持久化，不能更换` +
        `（否则将读不到你之前保存的对话 / 技能 / 复习卡）。请关闭占用该端口的程序后重新启动 StudySolo。`,
    );
  }
  const dir = standaloneDir();
  const serverJs = path.join(dir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`未找到 standalone server.js：${serverJs}\n请先运行桌面构建。`);
  }
  const env = {
    ...withoutOperatorCredentials(process.env),
    ...BAKED,
    RELAY_BASE_URL: keys.RELAY_BASE_URL || "",
    RELAY_API_KEY: keys.RELAY_API_KEY || "",
    RELAY_MODEL_ID: keys.RELAY_MODEL_ID || "",
    AI_API_KEY: keys.AI_API_KEY || "",
    MIMO_API_KEY: keys.MIMO_API_KEY || "",
    ZHIPU_API_KEY: keys.ZHIPU_API_KEY || "",
    UNSPLASH_ACCESS_KEY: keys.UNSPLASH_ACCESS_KEY || "",
    PORT: String(serverPort),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1", // run server.js with Electron's bundled Node
    ELECTRON_USER_DATA: app.getPath("userData"),
    STUDYSOLO_DESKTOP_RUNTIME: "true",
    CLOUD_SANDBOX_ENABLED: "false",
    CLOUD_SANDBOX_API_KEY: "",
    CLOUD_SANDBOX_ENCRYPTION_KEY: "",
    CONNECTOR_ALLOW_PRODUCTION: "false",
  };
  const proc = spawn(process.execPath, [serverJs], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  serverProc = proc;

  // Keep the tail of stderr so startup failures explain themselves instead of just
  // timing out. (The original symptom — missing node_modules — printed a clear
  // `Cannot find module 'next'` here that the user never saw.)
  let stderrTail = "";
  let starting = true;
  proc.stdout.on("data", (d) => console.log("[server]", d.toString().trimEnd()));
  proc.stderr.on("data", (d) => {
    const s = d.toString();
    stderrTail = (stderrTail + s).slice(-4000);
    console.error("[server]", s.trimEnd());
  });

  // Race "server is up" against "child died early" so a crash surfaces immediately
  // with its real reason, rather than waiting the full waitForServer timeout.
  const earlyExit = new Promise((_, reject) => {
    proc.once("exit", (code) => {
      if (!starting) {
        if (code && code !== 0) console.error(`[server] exited with code ${code}`);
        return;
      }
      const tail = stderrTail.trim();
      reject(new Error(`Next 服务进程提前退出（退出码 ${code}）。${tail ? `\n\n${tail.slice(-1200)}` : ""}`));
    });
  });

  try {
    await Promise.race([waitForServer(serverPort), earlyExit]);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const tail = stderrTail.trim();
    throw new Error(tail && !msg.includes(tail.slice(-40)) ? `${msg}\n\n${tail.slice(-1200)}` : msg);
  } finally {
    starting = false;
  }
}

function stopServer() {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {}
    serverProc = null;
  }
}

// ---------- windows ----------
// The renderer can reach secrets IPC via the preload bridge, so every inbound
// URL decision goes through isAppUrl: only the local standalone server is the app.
function isAppUrl(url) {
  try {
    return new URL(url).origin === `http://127.0.0.1:${APP_PORT}`;
  } catch {
    return false;
  }
}

// Only real web/mail links may leave the app. file:/custom schemes would let a page
// trick the shell into launching local programs or protocol handlers.
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (!["https:", "http:", "mailto:"].includes(u.protocol)) return;
    shell.openExternal(u.toString());
  } catch {}
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b0b0f",
    title: "StudySolo",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // 启用 <webview> 标签 —— 内置浏览器在桌面端用真实 Chromium 视图运行（真·全站）。
      webviewTag: true,
    },
  });
  // 收紧内嵌 webview 的预设：禁 node 集成、保持上下文隔离（嵌入任意站点的安全基线）。
  mainWindow.webContents.on("will-attach-webview", (_e, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    delete webPreferences.preload;
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  // open external links in the system browser, keep app links internal
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    openExternalSafe(url);
    return { action: "deny" };
  });
  // Same rule for in-place navigation: leaving the app origin hands off to the
  // system browser so remote pages never run in the window holding the IPC bridge.
  mainWindow.webContents.on("will-navigate", (e) => {
    if (isAppUrl(e.url)) return;
    e.preventDefault();
    openExternalSafe(e.url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openSetupWindow() {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 820,
    resizable: false,
    title: "StudySolo · API 密钥设置",
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    backgroundColor: "#0b0b0f",
    webPreferences: {
      preload: path.join(__dirname, "setup-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  setupWindow.removeMenu();
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

// ---------- menu ----------
function buildMenu() {
  const template = [
    {
      label: "应用",
      submenu: [
        { label: "API 密钥设置…", click: () => openSetupWindow() },
        { type: "separator" },
        { role: "reload", label: "刷新" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
// Handlers answer ANY webContents that can reach ipcRenderer, so verify the caller:
// secrets:* is only for the app page on the loopback origin; setup:* only for the
// setup window itself. Anything else gets nothing — not even an error string.
const senderIsApp = (e) => isAppUrl(e.senderFrame && e.senderFrame.url);
const senderIsSetupWindow = (e) => !!setupWindow && e.sender === setupWindow.webContents;

// preload 在页面脚本前同步询问：是否需要把默认模型绑到「自由中转」。
// 以前在 did-finish-load 里 executeJavaScript 改 localStorage 再 location.reload()，
// 整页二次加载；现在由 preload 直接改，渲染进程无感知、不重载。
ipcMain.on("desktop:needs-model-bind", (e) => {
  e.returnValue = senderIsApp(e) && Boolean(String(loadKeys().RELAY_MODEL_ID || "").trim());
});

ipcMain.handle("secrets:load", (e) => (senderIsApp(e) ? loadCustomApiSecrets() : { v: 1, groups: {}, capability: {} }));
ipcMain.handle("secrets:save", (e, payload) => (senderIsApp(e) ? saveCustomApiSecrets(payload) : { ok: false }));

ipcMain.handle("setup:get-keys", (e) => (senderIsSetupWindow(e) ? loadKeys() : {}));

ipcMain.handle("setup:save", async (e, keys) => {
  if (!senderIsSetupWindow(e)) return { ok: false };
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return { ok: false };
  const relayFields = ["RELAY_BASE_URL", "RELAY_API_KEY", "RELAY_MODEL_ID"].map((name) => typeof keys[name] === "string" ? keys[name].trim() : "");
  if (relayFields.some(Boolean) && !relayFields.every(Boolean)) return { ok: false, error: "请完整填写自由中转的三项设置，或清空三项" };
  const saved = saveKeys(keys);
  try {
    if (serverProc) {
      // already running -> apply new keys immediately (restart + reload)
      await startServer(saved);
      if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// Best-effort validation: GET {base}/models with the provided key.
ipcMain.handle("setup:test", async (e, keys) => {
  if (!senderIsSetupWindow(e)) return {};
  const result = {};
  const tryModels = async (base, key, label) => {
    if (!key || !key.trim()) return { label, status: "empty" };
    const url = normalizeOpenAIBaseUrl(base);
    if (!url) return { label, status: "empty" };
    if (!/^https?:\/\//i.test(url)) return { label, status: "invalid url" };
    try {
      const resp = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${key.trim()}` },
        signal: AbortSignal.timeout(10_000),
      });
      return { label, status: resp.ok ? "ok" : `http ${resp.status}` };
    } catch (e) {
      return { label, status: `error: ${String(e && e.message ? e.message : e)}` };
    }
  };
  // Unsplash uses Client-ID auth on its own API; a real ping catches a mistyped key
  // before the user saves (cheap: 1 of the 50/hr demo quota, only when 测试 is pressed).
  const tryUnsplash = async (key) => {
    if (!key || !key.trim()) return { label: "Unsplash", status: "empty" };
    try {
      const resp = await fetch("https://api.unsplash.com/photos?per_page=1", {
        headers: { Authorization: `Client-ID ${key.trim()}`, "Accept-Version": "v1" },
        signal: AbortSignal.timeout(10_000),
      });
      return { label: "Unsplash", status: resp.ok ? "ok" : `http ${resp.status}` };
    } catch (e) {
      return { label: "Unsplash", status: `error: ${String(e && e.message ? e.message : e)}` };
    }
  };
  const relayBase = String(keys.RELAY_BASE_URL || "").trim();
  result.RELAY_API_KEY = relayBase
    ? await tryModels(relayBase, keys.RELAY_API_KEY, "自由中转")
    : { label: "自由中转", status: "empty" };
  result.AI_API_KEY = await tryModels(BAKED.AI_BASE_URL, keys.AI_API_KEY, "硅基流动");
  result.MIMO_API_KEY = await tryModels(BAKED.MIMO_BASE_URL, keys.MIMO_API_KEY, "小米 MiMo");
  // Zhipu web-search uses a different API surface; we only check non-empty.
  result.ZHIPU_API_KEY = { label: "智谱", status: keys.ZHIPU_API_KEY?.trim() ? "filled" : "empty" };
  result.UNSPLASH_ACCESS_KEY = await tryUnsplash(keys.UNSPLASH_ACCESS_KEY);
  return result;
});

// ---------- app lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // 内置浏览器 webview 弹出的窗口（OAuth/登录弹窗等）放行为真实窗口，让第三方登录流程
  // 正常工作；非 http/https 协议一律拒绝。
  app.on("web-contents-created", (_e, contents) => {
    if (typeof contents.getType === "function" && contents.getType() === "webview") {
      contents.setWindowOpenHandler(({ url }) =>
        /^https?:\/\//i.test(url) ? { action: "allow" } : { action: "deny" },
      );
    }
  });

  // Deny-by-default permission policy for BOTH sessions (the app page and the
  // persisted webview partition): without a handler Electron auto-approves every
  // request, so embedded sites could grab camera/mic/notifications silently.
  const ALLOWED_PERMISSIONS = new Set([
    "fullscreen", // 视频播放器全屏
    "clipboard-read", // 粘贴图片等到笔记
    "clipboard-sanitized-write", // 富文本复制
  ]);
  const permissionPolicy = (_wc, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission));
  session.defaultSession.setPermissionRequestHandler(permissionPolicy);
  session.fromPartition("persist:browser").setPermissionRequestHandler(permissionPolicy);

  app.whenReady().then(async () => {
    buildMenu();
    // Reading, notes and Account sign-in work before users add an optional
    // provider key. AI requests retain their existing missing-provider errors.
    const keys = loadKeys();
    try {
      await startServer(keys);
      createMainWindow();
    } catch (err) {
      dialog.showErrorBox("启动失败", String(err && err.message ? err.message : err));
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) createMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopServer);
  app.on("will-quit", stopServer);
}
