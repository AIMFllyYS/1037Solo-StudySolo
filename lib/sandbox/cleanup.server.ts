import type { ExecutionStore } from "./store.server";
import { sandboxScopeHash, type ExecutionProvider } from "./provider.server";
import type { SandboxCommand, SandboxSession } from "./types";
import { isExecutionCommand, type SandboxAuthRetry } from "./types";

/** Trusted maintenance primitive. Caller owns the session lease and identity check. */
export async function closeExecution(store: ExecutionStore, provider: ExecutionProvider, record: SandboxSession) {
  if (record.state === "closed") return true;
  const commands = (await store.owned<SandboxCommand | SandboxAuthRetry>("command", record.owner)).filter(isExecutionCommand).filter(item => item.sessionId === record.id && item.state !== "completed");
  // Close is strictly risk reduction: DELETE the exact provider identity and
  // retain already durable logs. SDK connect can race an external pause and
  // auto-resume; never connect just to collect one more log before destruction.
  // The last not-yet-persisted output may be unavailable after this close.
  await store.write("session", record.id, record.owner, { ...record, state: "closing" }, record.expiresAt);
  let stopped = false;
  if (record.providerId) stopped = await provider.terminate(record.providerId).catch(() => false);
  else {
    const found = await provider.find(record.id, sandboxScopeHash(record.owner, record.conversationId), 1000).catch(() => null);
    // Empty list alone is not proof that a timed-out create allocated nothing.
    stopped = !!found?.length;
    for (const sandbox of found ?? []) if (!await sandbox.kill().catch(() => false)) stopped = false;
    // No provider identity means an empty listing/elapsed local TTL cannot
    // confirm the outcome of a timed-out create. Keep its uncertain marker.
  }
  await store.write("session", record.id, record.owner, { ...record, state: stopped ? "closed" : "uncertain" }, record.expiresAt);
  if (stopped) {
    for (const command of commands) {
      if (command.state === "completed") continue;
      const result = { ...command.result, state: "failed", stdout: command.result?.stdout ?? "", stderr: command.result?.stderr ?? "", reason: record.expiresAt <= Date.now() ? "sandbox_expired" : "sandbox_closed" };
      await store.write("command", command.id, record.owner, { ...command, state: "completed", result }, command.expiresAt);
    }
    await store.release(record.id, record.owner);
  }
  return stopped;
}
