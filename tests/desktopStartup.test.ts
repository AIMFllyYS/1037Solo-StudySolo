import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const source = readFileSync(resolve("electron/main.js"), "utf8");

// Execute the real startup path with entirely synthetic storage and Electron.
// No native process, user's profile or external network is accessed.
async function launch(saved: Record<string, string> | null) {
  const paths: Record<string, string> = { appData: resolve("synthetic-appdata"), userData: resolve("synthetic-new-product") };
  const directories = new Set([paths.appData, ...(saved ? [join(paths.appData, "Gailvlun")] : [])]);
  const reads: string[] = [];
  const spawns: { env: Record<string, string>; cwd: string }[] = [];
  const windows: { title: string; url?: string }[] = [];
  const errors: string[] = [];
  let ready: Promise<unknown> = Promise.resolve();
  let quit = 0;
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false,
    getPath: (name: string) => paths[name],
    setPath: (name: string, value: string) => { if (!directories.has(value)) throw new Error("Electron requires an existing path"); paths[name] = value; },
    requestSingleInstanceLock: () => true,
    whenReady: () => ({ then: (fn: () => Promise<void>) => { ready = Promise.resolve().then(fn); return ready; } }),
    quit: () => { quit++; },
  });
  class BrowserWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: () => {} });
    entry: { title: string; url?: string };
    constructor(options: { title: string }) { super(); this.entry = { title: options.title }; windows.push(this.entry); }
    loadURL(url: string) { this.entry.url = url; }
    static getAllWindows() { return []; }
  }
  const fakeSession = { setPermissionRequestHandler: () => {} };
  const modules: Record<string, unknown> = {
    electron: { app, BrowserWindow, ipcMain: { on: () => {}, handle: () => {} }, safeStorage: { isEncryptionAvailable: () => false },
      Menu: { buildFromTemplate: () => [], setApplicationMenu: () => {} }, dialog: { showErrorBox: (_title: string, error: string) => errors.push(error) },
      shell: {}, session: { defaultSession: fakeSession, fromPartition: () => fakeSession } },
    "node:fs": { mkdirSync: (directory: string) => directories.add(directory), existsSync: () => true, readFileSync: (file: string) => { reads.push(file); if (!saved) throw new Error("synthetic empty profile"); return Buffer.from(JSON.stringify(saved)); } },
    "node:net": { createServer: () => Object.assign(new EventEmitter(), { listen: (_port: number, _host: string, done: () => void) => done(), close: (done: () => void) => done() }) },
    "node:http": { get: (_opts: unknown, done: (response: { destroy: () => void }) => void) => { done({ destroy: () => {} }); return new EventEmitter(); } },
    "node:child_process": { spawn: (_exe: string, _args: string[], options: { env: Record<string, string>; cwd: string }) => { spawns.push(options); return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() }); } },
    "./config": { APP_PORT: 35349, ACCOUNT_BACKEND_URL: "https://account.1037solo.com" },
    "./openaiBaseUrl": require("../electron/openaiBaseUrl.js"),
    "./serverEnvironment": require("../electron/serverEnvironment.js"),
  };
  runInNewContext(source, { require: (id: string) => id in modules ? modules[id] : require(id), __dirname: resolve("electron"),
    process: { env: { PATH: "synthetic-path", AI_API_KEY: "synthetic-inherited-key", QINIU_API_KEY: "synthetic-inherited-key", CLOUD_SANDBOX_API_KEY: "synthetic-inherited-key" }, execPath: "synthetic-electron", platform: "win32" },
    Buffer, URL, console, setTimeout, clearTimeout, setInterval, clearInterval });
  await ready;
  return { paths, reads, spawns, windows, errors, quit };
}

test("blank desktop profile opens the app without requiring a provider key", async () => {
  const result = await launch(null);
  assert.deepEqual(result.errors, []);
  assert.equal(result.quit, 0);
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].url, "http://127.0.0.1:35349/");
  assert.equal(result.windows[0].title, "StudySolo");
  const env = result.spawns[0].env;
  assert.equal(env.RELAY_API_KEY, "");
  assert.equal(env.AI_API_KEY, "");
  assert.equal(env.QINIU_API_KEY, undefined);
  assert.equal(env.CLOUD_SANDBOX_ENABLED, "false");
  assert.equal(env.CONNECTOR_ALLOW_PRODUCTION, "false");
});

test("renamed product reads the shipped profile and injects only saved user keys", async () => {
  const result = await launch({ RELAY_BASE_URL: "https://synthetic.invalid/v1", RELAY_API_KEY: "synthetic-user-key", RELAY_MODEL_ID: "synthetic-model" });
  const legacy = join(result.paths.appData, "Gailvlun");
  assert.equal(result.paths.userData, legacy);
  assert.equal(result.paths.sessionData, legacy);
  assert.equal(result.reads[0], join(legacy, "keys.enc"));
  assert.equal(result.spawns[0].env.ELECTRON_USER_DATA, legacy);
  assert.equal(result.spawns[0].env.RELAY_API_KEY, "synthetic-user-key");
  assert.equal(result.windows.length, 1);
  assert.deepEqual(result.errors, []);
});
