/**
 * 凭证扫描 CLI。
 *   npx tsx scripts/check-secrets.ts           # 扫 git 追踪文件（lint 用）
 *   npx tsx scripts/check-secrets.ts --staged  # 扫暂存区（pre-commit 用）
 * 绕过：SECRET_SCAN_ALLOW=I_UNDERSTAND 或 --allow=I_UNDERSTAND
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatScanReport,
  resolveBypass,
  scanFiles,
  shouldScanPath,
  type SecretFinding,
} from "../lib/security/secretScan.ts";

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function gitLines(args: string[]): string[] {
  const stdout = execFileSync("git", args, {
    encoding: "utf8",
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    // 仓库追踪文件已破万，`git ls-files -z` 输出接近默认 1MB maxBuffer，
    // 会在 CI/本地触发 spawnSync git ENOBUFS；显式放大缓冲。
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout
    .split("\0")
    .map((line) => line.replace(/\\/g, "/").trim())
    .filter(Boolean);
}

function listTargets(staged: boolean): string[] {
  if (staged) {
    return gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);
  }
  return gitLines(["ls-files", "-z"]);
}

function readTarget(path: string, staged: boolean): string | null {
  if (staged) {
    try {
      return execFileSync("git", ["show", `:${path}`], {
        encoding: "utf8",
        cwd: process.cwd(),
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      return null;
    }
  }
  try {
    const buf = readFileSync(path);
    if (buf.includes(0)) return null;
    if (buf.byteLength > 1024 * 1024) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function printFindings(hits: SecretFinding[], bypassed: boolean) {
  const stream = bypassed ? console.warn : console.error;
  stream(formatScanReport(hits, bypassed));
}

export function runSecretScanCli(argv = process.argv.slice(2), env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const staged = argv.includes("--staged");
  const bypass = resolveBypass(argv, env);

  let paths: string[];
  try {
    paths = listTargets(staged).filter(shouldScanPath);
  } catch (error) {
    console.error("secret-scan: git is required to list tracked/staged files.");
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  const files: Array<{ path: string; text: string }> = [];
  for (const path of paths) {
    const text = readTarget(path, staged);
    if (text == null) continue;
    files.push({ path, text });
  }

  const { findings } = scanFiles(files, {
    bypass,
    applyLegacyAllowlist: !staged,
  });

  if (findings.length === 0) {
    const scope = staged ? "staged" : "tracked";
    console.log(`secret-scan: ok (${files.length} ${scope} file(s))`);
    return 0;
  }

  printFindings(findings, bypass);
  return bypass ? 0 : 1;
}

if (isDirectRun()) {
  process.exit(runSecretScanCli());
}
