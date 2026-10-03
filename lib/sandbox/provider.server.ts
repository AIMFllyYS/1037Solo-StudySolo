import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Sandbox } from "e2b";
import { SANDBOX_LIMITS, safeRelativePath, sandboxConfiguration, SandboxError } from "./config.server";
import { skillPackageFiles, skillRuntimeReady, SKILL_RUNTIME_VERSION } from "./skills.server";

export interface ProviderCommandState { state: string; stdout: string; stderr: string; exitCode?: number; reason?: string }
export interface ProviderSession {
  id: string;
  initialize(packages?: readonly string[]): Promise<void>;
  execute(id: string, command: string, cwd: string, seconds: number): Promise<number>;
  poll(id: string): Promise<ProviderCommandState>;
  cancel(id: string): Promise<void>;
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<Uint8Array>;
  list(path: string): Promise<{ name: string; type: string; size: number }[]>;
  kill(): Promise<boolean>;
}
export interface ExecutionProvider {
  create(executionId: string, scopeHash: string): Promise<ProviderSession>;
  connect(id: string, remainingMs: number): Promise<ProviderSession>;
  find(executionId: string, scopeHash: string, remainingMs: number): Promise<ProviderSession[]>;
  terminate(id: string): Promise<boolean>;
}
export function sandboxScopeHash(owner: string, conversation: string) { return createHash("sha256").update(`${owner}\0${conversation}`).digest("hex"); }
const executionUser = "studysolo";
const workspace = "/home/studysolo/workspace";
const jobsRoot = "/var/lib/studysolo-jobs";
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

class AlibabaProviderSession implements ProviderSession {
  constructor(private readonly sandbox: Sandbox) {}
  get id() { return this.sandbox.sandboxId; }
  private job(id: string) { if (!/^[a-f0-9-]{36}$/i.test(id)) throw new SandboxError("SANDBOX_COMMAND_INVALID"); return `${jobsRoot}/${id}`; }
  private async path(path: string) {
    const relative = safeRelativePath(path);
    const check = "import os,sys; base=sys.argv[1]; p=os.path.realpath(os.path.join(base,sys.argv[2])); assert os.path.commonpath([base,p])==base; print(p)";
    // This is control-plane metadata, not tenant execution. A normal user's
    // Python startup/sitecustomize or shell profile must never run outside the
    // task's network namespace. Use trusted root and an isolated system Python.
    const result = await this.sandbox.commands.run(`/usr/bin/python3 -I -c ${quote(check)} ${quote(workspace)} ${quote(relative)}`, { user: "root", timeoutMs: 5000 }).catch(() => { throw new SandboxError("SANDBOX_PATH_INVALID"); });
    if (result.exitCode !== 0) throw new SandboxError("SANDBOX_PATH_INVALID");
    return result.stdout.trim();
  }
  async initialize(packages: readonly string[] = []) {
    const config = sandboxConfiguration();
    const info = await this.sandbox.getInfo();
    if (info.cpuCount > 2 || info.memoryMB > 4096 || info.allowInternetAccess !== false || info.metadata.application !== "StudySolo") {
      await this.kill().catch(() => false); throw new SandboxError("SANDBOX_ISOLATION_OR_RESOURCE_MISMATCH", 503);
    }
    const source = await readFile(resolve(process.cwd(), "lib/sandbox/assets/worker.py"), "utf8");
    const setup = await this.sandbox.commands.run(`set -eu
if ! id studysolo >/dev/null 2>&1; then useradd --uid 10001 --user-group --create-home --shell /bin/bash studysolo; fi
test "$(id -u studysolo)" = 10001
test "$(id -G studysolo)" = "$(id -g studysolo)"
install -d -m 0700 -o root -g root ${quote(jobsRoot)}
install -d -m 0700 -o studysolo -g studysolo ${quote(workspace)}
chmod 0700 /home/studysolo`, { user: "root", timeoutMs: 10000 });
    if (setup.exitCode !== 0) throw new SandboxError("SANDBOX_SUPERVISOR_ISOLATION_FAILED", 503);
    const preflight = `import os,pathlib,sys
for entry in pathlib.Path('/proc').iterdir():
 if entry.name.isdecimal():
  try:
   args=(entry/'cmdline').read_bytes().split(b'\\x00')
   if entry.stat().st_uid==0 and any(arg==b'jupyter' or arg.endswith(b'/jupyter') or arg.endswith(b'/docker-entrypoint.sh') and b'.jupyter' in arg for arg in args): sys.exit(1)
  except (FileNotFoundError,ProcessLookupError,PermissionError): pass
`;
    const checked = await this.sandbox.commands.run(`/usr/bin/python3 -I -c ${quote(preflight)}`, { user: "root", timeoutMs: 5000 });
    if (checked.exitCode !== 0) throw new SandboxError("SANDBOX_HEADLESS_TEMPLATE_REQUIRED", 503);
    const namespaceSource = await readFile(resolve(process.cwd(), "lib/sandbox/assets/namespace.py"), "utf8");
    await this.sandbox.files.write(`${jobsRoot}/namespace.py`, namespaceSource, { user: "root" });
    const namespace = await this.sandbox.commands.run(`chmod 0600 ${quote(`${jobsRoot}/namespace.py`)} && setpriv --no-new-privs /usr/bin/python3 -I ${quote(`${jobsRoot}/namespace.py`)} /bin/true`, { user: "root", timeoutMs: 10000 }).catch(error => {
      if (error instanceof Error && error.constructor.name === "CommandExitError") throw new SandboxError("SANDBOX_NAMESPACE_ISOLATION_REQUIRED", 503);
      throw new SandboxError("SANDBOX_INITIALIZATION_UNCERTAIN", 503);
    });
    if (namespace.exitCode !== 0) throw new SandboxError("SANDBOX_NAMESPACE_ISOLATION_REQUIRED", 503);
    await this.sandbox.files.write(`${jobsRoot}/worker.py`, source, { user: "root" });
    const permissions = await this.sandbox.commands.run(`chmod 0600 ${quote(`${jobsRoot}/worker.py`)}`, { user: "root", timeoutMs: 5000 });
    if (permissions.exitCode !== 0) throw new SandboxError("SANDBOX_SUPERVISOR_ISOLATION_FAILED", 503);
    if (packages.length) {
      if (!skillRuntimeReady()) throw new SandboxError("SKILL_RUNTIME_NOT_READY", 503);
      const marker = JSON.parse(await this.sandbox.files.read("/opt/studysolo/runtime-ready.json", { user: "root" }));
      if (marker.version !== SKILL_RUNTIME_VERSION) throw new SandboxError("SKILL_RUNTIME_NOT_READY", 503);
      const entries = (await Promise.all(packages.map(async id => (await skillPackageFiles(id)).map(file => ({ path: `/opt/studysolo/skills/${id}/${file.path}`, data: file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer }))))).flat();
      const directories = [...new Set(entries.map(file => file.path.slice(0, file.path.lastIndexOf("/"))))];
      const created = await this.sandbox.commands.run(`install -d -m 0755 -o root -g root ${directories.map(quote).join(" ")}`, { user: "root", timeoutMs: 5000 });
      if (created.exitCode !== 0) throw new SandboxError("SKILL_PACKAGE_INSTALL_FAILED", 503);
      await this.sandbox.files.write(entries, { user: "root" });
      const protectedFiles = await this.sandbox.commands.run(`chmod 0644 ${entries.map(file => quote(file.path)).join(" ")}`, { user: "root", timeoutMs: 5000 });
      if (protectedFiles.exitCode !== 0) throw new SandboxError("SKILL_PACKAGE_INSTALL_FAILED", 503);
    }
    // Explicit configuration is always passed. No inherited Account/cloud/database env is injected.
    if (config.template !== info.templateId && info.metadata.template !== config.template) throw new SandboxError("SANDBOX_TEMPLATE_CHANGED", 409);
  }
  async execute(id: string, command: string, cwd: string, seconds: number) {
    const path = await this.path(cwd), job = this.job(id);
    await this.sandbox.commands.run(`install -d -m 0700 -o root -g root ${quote(job)}`, { user: "root", timeoutMs: 5000 });
    await this.sandbox.files.write(`${job}/request.json`, JSON.stringify({ command, cwd: path, timeout: seconds }), { user: "root" });
    const process = await this.sandbox.commands.run(`/usr/bin/python3 -I ${quote(`${jobsRoot}/worker.py`)} ${quote(job)}`, { user: "root", background: true, timeoutMs: (seconds + 10) * 1000 });
    const pid = process.pid;
    await process.disconnect();
    return pid;
  }
  async poll(id: string): Promise<ProviderCommandState> {
    try {
      const info = await this.sandbox.files.getInfo(`${this.job(id)}/state.json`, { user: "root" });
      if (info.size > SANDBOX_LIMITS.outputBytes * 6 + 32000) throw new SandboxError("SANDBOX_OUTPUT_LIMIT");
      const value = JSON.parse(await this.sandbox.files.read(`${this.job(id)}/state.json`, { user: "root" }));
      if (!value || !["running", "completed", "failed"].includes(value.state)) throw new SandboxError("SANDBOX_COMMAND_STATE_INVALID", 502);
      return { state: value.state, stdout: String(value.stdout ?? ""), stderr: String(value.stderr ?? ""), ...(Number.isInteger(value.exitCode) ? { exitCode: value.exitCode } : {}), ...(typeof value.reason === "string" ? { reason: value.reason.slice(0, 100) } : {}) };
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      if (error instanceof Error && error.constructor.name === "FileNotFoundError") return { state: "starting", stdout: "", stderr: "" };
      throw new SandboxError("SANDBOX_COMMAND_QUERY_FAILED", 502);
    }
  }
  async cancel(id: string) { await this.sandbox.files.write(`${this.job(id)}/cancel`, "cancel", { user: "root" }); }
  async write(path: string, content: string) { await this.sandbox.files.write(await this.path(path), content, { user: executionUser }); }
  async read(path: string) {
    const file = await this.path(path), info = await this.sandbox.files.getInfo(file, { user: executionUser });
    if (info.type !== "file" || info.size > SANDBOX_LIMITS.fileBytes) throw new SandboxError("SANDBOX_FILE_LIMIT");
    const bytes = await this.sandbox.files.read(file, { format: "bytes", user: executionUser });
    if (bytes.byteLength > SANDBOX_LIMITS.fileBytes) throw new SandboxError("SANDBOX_FILE_LIMIT");
    return bytes;
  }
  async list(path: string) { const entries = await this.sandbox.files.list(await this.path(path), { user: executionUser }); return entries.slice(0, 200).map(item => ({ name: item.name.slice(0, 256), type: String(item.type ?? "unknown"), size: item.size })); }
  async kill() { return this.sandbox.kill({ requestTimeoutMs: 15000 }); }
}

export class AlibabaExecutionProvider implements ExecutionProvider {
  private options() { const config = sandboxConfiguration(); return { apiKey: config.apiKey, apiUrl: config.apiUrl, domain: config.domain, debug: false, requestTimeoutMs: 30000 }; }
  async create(executionId: string, scopeHash: string) {
    const config = sandboxConfiguration();
    const sandbox = await Sandbox.create(config.template, { ...this.options(), timeoutMs: SANDBOX_LIMITS.lifetimeSeconds * 1000, secure: true, allowInternetAccess: false, metadata: { application: "StudySolo", executionId, scope: scopeHash, template: config.template }, lifecycle: { onTimeout: "kill", autoResume: false } });
    return new AlibabaProviderSession(sandbox);
  }
  async connect(id: string, remainingMs: number) {
    if (remainingMs <= 0 || remainingMs > SANDBOX_LIMITS.lifetimeSeconds * 1000) throw new SandboxError("SANDBOX_EXPIRED", 409);
    const sandbox = await Sandbox.connect(id, { ...this.options(), timeoutMs: remainingMs });
    return new AlibabaProviderSession(sandbox);
  }
  async find(executionId: string, scopeHash: string, remainingMs: number) {
    const results: ProviderSession[] = [];
    const listing = Sandbox.list({ ...this.options(), query: { metadata: { application: "StudySolo", executionId, scope: scopeHash }, state: ["running"] }, limit: 20 });
    for (let page = 0; listing.hasNext && page < 5; page++) {
      const entries = await listing.nextItems();
      for (const item of entries) if (item.metadata.executionId === executionId && item.metadata.scope === scopeHash && item.metadata.application === "StudySolo") results.push(await this.connect(item.sandboxId, remainingMs));
    }
    return results;
  }
  async terminate(id: string) {
    // SDK false means the exact DELETE returned 404: the instance is already gone.
    await Sandbox.kill(id, this.options());
    return true;
  }
}
