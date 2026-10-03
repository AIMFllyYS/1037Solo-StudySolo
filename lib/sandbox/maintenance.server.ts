import { sandboxConfiguration } from "./config.server";
import { PersistentExecutionStore, type ExecutionStore } from "./store.server";
import { AlibabaExecutionProvider, type ExecutionProvider } from "./provider.server";
import { closeExecution } from "./cleanup.server";
import type { SandboxCommand, SandboxSession } from "./types";

export async function maintainExecutions(store: ExecutionStore = new PersistentExecutionStore(), provider: ExecutionProvider = new AlibabaExecutionProvider()) {
  const config = sandboxConfiguration();
  let closed = 0, uncertain = 0, captured = 0;
  for (const item of await store.maintenanceSessions?.() ?? []) {
    await store.lock(`session:${item.id}`, async () => {
      const record = await store.read<SandboxSession>("session", item.id, item.owner);
      if (!record) { uncertain++; return; }
      if (record.state === "closed") { await store.release(record.id, record.owner); return; }
      if (record.configHash !== config.configHash) { uncertain++; return; }
      if (record.expiresAt <= Date.now()) {
        if (await closeExecution(store, provider, record)) closed++; else uncertain++;
        return;
      }
      if (record.state !== "active" || !record.providerId) return;
      const commands = (await store.owned<SandboxCommand>("command", record.owner)).filter(command => command.sessionId === record.id && command.state !== "completed");
      if (!commands.length) return;
      const connection = await provider.connect(record.providerId, record.expiresAt - Date.now());
      for (const command of commands) {
        const result = await connection.poll(command.id);
        await store.write("command", command.id, record.owner, { ...command, result, state: ["completed", "failed"].includes(result.state) ? "completed" : "running" }, command.expiresAt);
        captured++;
      }
    }).catch(() => { uncertain++; });
  }
  return { closed, uncertain, captured };
}

const scheduler = Symbol.for("StudySolo.sandbox.maintenance");
/** Trusted Node server timer; per-session distributed leases serialize replicas. */
export function startExecutionMaintenance() {
  const state = globalThis as typeof globalThis & { [scheduler]?: ReturnType<typeof setInterval> };
  if (state[scheduler] || process.env.CLOUD_SANDBOX_ENABLED !== "true" || process.env.NEXT_PHASE === "phase-production-build") return;
  let pending = false;
  const run = async () => {
    if (pending || process.env.CLOUD_SANDBOX_ENABLED !== "true") return;
    pending = true;
    try { await maintainExecutions(); } catch { /* Provider TTL remains the independent shutdown backstop. */ }
    finally { pending = false; }
  };
  state[scheduler] = setInterval(() => { void run(); }, 15000);
  state[scheduler].unref?.();
  void run();
}
