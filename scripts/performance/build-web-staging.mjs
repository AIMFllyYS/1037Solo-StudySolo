/** Isolated Web production build from the current working tree; no server is started. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const distDir = `.next-perf-web-${new Date().toISOString().toLowerCase().replace(/[:.]/g, '-')}`;
const output = resolve(root, distDir);
if (relative(root, output).startsWith('..') || existsSync(output)) throw new Error('unsafe_or_existing_web_build_output');
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) throw new Error('Run through npm run perf:web so npm lifecycle checks are available');
const configPath = resolve(root, 'tsconfig.json'), originalConfig = readFileSync(configPath, 'utf8');
const started = Date.now();
let status = 1;
try {
  const child = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: root, stdio: 'inherit', shell: false,
    env: { ...process.env, STUDYSOLO_BUILD_DIR: distDir, BUILD_STANDALONE: '0', NEXT_PUBLIC_OFFLINE_SUBJECTS: '' },
  });
  if (child.error) throw child.error;
  status = child.status ?? 1;
} finally {
  const current = readFileSync(configPath, 'utf8');
  if (current !== originalConfig && current.includes(distDir)) writeFileSync(configPath, originalConfig);
}
const report = { schemaVersion: 1, distDir, status, elapsedMs: Date.now() - started, serverStarted: false };
const reportPath = resolve(root, 'artifacts/performance/web-build-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + '\n');
if (status !== 0) process.exitCode = status;
