#!/usr/bin/env node
/**
 * 跨平台 node:test 运行器：发现所有 *.test.ts（不含 *.test.tsx）并用 tsx 执行。
 * tsx 读取 tsconfig.json 的 paths，因此 @/* 别名在 node:test 中同样生效。
 *
 * --filter=code     排除 tests/content/**
 * --filter=content  只跑 tests/content/**
 * 无参数            全部（保持现有行为）
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set([
  "node_modules",
  ".local-archive",
  ".next",
  ".git",
  "build",
  "dist",
  "dist-desktop",
  ".codex",
  ".agents",
  "manim",
]);

const SKIP_PATH_PREFIXES = [
  "docs/refer/dist",
  // 原独立 Classolo 源码只读归档在仓库内（gitignored），不属于本项目测试面。
  "1037Solo-Classolo",
];

function shouldSkipDir(path) {
  const normalized = relative(".", path).replace(/\\/g, "/");
  const name = normalized.split("/").pop();
  return SKIP_DIRS.has(name) || SKIP_PATH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function findTestFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const next = join(dir, entry.name);
      if (shouldSkipDir(next)) continue;
      findTestFiles(next, out);
    } else if (
      entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(relative(".", join(dir, entry.name)).replace(/\\/g, "/"));
    }
  }
  return out;
}

/** @param {"code" | "content" | null} filter */
export function applyFilter(files, filter) {
  if (filter === "content") return files.filter((f) => f.startsWith("tests/content/"));
  if (filter === "code") return files.filter((f) => !f.startsWith("tests/content/"));
  return files;
}

function parseFilter(argv) {
  const raw = argv.find((a) => a.startsWith("--filter="));
  if (!raw) return null;
  const value = raw.slice("--filter=".length);
  if (value === "code" || value === "content") return value;
  console.error(`Unknown --filter=${value}. Use --filter=code or --filter=content.`);
  process.exit(1);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function main() {
  const filter = parseFilter(process.argv.slice(2));
  const files = applyFilter(findTestFiles("."), filter);
  if (files.length === 0) {
    console.log("No .test.ts files found.");
    process.exit(0);
  }

  console.log(`Running ${files.length} test file(s):\n  ${files.join("\n  ")}\n`);

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...files],
    { stdio: "inherit", cwd: process.cwd() },
  );

  process.exit(result.status ?? 1);
}

if (isDirectRun()) main();
