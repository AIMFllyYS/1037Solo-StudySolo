import type { SchemaInventory, MigrationFile } from "./contracts";
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += c;
      if (c === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      current += c;
      if (c === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += c;
      i += 1;
      continue;
    }
    if (inSingle) {
      current += c;
      if (c === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (c === "-" && next === "-") {
      inLineComment = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tag) {
        dollarTag = tag[0];
        current += tag[0];
        i += tag[0].length;
        continue;
      }
    }
    if (c === ";") {
      const stmt = current.trim();
      if (stmt) out.push(stmt);
      current = "";
      i += 1;
      continue;
    }
    current += c;
    i += 1;
  }
  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteIdentName(raw: string): string {
  return raw.replace(/^"|"$/g, "").toLowerCase();
}

export function tableBase(name: string): string {
  return name.replace(/^public\./, "");
}

export function extractSchemaInventory(sql: string): SchemaInventory {
  const tables = new Set<string>();
  const indexes = new Set<string>();
  const uniqueConstraints = new Set<string>();
  const primaryKeys = new Set<string>();
  const functions = new Set<string>();
  const triggers = new Set<string>();
  const policies = new Set<string>();
  const rlsTables = new Set<string>();
  const grants = new Set<string>();

  for (const raw of splitSqlStatements(sql)) {
    const s = stripSqlComments(raw);
    const lower = s.toLowerCase();

    const table = lower.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-z0-9_]+)/);
    if (table) {
      tables.add(table[1]);
      primaryKeys.add(`${table[1]}_pkey`);
      const uniqueCols = [...s.matchAll(/\bunique\s*\(([^)]+)\)/gi)];
      for (const u of uniqueCols) {
        const cols = u[1].split(",").map((c) => c.trim().split(/\s+/)[0].replace(/"/g, "").toLowerCase());
        uniqueConstraints.add(`${table[1]}_${cols.join("_")}_key`);
      }
      const inlineUnique = [...s.matchAll(/(?:^|[,(])\s*([a-z0-9_]+)\s+[^,()]+?\bunique\b/gi)];
      for (const u of inlineUnique) {
        uniqueConstraints.add(`${table[1]}_${u[1].toLowerCase()}_key`);
      }
    }

    const idx = lower.match(/^create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/);
    if (idx) indexes.add(idx[1]);

    const fn = lower.match(/^create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/);
    if (fn) functions.add(fn[1]);

    const trig = lower.match(/^create\s+trigger\s+([a-z0-9_]+)/);
    if (trig) triggers.add(trig[1]);

    const pol = lower.match(/^create\s+policy\s+([a-z0-9_]+)/);
    if (pol) policies.add(pol[1]);

    const rls = lower.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/);
    if (rls) rlsTables.add(rls[1]);

    if (lower.startsWith("grant ") || lower.startsWith("alter default privileges")) {
      grants.add(lower.replace(/\s+/g, " "));
    }
  }

  return {
    tables: [...tables].sort(),
    indexes: [...indexes].sort(),
    uniqueConstraints: [...uniqueConstraints].sort(),
    primaryKeys: [...primaryKeys].sort(),
    functions: [...functions].sort(),
    triggers: [...triggers].sort(),
    policies: [...policies].sort(),
    rlsTables: [...rlsTables].sort(),
    grants: [...grants].sort(),
  };
}

export function mergeInventories(parts: SchemaInventory[]): SchemaInventory {
  const merge = (key: keyof SchemaInventory) =>
    [...new Set(parts.flatMap((p) => p[key]))].sort();
  return {
    tables: merge("tables"),
    indexes: merge("indexes"),
    uniqueConstraints: merge("uniqueConstraints"),
    primaryKeys: merge("primaryKeys"),
    functions: merge("functions"),
    triggers: merge("triggers"),
    policies: merge("policies"),
    rlsTables: merge("rlsTables"),
    grants: merge("grants"),
  };
}

export function inventoryFromMigrations(files: MigrationFile[]): SchemaInventory {
  return mergeInventories(files.map((f) => extractSchemaInventory(f.sql)));
}

export function findNonIdempotentStatements(sql: string): string[] {
  const issues: string[] = [];
  const droppedTriggers = new Set<string>();
  const droppedPolicies = new Set<string>();

  for (const raw of splitSqlStatements(sql)) {
    const s = stripSqlComments(raw);
    const lower = s.toLowerCase();

    const dropTrig = lower.match(/^drop\s+trigger\s+if\s+exists\s+([a-z0-9_]+)/);
    if (dropTrig) droppedTriggers.add(dropTrig[1]);
    const dropPol = lower.match(/^drop\s+policy\s+if\s+exists\s+([a-z0-9_]+)/);
    if (dropPol) droppedPolicies.add(dropPol[1]);

    if (/^create\s+table\s+(?!if\s+not\s+exists\b)/i.test(s)) {
      issues.push(`CREATE TABLE without IF NOT EXISTS: ${s.slice(0, 72)}`);
    }
    if (/^create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists\b)/i.test(s)) {
      issues.push(`CREATE INDEX without IF NOT EXISTS: ${s.slice(0, 72)}`);
    }
    if (/^create\s+extension\s+(?!if\s+not\s+exists\b)/i.test(s)) {
      issues.push(`CREATE EXTENSION without IF NOT EXISTS: ${s.slice(0, 72)}`);
    }
    if (/^create\s+function\b/i.test(s) && !/^create\s+or\s+replace\s+function\b/i.test(s)) {
      issues.push(`CREATE FUNCTION without OR REPLACE: ${s.slice(0, 72)}`);
    }
    if (/^create\s+trigger\s+/i.test(s)) {
      const name = s.match(/^create\s+trigger\s+([a-z0-9_]+)/i)?.[1]?.toLowerCase();
      if (!name || !droppedTriggers.has(name)) {
        issues.push(`CREATE TRIGGER without DROP IF EXISTS: ${s.slice(0, 72)}`);
      }
    }
    if (/^create\s+policy\s+/i.test(s)) {
      const name = s.match(/^create\s+policy\s+([a-z0-9_]+)/i)?.[1]?.toLowerCase();
      if (!name || !droppedPolicies.has(name)) {
        issues.push(`CREATE POLICY without DROP IF EXISTS: ${s.slice(0, 72)}`);
      }
    }
  }
  return issues;
}
