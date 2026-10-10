// Stable migration tooling API. Parsing/inventory, files, execution, catalog comparison and transport are separate responsibilities.
export type { SqlRow, SqlExecutor, MigrationFile, AppliedMigration, SchemaInventory, MigrationStatus, RunMigrationsResult } from "./migrations/contracts";
export { BOOTSTRAP_SQL, LIVE_INVENTORY_SQL } from "./migrations/sql";
export { DEFAULT_MIGRATIONS_DIR, checksumSql, parseMigrationFilename, discoverMigrations } from "./migrations/files";
export { splitSqlStatements, extractSchemaInventory, inventoryFromMigrations, findNonIdempotentStatements } from "./migrations/analysis";
export { SCHEMA_MIGRATIONS_TABLE, getMigrationStatus, runMigrations, stampMigrations } from "./migrations/execution";
export { CATALOG_COMPARE_KEYS, HOSTED_CATALOG_NOISE, emptySchemaInventory, liveInventoryFromRow, diffCatalogs, catalogsMatch, missingFromLive } from "./migrations/catalog";
export type { CatalogCompareKey, CatalogDiff } from "./migrations/catalog";
export { createManagementApiExecutor } from "./migrations/managementApi";
