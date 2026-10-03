import type { ExecutionStore } from "./store.server";
import { sandboxScopeHash, type ExecutionProvider } from "./provider.server";
import type { SandboxCommand, SandboxSession } from "./types";

/** Trusted maintenance primitive. Caller owns the session lease and identity check. */
export async function closeExecution(store: ExecutionStore, provider: ExecutionProvider, record: SandboxSession) {
  if (record.state === "closed") return true;
  const commands = (await store.owned<SandboxCommand>("command", record.owner)).filter(item => item.sessionId === record.id && item.state !== "completed");
  // Capture the last durable state before destruction. Provider may already have
  // expired; never invent success or replace previously captured stdout/stderr.
  if (record.providerId && record.expiresAt > Date.now()) {
    const connection = await provider.connect(record.providerId, record.expiresAt - Date.now()).catch(() => null);
    if (connection) {
      for (const command of commands) {
        await connection.cancel(command.id).catch(() => {});
        let result = await connection.poll(command.id).catch(() => command.result);
        for (let attempt = 0; result && !["completed", "failed"].includes(result.state) && attempt < 5; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          result = await connection.poll(command.id).catch(() => result);
        }
        if (result) { command.result = result; if (["completed", "failed"].includes(result.state)) command.state = "completed"; }
        await store.write("command", command.id, record.owner, command, command.expiresAt);
      }
    }
  }
  await store.write("session", record.id, record.owner, { ...record, state: "closing" }, record.expiresAt);
  let stopped = false;
  if (record.providerId) stopped = await provider.terminate(record.providerId).catch(() => false);
  else {
    const found = await provider.find(record.id, sandboxScopeHash(record.owner, record.conversationId), 1000).catch(() => null);
    // Empty list alone is not proof that a timed-out create allocated nothing.
    stopped = !!found?.length;
    for (const sandbox of found ?? []) if (!await sandbox.kill().catch(() => false)) stopped = false;
    // Fixed provider TTL starts during create; allow its request timeout margin.
    if (found?.length === 0 && Date.now() >= record.expiresAt + 60000) stopped = true;
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
