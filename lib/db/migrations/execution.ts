import type { SqlRow, AppliedMigration, SqlExecutor, MigrationStatus, MigrationFile, RunMigrationsResult } from "./contracts";
import { BOOTSTRAP_SQL, SELECT_APPLIED_SQL } from "./sql";
import { DEFAULT_MIGRATIONS_DIR, discoverMigrations } from "./files";
export const SCHEMA_MIGRATIONS_TABLE = "public.schema_migrations";

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function asApplied(row: SqlRow): AppliedMigration {
  return {
    version: String(row.version ?? ""),
    name: String(row.name ?? ""),
    checksum: String(row.checksum ?? ""),
    applied_at: String(row.applied_at ?? ""),
  };
}

export async function ensureMigrationsTable(executor: SqlExecutor): Promise<void> {
  await executor.query(BOOTSTRAP_SQL);
}

export async function listAppliedMigrations(executor: SqlExecutor): Promise<AppliedMigration[]> {
  const rows = await executor.query(SELECT_APPLIED_SQL);
  return rows.map(asApplied);
}

export async function getMigrationStatus(
  executor: SqlExecutor,
  dir = DEFAULT_MIGRATIONS_DIR,
): Promise<MigrationStatus> {
  await ensureMigrationsTable(executor);
  const applied = await listAppliedMigrations(executor);
  const appliedVersions = new Set(applied.map((row) => row.version));
  const files = discoverMigrations(dir);
  const pending = files.filter((file) => !appliedVersions.has(file.version));
  const currentVersion = applied.length > 0 ? applied[applied.length - 1].version : null;
  return { currentVersion, applied, pending };
}

export function assertChecksums(applied: AppliedMigration[], files: MigrationFile[]): void {
  const byVersion = new Map(files.map((file) => [file.version, file]));
  for (const row of applied) {
    const file = byVersion.get(row.version);
    if (file && file.checksum !== row.checksum) {
      throw new Error(
        `Migration ${row.version} checksum mismatch (applied ${row.checksum.slice(0, 12)}…, file ${file.checksum.slice(0, 12)}…). Add a new file instead of editing an applied migration.`,
      );
    }
  }
}

export async function runMigrations(
  executor: SqlExecutor,
  dir = DEFAULT_MIGRATIONS_DIR,
): Promise<RunMigrationsResult> {
  await ensureMigrationsTable(executor);
  const applied = await listAppliedMigrations(executor);
  const files = discoverMigrations(dir);
  assertChecksums(applied, files);

  const appliedVersions = new Set(applied.map((row) => row.version));
  const result: RunMigrationsResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (appliedVersions.has(file.version)) {
      result.skipped.push(file.version);
      continue;
    }
    const wrapped = [
      "begin",
      file.sql.trim().replace(/;\s*$/, ""),
      `insert into public.schema_migrations (version, name, checksum) values (${sqlLiteral(file.version)}, ${sqlLiteral(file.name)}, ${sqlLiteral(file.checksum)})`,
      "commit",
    ].join(";\n") + ";";
    await executor.query(wrapped);
    result.applied.push(file.version);
  }
  // 0001 grants ALL on every public table. Re-lock the version table so an
  // empty rebuild matches live (where bootstrap ran after the baseline).
  await ensureMigrationsTable(executor);
  return result;
}

export async function stampMigrations(
  executor: SqlExecutor,
  dir = DEFAULT_MIGRATIONS_DIR,
  versions?: string[],
): Promise<string[]> {
  await ensureMigrationsTable(executor);
  const applied = await listAppliedMigrations(executor);
  const files = discoverMigrations(dir);
  assertChecksums(applied, files);
  const appliedVersions = new Set(applied.map((row) => row.version));
  const want = versions ? new Set(versions) : null;
  const stamped: string[] = [];

  for (const file of files) {
    if (appliedVersions.has(file.version)) continue;
    if (want && !want.has(file.version)) continue;
    await executor.query(
      `insert into public.schema_migrations (version, name, checksum) values (${sqlLiteral(file.version)}, ${sqlLiteral(file.name)}, ${sqlLiteral(file.checksum)})`,
    );
    stamped.push(file.version);
  }
  return stamped;
}
