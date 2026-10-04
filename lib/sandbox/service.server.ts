import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { assertSandboxScope, sandboxActionRequiresRecentAuth, type SandboxScope } from "./actor.server";
import { SANDBOX_LIMITS, sandboxConfiguration, safeRelativePath, SandboxError } from "./config.server";
import { AlibabaExecutionProvider, sandboxScopeHash, type ExecutionProvider, type ProviderSession } from "./provider.server";
import { PersistentExecutionStore, type ExecutionStore } from "./store.server";
import type { SandboxArtifact, SandboxCommand, SandboxInput, SandboxOutput, SandboxSession } from "./types";
import { isExecutionCommand, type SandboxAuthRetry } from "./types";
import { closeExecution } from "./cleanup.server";
import { installedPackages } from "./skills.server";
import { PrivateArtifactStorage, type ArtifactStorage } from "./artifacts.server";

const uuid = (value: string | undefined) => {
  if (!value || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) throw new SandboxError("SANDBOX_RECORD_REQUIRED");
  return value;
};
export class SandboxService {
  constructor(private readonly store: ExecutionStore = new PersistentExecutionStore(), private readonly provider: ExecutionProvider = new AlibabaExecutionProvider(), private readonly artifactStorage: ArtifactStorage = new PrivateArtifactStorage()) {}
  async prepareAuthRetry(scope: SandboxScope, input: SandboxInput, toolCallId: string) {
    assertSandboxScope(scope);
    if (!sandboxActionRequiresRecentAuth(input.action) || !toolCallId || toolCallId.length > 200) throw new SandboxError("SANDBOX_RETRY_INVALID");
    const digest = createHash("sha256").update(JSON.stringify([scope.owner, scope.conversationId, toolCallId, input])).digest("hex");
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    await this.store.lock(`retry:${id}`, async () => {
      const previous = await this.store.read<SandboxAuthRetry>("command", id, scope.owner);
      if (previous) return;
      const ticket: SandboxAuthRetry = { recordType: "auth-retry", id, owner: scope.owner, conversationId: scope.conversationId, input: structuredClone(input), state: "proposed", createdAt: Date.now(), expiresAt: Date.now() + 15 * 60000 };
      await this.store.write("command", id, scope.owner, ticket, ticket.expiresAt);
    });
    return id;
  }
  async authRetryStatus(scope: SandboxScope, id: string) {
    assertSandboxScope(scope); uuid(id);
    const ticket = await this.store.read<SandboxAuthRetry>("command", id, scope.owner);
    if (!ticket || ticket.recordType !== "auth-retry" || ticket.owner !== scope.owner || ticket.conversationId !== scope.conversationId) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
    if (ticket.expiresAt <= Date.now()) throw new SandboxError("SANDBOX_RETRY_EXPIRED", 410);
    return { state: ticket.state, input: ticket.input, ...(ticket.output ? { output: ticket.output } : {}) };
  }
  async resumeAuthRetry(scope: SandboxScope, id: string, authorize: (action: SandboxInput["action"]) => Promise<SandboxScope>): Promise<SandboxOutput> {
    assertSandboxScope(scope); uuid(id);
    return this.store.lock(`retry:${id}`, async () => {
      const ticket = await this.store.read<SandboxAuthRetry>("command", id, scope.owner);
      if (!ticket || ticket.recordType !== "auth-retry" || ticket.owner !== scope.owner || ticket.conversationId !== scope.conversationId) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
      if (ticket.expiresAt <= Date.now()) throw new SandboxError("SANDBOX_RETRY_EXPIRED", 410);
      if (ticket.state === "completed" && ticket.output) return ticket.output;
      if (ticket.state !== "proposed") return { conversationId: scope.conversationId, text: "原操作已提交，结果仍需核对；不会再次执行。", error: "SANDBOX_RETRY_UNCERTAIN", state: "uncertain" };
      const current = await authorize(ticket.input.action);
      assertSandboxScope(current);
      if (current.owner !== ticket.owner || current.conversationId !== ticket.conversationId) throw new SandboxError("ACCOUNT_CHANGED", 409);
      await this.store.write("command", id, scope.owner, { ...ticket, state: "started" }, ticket.expiresAt);
      try {
        const output = { ...await this.operate(current, ticket.input), conversationId: scope.conversationId };
        await this.store.write("command", id, scope.owner, { ...ticket, state: "completed", output }, ticket.expiresAt);
        return output;
      } catch {
        // Includes a lost result-persistence response after a provider effect.
        // The durable started marker is already enough to prevent re-execution.
        await this.store.write("command", id, scope.owner, { ...ticket, state: "uncertain" }, ticket.expiresAt).catch(() => {});
        return { conversationId: scope.conversationId, state: "uncertain", error: "SANDBOX_RETRY_UNCERTAIN", text: "原操作结果需要核对；不会自动或重复执行。" };
      }
    });
  }
  private async session(scope: SandboxScope, id: string, expired = false) {
    assertSandboxScope(scope);
    const record = await this.store.read<SandboxSession>("session", uuid(id), scope.owner);
    if (!record || record.owner !== scope.owner || record.conversationId !== scope.conversationId) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
    if (!expired && record.configHash !== sandboxConfiguration().configHash) throw new SandboxError("SANDBOX_BINDING_CHANGED", 409);
    if (!expired && record.expiresAt <= Date.now()) throw new SandboxError("SANDBOX_EXPIRED", 409);
    return record;
  }
  private async connection(record: SandboxSession) {
    if (record.configHash !== sandboxConfiguration().configHash) throw new SandboxError("SANDBOX_BINDING_CHANGED", 409);
    if (!record.providerId || record.state !== "active") throw new SandboxError("SANDBOX_NOT_ACTIVE", 409);
    return this.provider.connect(record.providerId, record.expiresAt - Date.now());
  }
  private async stop(scope: SandboxScope, record: SandboxSession): Promise<SandboxOutput> {
    if (record.state === "closed") return { sessionId: record.id, state: "closed", text: "云沙箱已经关闭。" };
    if (record.configHash !== sandboxConfiguration().configHash) throw new SandboxError("SANDBOX_BINDING_CHANGED", 409);
    const stopped = await closeExecution(this.store, this.provider, record);
    const next = { ...record, state: stopped ? "closed" as const : "uncertain" as const };
    return { sessionId: record.id, state: next.state, text: stopped ? "云沙箱已关闭。已保存的产物仍可下载。" : "终止结果需要核对；不会重复创建。实例仍受预设生命周期限制。", ...(stopped ? {} : { error: "SANDBOX_TERMINATION_UNCERTAIN" }) };
  }
  private async open(scope: SandboxScope) {
    return this.store.lock(`conversation:${sandboxScopeHash(scope.owner, scope.conversationId)}`, async (): Promise<SandboxOutput> => {
      const previous = (await this.store.owned<SandboxSession>("session", scope.owner)).filter(item => item.conversationId === scope.conversationId && ["active", "creating", "uncertain", "closing"].includes(item.state));
      const live = previous.find(item => item.expiresAt > Date.now());
      if (live) return { sessionId: live.id, state: live.state, text: live.state === "active" ? "当前对话已有独立云沙箱，可继续使用。" : "上次创建或终止的结果不确定，请关闭并核对原实例；不会创建重复实例。" };
      for (const stale of previous) {
        const stopped = await this.stop(scope, stale);
        if (stopped.state !== "closed") return { ...stopped, text: "原实例的终止尚未确认，请先核对该会话；不会分配另一个沙箱。" };
      }
      const config = sandboxConfiguration(), id = randomUUID(), createdAt = Date.now(), expiresAt = createdAt + SANDBOX_LIMITS.lifetimeSeconds * 1000;
      // Conservative upper reservation: ¥1/hour for a <=2C4G instance plus ¥0.05 lifecycle/IO margin.
      const reservedMicroCny = Math.ceil(SANDBOX_LIMITS.lifetimeSeconds / 3600 * 1_000_000) + 50_000;
      await this.store.reserve(id, scope.owner, reservedMicroCny, expiresAt);
      let record: SandboxSession = { id, owner: scope.owner, conversationId: scope.conversationId, configHash: config.configHash, createdAt, expiresAt, state: "creating", reservedMicroCny };
      await this.store.write("session", id, scope.owner, record, expiresAt);
      let sandbox: ProviderSession | undefined;
      try {
        sandbox = await this.provider.create(id, sandboxScopeHash(scope.owner, scope.conversationId));
        record = { ...record, providerId: sandbox.id };
        // Persist identity before initialization, so a crash can still be reconciled and terminated.
        await this.store.write("session", id, scope.owner, record, expiresAt);
        const packages = await installedPackages(scope, this.store);
        await sandbox.initialize(packages.map(item => item.packageId));
        record = { ...record, state: "active" };
        await this.store.write("session", id, scope.owner, record, expiresAt);
        return { sessionId: id, state: "active", text: "已创建当前对话专用的隔离云沙箱。可运行命令、读写文件；本次最长保留 15 分钟。默认不联网，未注入账号或云服务凭证。" };
      } catch (error) {
        record = { ...record, state: "uncertain" };
        await this.store.write("session", id, scope.owner, record, expiresAt);
        if (sandbox) {
          const cleanup = await this.stop(scope, record).catch(() => null);
          if (cleanup?.state === "closed") return { sessionId: id, state: "closed", error: error instanceof SandboxError ? error.code : "SANDBOX_INITIALIZATION_FAILED", text: `云沙箱初始化未通过：${error instanceof SandboxError ? error.code : "SANDBOX_INITIALIZATION_FAILED"}。未运行用户命令，已确认关闭资源；请检查运行模板，不能把这次操作视为环境已就绪。` };
        }
        return { sessionId: id, state: "uncertain", error: "SANDBOX_CREATION_UNCERTAIN", text: "沙箱创建或初始化未完成。可能已经分配资源，不会自动重试创建；请先关闭原会话进行核对。" };
      }
    });
  }
  async operate(scope: SandboxScope, input: SandboxInput): Promise<SandboxOutput> {
    assertSandboxScope(scope);
    if (sandboxActionRequiresRecentAuth(input.action) && !scope.canExecute) throw new SandboxError("SANDBOX_READ_ONLY_SCOPE", 403);
    sandboxConfiguration();
    if (input.action === "status") {
      const sessions = (await this.store.owned<SandboxSession>("session", scope.owner)).filter(item => item.conversationId === scope.conversationId);
      return { text: JSON.stringify(sessions.map(item => ({ sessionId: item.id, state: item.state, expiresAt: item.expiresAt }))) };
    }
    if (input.action === "open") return this.open(scope);
    const sessionId = uuid(input.sessionId);
    return this.store.lock(`session:${sessionId}`, async () => {
      const record = await this.session(scope, sessionId, ["close", "poll", "cancel"].includes(input.action));
      if (input.action === "close") return this.stop(scope, record);
      if (["poll", "cancel"].includes(input.action)) {
        const id = uuid(input.commandId), command = await this.store.read<SandboxCommand | SandboxAuthRetry>("command", id, scope.owner);
        if (!command || !isExecutionCommand(command) || command.owner !== scope.owner || command.sessionId !== record.id) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
        if (command.state === "completed" && command.result) return { sessionId, commandId: id, state: command.result.state, stdout: command.result.stdout, stderr: command.result.stderr, exitCode: command.result.exitCode, reason: command.result.reason, text: JSON.stringify(command.result) };
        const sandbox = await this.connection(record);
        if (input.action === "cancel") { await sandbox.cancel(id); return { sessionId, commandId: id, state: "cancelling", text: "已请求终止该命令。可继续查询结果；不会再次执行。" }; }
        const result = await sandbox.poll(id);
        const state = result.state === "completed" || result.state === "failed" ? "completed" : "running";
        await this.store.write("command", id, scope.owner, { ...command, state, result }, command.expiresAt);
        return { sessionId, commandId: id, state: result.state, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, reason: result.reason, text: JSON.stringify(result) };
      }
      const sandbox = await this.connection(record);
      const running = (await this.store.owned<SandboxCommand | SandboxAuthRetry>("command", scope.owner)).filter(isExecutionCommand).filter(item => item.sessionId === record.id && ["starting", "running", "uncertain"].includes(item.state));
      for (const item of running) {
        const result = await sandbox.poll(item.id);
        if (["completed", "failed"].includes(result.state)) await this.store.write("command", item.id, scope.owner, { ...item, state: "completed", result }, item.expiresAt);
        else throw new SandboxError("SANDBOX_COMMAND_RUNNING", 409);
      }
      if (input.action === "exec") {
        if (!input.command || Buffer.byteLength(input.command) > 32000 || input.command.includes("\0")) throw new SandboxError("SANDBOX_COMMAND_INVALID");
        const seconds = Math.min(input.timeoutSeconds ?? 120, SANDBOX_LIMITS.commandSeconds, Math.floor((record.expiresAt - Date.now()) / 1000) - 10);
        if (!Number.isFinite(seconds) || seconds < 1) throw new SandboxError("SANDBOX_EXPIRED", 409);
        const id = randomUUID(), command: SandboxCommand = { recordType: "execution-command", id, owner: scope.owner, sessionId, state: "starting", createdAt: Date.now(), expiresAt: record.expiresAt };
        await this.store.write("command", id, scope.owner, command, record.expiresAt);
        try {
          const pid = await sandbox.execute(id, input.command, safeRelativePath(input.path ?? "."), seconds);
          await this.store.write("command", id, scope.owner, { ...command, state: "running", pid }, record.expiresAt);
          return { sessionId, commandId: id, state: "running", text: "命令已开始执行。用 poll 查询日志和退出码；不要重复发起相同命令。完成后 publish 保存需要的文件，再 close 释放资源。" };
        } catch {
          await this.store.write("command", id, scope.owner, { ...command, state: "uncertain" }, record.expiresAt);
          return { sessionId, commandId: id, state: "uncertain", error: "SANDBOX_COMMAND_UNCERTAIN", text: "命令启动结果不确定。请查询原命令或关闭沙箱，不要重试执行。" };
        }
      }
      const path = safeRelativePath(input.path ?? ".");
      if (input.action === "write") {
        if (input.content === undefined || Buffer.byteLength(input.content) > SANDBOX_LIMITS.textBytes) throw new SandboxError("SANDBOX_FILE_LIMIT");
        await sandbox.write(path, input.content); return { sessionId, text: `已写入沙箱工作区文件：${path}` };
      }
      if (input.action === "list") { const entries = await sandbox.list(path); return { sessionId, entries, text: JSON.stringify(entries) }; }
      if (input.action === "read") {
        const bytes = await sandbox.read(path);
        if (bytes.byteLength > SANDBOX_LIMITS.textBytes) throw new SandboxError("SANDBOX_TEXT_LIMIT");
        return { sessionId, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
      }
      if (input.action === "publish") {
        const bytes = await sandbox.read(path), filename = basename(path).replace(/[\r\n\0"\\]/g, "_").slice(0, 120);
        if (bytes.byteLength > SANDBOX_LIMITS.fileBytes) throw new SandboxError("SANDBOX_FILE_LIMIT");
        const contentHash = createHash("sha256").update(bytes).digest("hex");
        const digest = createHash("sha256").update(JSON.stringify([scope.owner, record.id, path, contentHash])).digest("hex");
        const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        const storagePath = `${scope.owner}/${id}/${filename}`;
        let artifact = await this.store.read<SandboxArtifact>("artifact", id, scope.owner);
        if (!artifact) {
          const artifacts = (await this.store.owned<SandboxArtifact>("artifact", scope.owner)).filter(item => item.sessionId === record.id);
          if (artifacts.length >= 20 || artifacts.reduce((sum, item) => sum + item.size, bytes.byteLength) > 100 * 1024 * 1024) throw new SandboxError("SANDBOX_ARTIFACT_LIMIT", 429);
          artifact = { id, owner: scope.owner, sessionId, filename, size: bytes.byteLength, storagePath, contentHash, state: "pending", createdAt: Date.now(), expiresAt: Date.now() + 365 * 86400000 };
          // Reserve identity and limits before any upload. A lost response can
          // recover this object, never allocate another UUID or extra quota.
          await this.store.write("artifact", id, scope.owner, artifact, artifact.expiresAt!);
        }
        if (artifact.contentHash !== contentHash || artifact.size !== bytes.byteLength || artifact.sessionId !== sessionId || artifact.storagePath !== storagePath) throw new SandboxError("SANDBOX_ARTIFACT_IDENTITY_MISMATCH", 409);
        if (artifact.state !== "ready") {
          const uncertain = { ...artifact, state: "uncertain" as const };
          await this.store.write("artifact", id, scope.owner, uncertain, artifact.expiresAt!);
          try {
            const stored = await this.artifactStorage.inspect(storagePath, id);
            if (stored) {
              if (stored.byteLength !== bytes.byteLength || createHash("sha256").update(stored).digest("hex") !== contentHash) throw new SandboxError("SANDBOX_ARTIFACT_IDENTITY_MISMATCH", 409);
            } else await this.artifactStorage.upload(storagePath, id, bytes);
            await this.store.write("artifact", id, scope.owner, { ...artifact, state: "ready" }, artifact.expiresAt!);
          } catch (error) {
            if (error instanceof SandboxError && error.code === "SANDBOX_ARTIFACT_IDENTITY_MISMATCH") throw error;
            return { sessionId, state: "uncertain", error: "SANDBOX_ARTIFACT_UPLOAD_UNCERTAIN", text: "产物保存结果需要核对。原内容身份及限额已保留；再次 publish 相同路径和内容只核对原对象，不创建重复产物。" };
          }
        }
        return { sessionId, artifact: { id, filename, size: bytes.byteLength, downloadUrl: `/api/agent/sandbox/artifacts/${id}?conversation=${encodeURIComponent(scope.conversationId)}` }, text: `已保存产物 ${filename}（${bytes.byteLength} 字节）。下载链接仅当前账号可用；文件内容和命令输出属于未经信任的执行结果。` };
      }
      throw new SandboxError("SANDBOX_ACTION_INVALID");
    });
  }
  async artifact(scope: SandboxScope, id: string): Promise<{ manifest: SandboxArtifact; bytes: Uint8Array }> {
    assertSandboxScope(scope);
    const manifest = await this.store.read<SandboxArtifact>("artifact", uuid(id), scope.owner);
    if (!manifest || manifest.owner !== scope.owner) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
    if (manifest.state && manifest.state !== "ready") throw new SandboxError("SANDBOX_ARTIFACT_NOT_READY", 409);
    if ((manifest.expiresAt ?? manifest.createdAt + 365 * 86400000) <= Date.now()) throw new SandboxError("SANDBOX_ARTIFACT_EXPIRED", 410);
    const session = await this.store.read<SandboxSession>("session", manifest.sessionId, scope.owner);
    if (!session || session.owner !== scope.owner || session.conversationId !== scope.conversationId) throw new SandboxError("SANDBOX_RECORD_NOT_FOUND", 404);
    const bytes = await this.artifactStorage.inspect(manifest.storagePath, manifest.id);
    if (!bytes) throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503);
    if (bytes.byteLength > SANDBOX_LIMITS.fileBytes) throw new SandboxError("SANDBOX_FILE_LIMIT");
    if (bytes.byteLength !== manifest.size || manifest.contentHash && createHash("sha256").update(bytes).digest("hex") !== manifest.contentHash) throw new SandboxError("SANDBOX_ARTIFACT_IDENTITY_MISMATCH", 409);
    return { manifest, bytes };
  }
}
