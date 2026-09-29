import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { runSecretScanCli } from "../../scripts/check-secrets.ts";
import {
  BYPASS_CONFIRMATION,
  BYPASS_ENV,
  formatScanReport,
  isPlaceholderSecret,
  resolveBypass,
  scanFiles,
  scanText,
  shouldScanPath,
} from "./secretScan.ts";

const FAKE_SK = ["sk-", "aa11bb22", "cc33dd44", "ee55ff66", "gg77hh88"].join("");
const FAKE_SBP = ["sbp_", "abcdef0123456789".repeat(2)].join("");
const FAKE_JWT = ["eyJhbGciOiJub25lIn0", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "testsigxx"].join(".");

test("isPlaceholderSecret：.env.example 风格的 sk-xxxx 是占位", () => {
  assert.equal(isPlaceholderSecret("sk-xxxxxxxxxxxxxxxx"), true);
  assert.equal(isPlaceholderSecret("sk-xxx"), true);
  assert.equal(isPlaceholderSecret("x".repeat(20)), true);
  assert.equal(isPlaceholderSecret(FAKE_SK), false);
});

test("scanText：占位 sk- / 短 dummy 不拦截，长密钥拦截", () => {
  const clean = scanText("RELAY_API_KEY=sk-xxxxxxxxxxxxxxxx\nAI_API_KEY=sk-test\n", "env");
  assert.deepEqual(clean, []);

  const hits = scanText(`RELAY_API_KEY=${FAKE_SK}\n`, ".env.local");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "sk-");
  assert.equal(hits[0].line, 1);
  assert.doesNotMatch(hits[0].excerpt, new RegExp(FAKE_SK.slice(8)));
});

test("scanText：sbp_ 短 fixture 放行，长 token 拦截", () => {
  assert.deepEqual(scanText('accessToken: "sbp_test"\ntoken: "sbp_x"\n', "t.ts"), []);
  const hits = scanText(`token=${FAKE_SBP}\n`, "t.ts");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "sbp_");
});

test("scanText：截断 eyJ 放行，完整 JWT 拦截", () => {
  assert.deepEqual(scanText("MinerU_API_Token=eyJ0eXBlIjoiSldU...（你的 Token）\n", "doc.md"), []);
  const hits = scanText(`token=${FAKE_JWT}\n`, "doc.md");
  assert.ok(hits.some((hit) => hit.kind === "eyJ"));
});

test("scanText：Postgres service_role 角色名放行，赋值密钥拦截", () => {
  assert.deepEqual(
    scanText('["table:app_users:SELECT:service_role"]\ngrants:schema:public:create:service_role\n', "fix.json"),
    [],
  );
  assert.deepEqual(scanText("# SUPABASE_SERVICE_ROLE_KEY=\n", ".env.example"), []);

  const assigned = scanText(
    `${["SUPABASE_SERVICE_ROLE_KEY=", "not-a-placeholder-value"].join("")}\n`,
    "leak.env",
  );
  assert.ok(assigned.some((hit) => hit.kind === "service_role"));
});

test("shouldScanPath：跳过 content/、lockfile 与二进制", () => {
  assert.equal(shouldScanPath("content/physics/detail/7.2.md"), false);
  assert.equal(shouldScanPath("pnpm-lock.yaml"), false);
  assert.equal(shouldScanPath("public/icon.png"), false);
  assert.equal(shouldScanPath("lib/security/secretScan.ts"), true);
  assert.equal(shouldScanPath(".env.example"), true);
});

test("resolveBypass：只有确认词才能绕过", () => {
  assert.equal(resolveBypass([], {}), false);
  assert.equal(resolveBypass(["--allow=1"], {}), false);
  assert.equal(resolveBypass(["--allow"], { [BYPASS_ENV]: "1" }), false);
  assert.equal(resolveBypass([`--allow=${BYPASS_CONFIRMATION}`], {}), true);
  assert.equal(resolveBypass(["--allow", BYPASS_CONFIRMATION], {}), true);
  assert.equal(resolveBypass([], { [BYPASS_ENV]: BYPASS_CONFIRMATION }), true);
});

test("scanFiles：legacy allowlist 只在 default 模式跳过，staged 仍报", () => {
  const path = "docs/analysis/9-9/15-nextjs-compliance.md";
  const text = `AI_API_KEY=${FAKE_SK}\n`;
  const files = [{ path, text }];

  const allowed = scanFiles(files, { bypass: false, applyLegacyAllowlist: true });
  assert.deepEqual(allowed.findings, []);
  assert.deepEqual(allowed.skippedAllowlist, [path]);

  const staged = scanFiles(files, { bypass: false, applyLegacyAllowlist: false });
  assert.ok(staged.findings.some((hit) => hit.kind === "sk-"));
});

test("formatScanReport：绕过说明必须带确认词", () => {
  const report = formatScanReport(
    [{ path: "x.ts", line: 3, kind: "sk-", excerpt: "sk-aa1… (sk-, 34 chars)" }],
    true,
  );
  assert.match(report, new RegExp(BYPASS_CONFIRMATION));
  assert.match(report, /bypassed/);
});

test("真实 .env.example / README / fixture 不被启发式误杀", () => {
  const root = process.cwd();
  const samples = [
    ".env.example",
    "README.md",
    "lib/ai/provider.test.ts",
    "lib/db/fixtures/live-catalog.snapshot.json",
    "lib/db/backup.test.ts",
    "lib/db/usageAlert.test.ts",
    "docs/sop/00-infrastructure.md",
  ];
  for (const rel of samples) {
    const text = readFileSync(join(root, rel), "utf8");
    assert.deepEqual(scanText(text, rel), [], rel);
  }
});

test(".gitignore 忽略所有 .env* 变体，保留 .env.example", () => {
  const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(gitignore, /^[^!\n]*\.env\.example$/m);
});

test("pre-commit hook 对暂存文件跑扫描且要求显式确认词", () => {
  const hook = readFileSync(join(process.cwd(), "scripts/git-hooks/pre-commit"), "utf8");
  assert.match(hook, /check-secrets\.ts --staged/);
  assert.match(hook, /SECRET_SCAN_ALLOW=I_UNDERSTAND/);
});

test("runSecretScanCli scans a retained Git fixture, including archived builds", () => {
  // Production releases are git archives, not working checkouts. Exercise the
  // real CLI on its own tracked fixture instead of relying on the caller's .git.
  const original = process.cwd();
  const fixtures = join(original, ".local-archive", "secret-scan-fixtures");
  mkdirSync(fixtures, { recursive: true });
  const fixture = mkdtempSync(join(fixtures, "tracked-"));
  execFileSync("git", ["init", "--quiet", fixture], { stdio: "pipe" });
  writeFileSync(join(fixture, "fixture.ts"), "export const healthy = true;\n");
  execFileSync("git", ["-C", fixture, "add", "fixture.ts"], { stdio: "pipe" });
  try {
    process.chdir(fixture);
    assert.equal(runSecretScanCli([], {}), 0);
    writeFileSync("fixture.ts", `export const token = "${FAKE_SK}";\n`);
    assert.equal(runSecretScanCli([], {}), 1);
  } finally {
    process.chdir(original);
  }
  // Keep the synthetic fixture for audit; never delete deployment/user files.
});
