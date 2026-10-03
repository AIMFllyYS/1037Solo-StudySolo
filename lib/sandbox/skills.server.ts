import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { assertSandboxScope, type SandboxScope } from "./actor.server";
import { sandboxConfiguration, SandboxError } from "./config.server";
import { PersistentExecutionStore, type ExecutionStore } from "./store.server";
import catalog from "./skill-packs/catalog.json";
import { parseSkillMarkdown } from "@/lib/utils/skillFrontmatter";
import type { Skill } from "@/lib/types/skill";

export const SKILL_RUNTIME_VERSION = "skills-runtime-v1-20261004";
export interface SkillInstallation { id: string; owner: string; packageId: string; version: string; digest: string; installedAt: number; active: boolean }
const installationId = (owner: string, id: string) => {
  const hash = createHash("sha256").update(`skill:${owner}:${id}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
export function skillRuntimeReady() { return process.env.CLOUD_SANDBOX_ENABLED === "true" && process.env.CLOUD_SANDBOX_SKILLS_VERSION === SKILL_RUNTIME_VERSION && process.env.CLOUD_SANDBOX_SKILLS_TEMPLATE === process.env.CLOUD_SANDBOX_TEMPLATE; }
export function skillPackage(id: string) {
  const item = catalog.packages.find(item => item.id === id);
  if (!item) throw new SandboxError("SKILL_PACKAGE_NOT_FOUND", 404);
  return item;
}
export async function skillPackageFiles(id: string) {
  const pack = skillPackage(id), base = resolve(process.cwd(), "lib/sandbox/skill-packs", pack.id);
  return Promise.all(pack.files.map(async file => {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.split("/").includes("..")) throw new SandboxError("SKILL_PACKAGE_INVALID", 503);
    const path = resolve(base, file.path), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new SandboxError("SKILL_PACKAGE_INVALID", 503);
    const bytes = await readFile(path);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new SandboxError("SKILL_PACKAGE_CHANGED", 503);
    return { path: file.path, bytes };
  }));
}
export async function installedPackages(scope: SandboxScope, store: ExecutionStore = new PersistentExecutionStore()) {
  assertSandboxScope(scope);
  return (await store.owned<SkillInstallation>("skill", scope.owner)).filter(item => item.owner === scope.owner && item.active && catalog.packages.some(pack => pack.id === item.packageId && pack.digest === item.digest));
}
export async function skillsForAgent(scope: SandboxScope | undefined, incoming: Skill[], store?: ExecutionStore) {
  if (!scope) return incoming;
  const installed = await installedPackages(scope, store);
  const skills = incoming.filter(skill => !catalog.packages.some(pack => pack.id === skill.sourceId));
  const usedIds = new Set(skills.map(skill => skill.id));
  for (const item of installed) {
    const files = await skillPackageFiles(item.packageId);
    const source = files.find(file => file.path === "SKILL.md")!.bytes.toString("utf8");
    const adapter = files.find(file => file.path === "references/studysolo-runtime.md")!.bytes.toString("utf8");
    const parsed = parseSkillMarkdown(source, "SKILL.md");
    const selected = incoming.find(skill => skill.sourceId === item.packageId);
    // Client IDs are composer references, not installation authority. Keep a
    // valid selected reference while replacing all executable content from the
    // verified Account installation, or skill:<client-id> loses its selection.
    const clientId = selected?.id;
    let id = clientId && /^[A-Za-z0-9_.:-]{1,160}$/.test(clientId) && !usedIds.has(clientId)
      ? clientId : `package:${item.packageId}`;
    let suffix = 0;
    while (usedIds.has(id)) id = `package:${item.packageId}:${item.id}:${++suffix}`;
    usedIds.add(id);
    skills.push({ id, name: parsed.name, description: parsed.description, content: `${adapter}\n\n${parsed.content}`, pinned: selected?.pinned === true, createdAt: item.installedAt, sourceId: item.packageId, sourceVersion: item.version });
  }
  return skills;
}
export async function manageSkillPackage(scope: SandboxScope, id: string, active: boolean, store: ExecutionStore = new PersistentExecutionStore()) {
  assertSandboxScope(scope);
  if (!scope.canExecute) throw new SandboxError("SANDBOX_READ_ONLY_SCOPE", 403);
  sandboxConfiguration();
  const pack = skillPackage(id);
  if (active && !skillRuntimeReady()) throw new SandboxError("SKILL_RUNTIME_NOT_READY", 503);
  if (active) await skillPackageFiles(id);
  const record: SkillInstallation = { id: installationId(scope.owner, id), owner: scope.owner, packageId: id, version: pack.version, digest: pack.digest, installedAt: Date.now(), active };
  await store.lock(`skill:${record.id}`, () => store.write("skill", record.id, scope.owner, record, Date.now() + 365 * 86400000));
  const content = (await readFile(resolve(process.cwd(), "lib/sandbox/skill-packs", id, "SKILL.md"), "utf8")) + "\n\n" + await readFile(resolve(process.cwd(), "lib/sandbox/skill-packs", id, "references/studysolo-runtime.md"), "utf8");
  return { ...record, owner: undefined, content, fileCount: pack.files.length, runtime: SKILL_RUNTIME_VERSION };
}
