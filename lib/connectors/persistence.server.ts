import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { seal, unseal } from "./vault-crypto.server";
import { connectorEncryptionKey } from "./config.server";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";

const production = () => process.env.NODE_ENV === "production";
const hash = (context: string) => createHash("sha256").update(context).digest("hex");
const owner = (value: unknown): string | null => {
  const id = value && typeof value === "object" && "owner" in value ? value.owner : null;
  return typeof id === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ? id : null;
};
function pathFor(context: string) { return resolve(process.cwd(), ".local-archive/connectors-private/development-vault", `${hash(context)}.json`); }
function database() {
  if (process.env.CONNECTOR_ALLOW_PRODUCTION !== "true") throw new Error("connector_production_disabled");
  return createServiceAuthClient();
}
export async function readRecord<T>(context: string): Promise<T | null> {
  let raw: string;
  if (production()) {
    const result = await database().from("ss_connector_records").select("ciphertext").eq("record_key", hash(context)).maybeSingle();
    if (result.error) throw new Error("connector_storage_unavailable");
    if (!result.data) return null; raw = result.data.ciphertext;
  } else {
    try { raw = await readFile(/* turbopackIgnore: true */ pathFor(context), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("connector_storage_unavailable"); }
  }
  try { return unseal<T>(raw, connectorEncryptionKey(), context); } catch { throw new Error("connector_storage_unavailable"); }
}

/** A revision accompanies the encrypted snapshot; callers can commit without overwriting newer authority. */
export async function readVersionedRecord<T>(context: string): Promise<{ value: T; revision: number | string } | null> {
  if (production()) {
    const result = await database().from("ss_connector_records").select("ciphertext,revision").eq("record_key", hash(context)).maybeSingle();
    if (result.error) throw new Error("connector_storage_unavailable"); if (!result.data) return null;
    return { value: unseal<T>(result.data.ciphertext, connectorEncryptionKey(), context), revision: result.data.revision };
  }
  try { const raw = await readFile(/* turbopackIgnore: true */ pathFor(context), "utf8"); return { value: unseal<T>(raw, connectorEncryptionKey(), context), revision: createHash("sha256").update(raw).digest("hex") }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("connector_storage_unavailable"); }
}
export async function compareRecord(context: string, revision: number | string, value: unknown): Promise<boolean> {
  if (production()) {
    const result = await database().rpc("ss_connector_put", { p_key: hash(context), p_owner: owner(value), p_ciphertext: seal(value, connectorEncryptionKey(), context), p_expected_revision: revision });
    if (result.error) throw new Error("connector_storage_unavailable"); return result.data === true;
  }
  return fileGate(pathFor(context), async () => {
    const current = await readVersionedRecord(context); if (!current || current.revision !== revision) return false;
    const path = pathFor(context), temporary = `${path}.${randomUUID()}.pending`;
    await writeFile(temporary, seal(value, connectorEncryptionKey(), context), { flag: "wx", mode: 0o600 }); await rename(temporary, path); return true;
  });
}
export async function writeRecord(context: string, value: unknown) {
  const ciphertext = seal(value, connectorEncryptionKey(), context);
  if (production()) {
    const result = await database().rpc("ss_connector_put", { p_key: hash(context), p_owner: owner(value), p_ciphertext: ciphertext });
    if (result.error || result.data !== true) throw new Error("connector_storage_unavailable");
    return;
  }
  const path = pathFor(context); await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  await fileGate(path, async () => { const temporary = `${path}.${randomUUID()}.pending`; await writeFile(temporary, ciphertext, { flag: "wx", mode: 0o600 }); await rename(temporary, path); });
}
export async function claimRecord(context: string): Promise<boolean> {
  if (production()) {
    const result = await database().rpc("ss_connector_claim", { p_key: hash(`claim:${context}`) });
    if (result.error) throw new Error("connector_storage_unavailable"); return result.data === true;
  }
  const path = pathFor(context); await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  try { await writeFile(`${path}.consumed`, "consumed", { flag: "wx", mode: 0o600 }); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw new Error("connector_storage_unavailable"); }
}
export async function isClaimed(context: string): Promise<boolean> {
  if (production()) { const result = await database().from("ss_connector_records").select("record_key").eq("record_key", hash(`claim:${context}`)).maybeSingle(); if (result.error) throw new Error("connector_storage_unavailable"); return !!result.data; }
  try { await stat(`${pathFor(context)}.consumed`); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw new Error("connector_storage_unavailable"); }
}

/** Cross-process lease. Expired/released local lease files are archived, never deleted. */
export async function acquireLease(context: string, ttl = 45000): Promise<(() => Promise<void>) | null> {
  const id = randomUUID();
  if (production()) {
    const result = await database().rpc("ss_connector_lease", { p_key: hash(context), p_id: id, p_seconds: Math.ceil(ttl / 1000) });
    if (result.error) throw new Error("connector_storage_unavailable");
    if (!result.data) return null;
    let stopped = false, renewing: Promise<unknown> = Promise.resolve();
    const timer = setInterval(() => { if (!stopped) renewing = Promise.resolve(database().rpc("ss_connector_lease", { p_key: hash(context), p_id: id, p_seconds: Math.ceil(ttl / 1000) })); }, Math.max(1000, Math.floor(ttl / 3))); timer.unref?.();
    return async () => { stopped = true; clearInterval(timer); await renewing.catch(() => {}); await database().rpc("ss_connector_release_lease", { p_key: hash(context), p_id: id }); };
  }
  const path = `${pathFor(context)}.lease`; await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const acquired = await fileGate(path, async () => {
    try {
      const saved = JSON.parse(await readFile(path, "utf8"));
      if (saved.expiresAt > Date.now() || saved.pid && alive(saved.pid)) return false;
      await rename(path, `${path}.expired-${id}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false; }
    await writeFile(path, JSON.stringify({ id, pid: process.pid, expiresAt: Date.now() + ttl }), { flag: "wx", mode: 0o600 }); return true;
  });
  if (!acquired) return null;
  return async () => fileGate(path, async () => {
    try { const saved = JSON.parse(await readFile(path, "utf8")); if (saved.id === id) await rename(path, `${path}.released-${id}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("connector_lease_unavailable"); }
  });
}
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } }
/** Every local acquire/release/commit enters this short gate, avoiding stale-file rename races. */
async function fileGate<T>(path: string, work: () => Promise<T>): Promise<T> {
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const gate = `${path}.gate`, id = randomUUID();
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await writeFile(gate, JSON.stringify({ id, pid: process.pid }), { flag: "wx", mode: 0o600 });
      try { return await work(); } finally { await rename(gate, `${gate}.released-${id}`); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const old = JSON.parse(await readFile(gate, "utf8"));
        if (!alive(old.pid)) {
          await writeFile(`${gate}.reap-${old.id}`, "claimed", { flag: "wx", mode: 0o600 });
          const current = JSON.parse(await readFile(gate, "utf8")); if (current.id === old.id) await rename(gate, `${gate}.expired-${id}`);
        }
      } catch { /* Another gate holder/reaper proceeds first. */ }
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
  }
  throw new Error("connector_busy");
}
export async function withLease<T>(context: string, work: () => Promise<T>): Promise<T> {
  let release: (() => Promise<void>) | null = null;
  for (let count = 0; count < 40 && !release; count++) {
    release = await acquireLease(context);
    if (!release) await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  if (!release) throw new Error("connector_busy");
  try { return await work(); } finally { await release(); }
}
