import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, link } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";
import { resolveServiceAuthEnv } from "@/lib/auth/env";
import { seal, unseal } from "@/lib/connectors/vault-crypto.server";
import { sandboxConfiguration, SandboxError } from "./config.server";

export type RecordKind = "session" | "command" | "artifact" | "skill";
export interface ExecutionStore {
  read<T>(kind: RecordKind, id: string, owner: string): Promise<T | null>;
  write(kind: RecordKind, id: string, owner: string, value: unknown, expiresAt: number): Promise<void>;
  owned<T>(kind: RecordKind, owner: string): Promise<T[]>;
  lock<T>(key: string, work: () => Promise<T>): Promise<T>;
  reserve(id: string, owner: string, amount: number, expiresAt: number): Promise<void>;
  release(id: string, owner: string): Promise<void>;
  maintenanceSessions?(): Promise<{ id: string; owner: string }[]>;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const root = () => resolve(process.cwd(), ".local-archive/connectors-private/sandbox-state");
const context = (kind: string, id: string, owner: string) => `sandbox:${kind}:${id}:${owner}`;
const localMutex = new Map<string, Promise<void>>();
const currentLease = new AsyncLocalStorage<{ key: string; id: string; lost: boolean }>();

export class PersistentExecutionStore implements ExecutionStore {
  private db() { sandboxConfiguration(); return createServiceAuthClient(); }
  private sharedBudget() { return process.env.CLOUD_SANDBOX_BUDGET_AUTHORITY === "shared"; }
  private async authorizedBudgetDb() {
    if (!this.sharedBudget() || new URL(resolveServiceAuthEnv().supabaseUrl).hostname !== "zizaonaxfguvlzdcbxzw.supabase.co") throw new SandboxError("SANDBOX_BUDGET_NOT_RECONCILED", 503);
    const fingerprint = process.env.CLOUD_SANDBOX_BUDGET_IMPORT_FINGERPRINT;
    if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new SandboxError("SANDBOX_BUDGET_NOT_RECONCILED", 503);
    const db = this.db();
    const marker = await db.from("ss_agent_execution_budgets").select("reserved_micro_cny,cap_micro_cny").eq("period_key", `legacy:${fingerprint}`).maybeSingle();
    if (marker.error || !marker.data || Number(marker.data.reserved_micro_cny) !== 1800000 || Number(marker.data.cap_micro_cny) !== 1800000) throw new SandboxError("SANDBOX_BUDGET_NOT_RECONCILED", 503);
    return db;
  }
  async read<T>(kind: RecordKind, id: string, owner: string): Promise<T | null> {
    let ciphertext: string;
    if (process.env.NODE_ENV === "production") {
      const result = await this.db().from("ss_agent_execution_records").select("ciphertext").eq("id", id).eq("owner_uuid", owner).eq("kind", kind).maybeSingle();
      if (result.error) throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503);
      if (!result.data) return null;
      ciphertext = result.data.ciphertext;
    } else {
      try { ciphertext = await readFile(resolve(root(), `${hash(context(kind, id, owner))}.json`), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); }
    }
    try { return unseal<T>(ciphertext, sandboxConfiguration().key, context(kind, id, owner)); }
    catch { throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); }
  }
  async write(kind: RecordKind, id: string, owner: string, value: unknown, expiresAt: number) {
    const lease = currentLease.getStore();
    if (lease?.lost) throw new SandboxError("SANDBOX_LEASE_LOST", 409);
    const ciphertext = seal(value, sandboxConfiguration().key, context(kind, id, owner));
    if (process.env.NODE_ENV === "production") {
      const result = await this.db().rpc("ss_agent_execution_put", { p_id: id, p_owner: owner, p_kind: kind, p_ciphertext: ciphertext, p_expires_at: new Date(expiresAt).toISOString(), p_lease_key: lease?.key ?? null, p_lease: lease?.id ?? null });
      if (result.error || result.data !== true) throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503);
    } else {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const file = resolve(root(), `${hash(context(kind, id, owner))}.json`), temporary = `${file}.${randomUUID()}.pending`;
      await writeFile(temporary, ciphertext, { flag: "wx", mode: 0o600 }); await rename(temporary, file);
      // Per-owner hashed index contains no provider credential or another tenant's identifiers.
      await this.lock(`index:${kind}:${owner}`, async () => {
        const indexPath = resolve(root(), `${hash(`index:${kind}:${owner}`)}.index`);
        let ids: string[] = [];
        try { ids = JSON.parse(await readFile(indexPath, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); }
        if (!ids.includes(id)) { const indexTemp = `${indexPath}.${randomUUID()}.pending`; await writeFile(indexTemp, JSON.stringify([...ids, id]), { flag: "wx", mode: 0o600 }); await rename(indexTemp, indexPath); }
      });
    }
  }
  async owned<T>(kind: RecordKind, owner: string): Promise<T[]> {
    let ids: string[];
    if (process.env.NODE_ENV === "production") {
      ids = [];
      // Limits/cleanup must include older records; a newest-50 window can hide
      // reserved artifacts or a still unresolved creation from the same owner.
      for (let offset = 0; ; offset += 100) {
        const result = await this.db().from("ss_agent_execution_records").select("id").eq("kind", kind).eq("owner_uuid", owner).order("id").range(offset, offset + 99);
        if (result.error) throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503);
        ids.push(...result.data.map(item => item.id));
        if (result.data.length < 100) break;
      }
    } else {
      try { ids = JSON.parse(await readFile(resolve(root(), `${hash(`index:${kind}:${owner}`)}.index`), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); ids = []; }
    }
    return (await Promise.all(ids.map(id => this.read<T>(kind, id, owner)))).filter((item): item is Awaited<T> => item !== null);
  }
  async lock<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (process.env.NODE_ENV !== "production") {
      const before = localMutex.get(key) ?? Promise.resolve();
      let unlock!: () => void; const gate = new Promise<void>(resolveGate => { unlock = resolveGate; });
      const pending = before.then(() => gate); localMutex.set(key, pending); await before;
      let fileLock: string | undefined;
      let candidate: string | undefined;
      try {
        await mkdir(root(), { recursive: true, mode: 0o700 });
        const path = resolve(root(), `${hash(`lock:${key}`)}.lease`), deadline = Date.now() + 5000;
        candidate = `${path}.${randomUUID()}.candidate`;
        await writeFile(candidate, JSON.stringify({ pid: process.pid, id: randomUUID(), createdAt: Date.now() }), { flag: "wx", mode: 0o600 });
        while (!fileLock) {
          // Link publishes the already complete lease atomically; a crash cannot
          // leave a partially written ownerless lock in the acquisition path.
          try { await link(candidate, path); fileLock = path; }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            let holder: { pid: number } | undefined;
            try { holder = JSON.parse(await readFile(path, "utf8")); } catch { /* Writer may still be initializing. */ }
            let alive = true;
            if (holder?.pid) { try { process.kill(holder.pid, 0); } catch { alive = false; } }
            if (!alive) { await rename(path, `${path}.${randomUUID()}.abandoned`).catch(() => {}); continue; }
            if (Date.now() > deadline) throw new SandboxError("SANDBOX_BUSY", 409);
            await new Promise(resolveWait => setTimeout(resolveWait, 50));
          }
        }
        return await work();
      } finally { if (fileLock) await rename(fileLock, `${fileLock}.${randomUUID()}.released`).catch(() => {}); if (candidate) await rename(candidate, `${candidate}.finished`).catch(() => {}); unlock(); if (localMutex.get(key) === pending) localMutex.delete(key); }
    }
    const lease = randomUUID(), digest = hash(key), db = this.db();
    const acquired = await db.rpc("ss_agent_execution_lock", { p_key: digest, p_lease: lease, p_seconds: 45 });
    if (acquired.error || acquired.data !== true) throw new SandboxError("SANDBOX_BUSY", 409);
    const state = { key: digest, id: lease, lost: false };
    let pending: Promise<unknown> = Promise.resolve();
    const heartbeat = setInterval(() => { pending = pending.then(async () => {
      const renewed = await db.rpc("ss_agent_execution_lock", { p_key: digest, p_lease: lease, p_seconds: 45 });
      if (renewed.error || renewed.data !== true) state.lost = true;
    }).catch(() => { state.lost = true; }); }, 10000);
    heartbeat.unref?.();
    try { const result = await currentLease.run(state, work); await pending; if (state.lost) throw new SandboxError("SANDBOX_LEASE_LOST", 409); return result; }
    finally { clearInterval(heartbeat); await pending.catch(() => {}); await db.rpc("ss_agent_execution_unlock", { p_key: digest, p_lease: lease }); }
  }
  async reserve(id: string, owner: string, amount: number, expiresAt: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000 || expiresAt <= Date.now() || expiresAt > Date.now() + 1800000) throw new SandboxError("SANDBOX_BUDGET_INVALID");
    const config = sandboxConfiguration(), month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date());
    if (process.env.NODE_ENV !== "test" || this.sharedBudget()) {
      const db = await this.authorizedBudgetDb();
      // Marker and unreleased barriers are rechecked under the RPC's same
      // capacity transaction lock. A JS pre-query is not admission authority.
      const result = await db.rpc("ss_agent_execution_reserve_reconciled", { p_id: id, p_owner: owner, p_micro_cny: amount, p_month: month, p_run: config.runId, p_month_cap: config.monthlyMicroCny, p_run_cap: config.runMicroCny, p_expires_at: new Date(expiresAt).toISOString(), p_import_fingerprint: process.env.CLOUD_SANDBOX_BUDGET_IMPORT_FINGERPRINT });
      if (result.error) throw new SandboxError("SANDBOX_BUDGET_NOT_RECONCILED", 503);
      if (result.data !== true) throw new SandboxError("SANDBOX_BUDGET_OR_CAPACITY_EXCEEDED", 429);
      return;
    }
    await this.lock("global-budget", async () => {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const path = resolve(root(), "operator-reservations.json");
      let rows: { id: string; owner: string; month: string; run: string; amount: number; expiresAt: number; createdAt?: number; released?: boolean }[] = [];
      try { rows = JSON.parse(await readFile(path, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); }
      const existing = rows.find(row => row.id === id);
      if (existing) { if (existing.owner !== owner || existing.amount !== amount) throw new SandboxError("SANDBOX_BUDGET_INVALID"); return; }
      if (rows.filter(row => row.owner === owner && (row.createdAt ?? row.expiresAt) > Date.now() - 86400000).length >= 10) throw new SandboxError("SANDBOX_USER_QUOTA_EXCEEDED", 429);
      if (rows.filter(row => row.month === month).reduce((sum, row) => sum + row.amount, amount) > config.monthlyMicroCny || rows.filter(row => row.run === config.runId).reduce((sum, row) => sum + row.amount, amount) > config.runMicroCny || rows.some(row => !row.released && row.expiresAt > Date.now())) throw new SandboxError("SANDBOX_BUDGET_OR_CAPACITY_EXCEEDED", 429);
      rows.push({ id, owner, month, run: config.runId, amount, expiresAt, createdAt: Date.now() });
      const temp = `${path}.${randomUUID()}.pending`; await writeFile(temp, JSON.stringify(rows), { flag: "wx", mode: 0o600 }); await rename(temp, path);
    });
  }
  async release(id: string, owner: string) {
    if (process.env.NODE_ENV === "production" || this.sharedBudget()) {
      const result = await this.db().rpc("ss_agent_execution_release", { p_id: id, p_owner: owner });
      if (result.error) throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503);
      return;
    }
    await this.lock("global-budget", async () => {
      const path = resolve(root(), "operator-reservations.json");
      let rows: { id: string; owner: string; released?: boolean }[];
      try { rows = JSON.parse(await readFile(path, "utf8")); } catch { return; }
      for (const row of rows) if (row.id === id && row.owner === owner) row.released = true;
      const temp = `${path}.${randomUUID()}.pending`; await writeFile(temp, JSON.stringify(rows), { flag: "wx", mode: 0o600 }); await rename(temp, path);
    });
  }
  async maintenanceSessions() {
    if (process.env.NODE_ENV !== "production" && !this.sharedBudget()) {
      try {
        const rows: { id: string; owner: string; released?: boolean }[] = JSON.parse(await readFile(resolve(root(), "operator-reservations.json"), "utf8"));
        return rows.filter(row => !row.released).slice(0, 100).map(row => ({ id: row.id, owner: row.owner }));
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503); }
    }
    // Released sessions never occupy the next cleanup batch.
    const result = await this.db().from("ss_agent_execution_reservations").select("id,owner_uuid").is("released_at", null).order("created_at").limit(100);
    if (result.error) throw new SandboxError("SANDBOX_STORAGE_UNAVAILABLE", 503);
    return result.data.map(row => ({ id: row.id, owner: row.owner_uuid }));
  }
}
