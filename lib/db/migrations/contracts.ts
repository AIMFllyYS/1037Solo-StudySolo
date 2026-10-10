export type SqlRow = Record<string, unknown>;

export interface SqlExecutor {
  query<T extends SqlRow = SqlRow>(sql: string): Promise<T[]>;
}

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
}

export interface SchemaInventory {
  tables: string[];
  indexes: string[];
  uniqueConstraints: string[];
  primaryKeys: string[];
  functions: string[];
  triggers: string[];
  policies: string[];
  rlsTables: string[];
  grants: string[];
}

export interface MigrationStatus {
  currentVersion: string | null;
  applied: AppliedMigration[];
  pending: MigrationFile[];
}

export interface RunMigrationsResult {
  applied: string[];
  skipped: string[];
}