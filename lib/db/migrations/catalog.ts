import type { SchemaInventory, SqlRow } from "./contracts";
import { quoteIdentName, tableBase } from "./analysis";
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).sort();
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).sort();
    } catch {
      return [];
    }
  }
  return [];
}

export const CATALOG_COMPARE_KEYS = [
  "tables",
  "indexes",
  "functions",
  "triggers",
  "policies",
  "rlsTables",
  "grants",
] as const;

export type CatalogCompareKey = (typeof CATALOG_COMPARE_KEYS)[number];

/**
 * Live-only objects that an empty rebuild cannot reproduce.
 * Keep this list explicit — an empty whitelist means catalogs must match exactly.
 *
 * schema CREATE for service_role is granted by Supabase on project create,
 * not by supabase/migrations/0001_init.sql (that file only GRANTs USAGE).
 */
export const HOSTED_CATALOG_NOISE: Record<CatalogCompareKey, string[]> = {
  tables: [],
  indexes: [],
  functions: [],
  triggers: [],
  policies: [],
  rlsTables: [],
  grants: ["schema:public:CREATE:service_role"],
};

export interface CatalogDiff {
  missing: string[];
  extra: string[];
  noise: string[];
}

export function emptySchemaInventory(): SchemaInventory {
  return {
    tables: [],
    indexes: [],
    uniqueConstraints: [],
    primaryKeys: [],
    functions: [],
    triggers: [],
    policies: [],
    rlsTables: [],
    grants: [],
  };
}

export function liveInventoryFromRow(row: SqlRow): SchemaInventory {
  return {
    ...emptySchemaInventory(),
    tables: asStringList(row.tables),
    indexes: asStringList(row.indexes),
    functions: asStringList(row.functions),
    triggers: asStringList(row.triggers),
    policies: asStringList(row.policies),
    rlsTables: asStringList(row.rls_tables),
    grants: asStringList(row.grants),
  };
}

export function diffCatalogs(
  actual: SchemaInventory,
  expected: SchemaInventory,
  noise: Record<CatalogCompareKey, string[]> = HOSTED_CATALOG_NOISE,
): CatalogDiff {
  const missing: string[] = [];
  const extra: string[] = [];
  const noiseHits: string[] = [];

  for (const key of CATALOG_COMPARE_KEYS) {
    const noiseSet = new Set(noise[key].map(quoteIdentName));
    const actualSet = new Set(actual[key].map(quoteIdentName));
    const expectedSet = new Set(expected[key].map(quoteIdentName));

    for (const item of expectedSet) {
      if (actualSet.has(item)) continue;
      if (noiseSet.has(item)) {
        noiseHits.push(`${key}:${item}`);
        continue;
      }
      missing.push(`${key}:${item}`);
    }
    for (const item of actualSet) {
      if (expectedSet.has(item)) continue;
      extra.push(`${key}:${item}`);
    }
  }

  return { missing, extra, noise: noiseHits.sort() };
}

export function catalogsMatch(diff: CatalogDiff): boolean {
  return diff.missing.length === 0 && diff.extra.length === 0;
}

export function missingFromLive(
  expected: SchemaInventory,
  live: Pick<SchemaInventory, "tables" | "indexes" | "functions" | "triggers" | "policies" | "rlsTables">,
): string[] {
  const missing: string[] = [];
  const check = (label: string, want: string[], have: string[]) => {
    const set = new Set(have.map(quoteIdentName));
    for (const item of want) {
      if (label === "index") {
        if (!set.has(item) && !set.has(`${tableBase(item)}`)) missing.push(`${label}:${item}`);
        continue;
      }
      if (!set.has(item)) missing.push(`${label}:${item}`);
    }
  };
  check("table", expected.tables, live.tables);
  check("index", [...expected.indexes, ...expected.uniqueConstraints, ...expected.primaryKeys], live.indexes);
  check("function", expected.functions, live.functions);
  check("trigger", expected.triggers, live.triggers);
  check("policy", expected.policies, live.policies);
  check("rls", expected.rlsTables, live.rlsTables);
  return missing;
}