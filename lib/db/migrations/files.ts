import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MigrationFile } from "./contracts";
export const DEFAULT_MIGRATIONS_DIR = "supabase/migrations";

export const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/i;

export function checksumSql(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function parseMigrationFilename(filename: string): { version: string; name: string } | null {
  const m = filename.match(FILE_RE);
  if (!m) return null;
  return { version: m[1], name: m[2] };
}

export function discoverMigrations(dir: string): MigrationFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files: MigrationFile[] = [];
  for (const filename of names) {
    const parsed = parseMigrationFilename(filename);
    if (!parsed) continue;
    const path = join(dir, filename);
    const sql = readFileSync(path, "utf8");
    files.push({
      version: parsed.version,
      name: parsed.name,
      filename,
      path,
      sql,
      checksum: checksumSql(sql),
    });
  }
  return files.sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
}