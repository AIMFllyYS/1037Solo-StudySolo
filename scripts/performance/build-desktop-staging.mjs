/** Non-destructive desktop build: every run gets fresh Next, standalone and package paths. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, join, dirname } from 'node:path';
import { copyStandaloneShell } from './standalone-shell.mjs';

const root = process.cwd();
const id = new Date().toISOString().toLowerCase().replace(/[:.]/g, '-');
const distDir = `.next-desktop-${id}`;
const stageRel = `artifacts/performance/desktop-stage-${id}`;
const stageRoot = resolve(root, stageRel, 'standalone');
const packageRel = `dist-desktop-staged-${id}`;
const tier = process.argv.includes('--offline') ? 'desktop-offline-subjects' : 'desktop-online';
const subjects = process.argv.find((arg) => arg.startsWith('--subjects='))?.slice(11) ?? '';
const packageRequested = process.argv.includes('--package');
const startedAt = Date.now();
if (tier === 'desktop-offline-subjects' && !subjects) throw new Error('offline_subjects_required');

function withinWorkspace(value) {
  const target = resolve(root, value), rel = relative(root, target);
  if (!rel || rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) throw new Error(`unsafe_staging_path:${value}`);
  return target;
}
for (const dir of [distDir, stageRel, packageRel]) {
  if (existsSync(withinWorkspace(dir))) throw new Error(`staging_target_already_exists:${dir}`);
}
function run(args, env = process.env) {
  const child = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', shell: false });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`staging_command_failed:${args[0]}:${child.status}`);
}

// A build from the current working tree includes authorized dirty source without
// copying .env into any tracked or public directory. Its output stays isolated.
run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.search-worker.json']);
run(['scripts/performance/assert-search-worker.mjs']);
run(['--import', 'tsx', 'scripts/gen-nav-manifest.ts']);
run(['scripts/gen-display-images.mjs']);
run(['scripts/check-display-images.mjs']);
run(['--import', 'tsx', 'scripts/check-registry-consistency.ts']);
run(['--import', 'tsx', 'scripts/check-index-freshness.ts']);
const tsconfigPath = withinWorkspace('tsconfig.json');
const originalTsconfig = readFileSync(tsconfigPath, 'utf8');
const buildStartedAt = Date.now();
try {
  run(['node_modules/next/dist/bin/next', 'build'], {
    ...process.env,
    BUILD_STANDALONE: '1',
    STUDYSOLO_BUILD_DIR: distDir,
    STUDYSOLO_OFFLINE_SUBJECTS: tier === 'desktop-offline-subjects' ? subjects : '',
    NEXT_PUBLIC_OFFLINE_SUBJECTS: tier === 'desktop-offline-subjects' ? subjects : '',
    ...(tier === 'desktop-online' ? { NEXT_PUBLIC_VIDEO_CDN_BASE: process.env.NEXT_PUBLIC_VIDEO_CDN_BASE || 'https://qimo1b-1392708216.cos.ap-nanjing.myqcloud.com' } : { NEXT_PUBLIC_VIDEO_CDN_BASE: '' }),
  });
} finally {
  // Next adds a unique distDir include to tsconfig on each isolated build.
  // Keep the tracked source exactly as it was before this experiment.
  const current = readFileSync(tsconfigPath, 'utf8');
  if (current !== originalTsconfig && current.includes(distDir)) writeFileSync(tsconfigPath, originalTsconfig);
}
const buildMs = Date.now() - buildStartedAt;

const source = withinWorkspace(join(distDir, 'standalone'));
if (!existsSync(join(source, 'server.js'))) throw new Error('standalone_server_missing');
// NFT can overtrace the entire checkout, including .env.production. Redact only
// generated copies; the root environment file is never opened or modified.
for (const name of readdirSync(source)) {
  if (/^\.env(?:\..*)?$/.test(name)) writeFileSync(join(source, name), '# generated environment copy redacted; inject secrets at runtime\n');
}
copyStandaloneShell(source, stageRoot, distDir);
cpSync(withinWorkspace(join(distDir, 'static')), join(stageRoot, distDir, 'static'), { recursive: true });

// Materialize the existing pnpm trace into a fresh destination. Nothing in the
// Next output or earlier desktop packages is removed or overwritten.
const pnpm = join(source, 'node_modules', '.pnpm');
if (!existsSync(pnpm)) throw new Error('standalone_pnpm_trace_missing');
function packageName(name) {
  if (name.startsWith('@')) {
    const plus = name.indexOf('+'), at = name.indexOf('@', plus + 1);
    return plus > 0 && at > plus ? `${name.slice(0, plus)}/${name.slice(plus + 1, at)}` : null;
  }
  const at = name.indexOf('@'); return at > 0 ? name.slice(0, at) : null;
}
for (const directory of readdirSync(pnpm)) {
  const name = packageName(directory);
  if (!name) continue;
  const src = join(pnpm, directory, 'node_modules', name);
  if (!existsSync(src)) continue;
  const dest = join(stageRoot, 'node_modules', name);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) cpSync(src, dest, { recursive: true, dereference: true });
}
for (const name of ['next', 'react', 'react-dom']) if (!existsSync(join(stageRoot, 'node_modules', name, 'package.json'))) throw new Error(`materialized_dependency_missing:${name}`);

run(['--import', 'tsx', 'scripts/performance/runtime-asset-inventory.ts', `--tier=${tier}`, ...(subjects ? [`--subjects=${subjects}`] : [])]);
const inventoryPath = withinWorkspace(`artifacts/performance/asset-inventory-${tier}.json`);
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
if (inventory.missing.length) throw new Error(`runtime_assets_missing:${inventory.missing.length}`);
let scopedIndexRel = null;
if (tier === 'desktop-offline-subjects') {
  scopedIndexRel = `artifacts/performance/index-scope-${id}`;
  run(['--import', 'tsx', 'scripts/performance/select-subject-index.ts', `--subjects=${subjects}`, `--out=${scopedIndexRel}`]);
  run(['--import', 'tsx', 'scripts/performance/validate-index-stage.ts', `--dir=${scopedIndexRel}`]);
}
for (const file of inventory.files) {
  if (scopedIndexRel && file.startsWith('content/.index/')) continue;
  const dest = withinWorkspace(join(stageRel, 'standalone', file));
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) cpSync(withinWorkspace(file), dest);
}
if (scopedIndexRel) {
  for (const name of ['manifest.json', 'bm25.json', 'chunks-meta.json', 'vectors.bin', 'vectors.ids.json']) {
    const dest = withinWorkspace(join(stageRel, 'standalone', 'content/.index', name));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(withinWorkspace(join(scopedIndexRel, name)), dest);
  }
}
if (readdirSync(stageRoot).some((name) => /^\.env(?:\..*)?$/.test(name))) throw new Error('staged_environment_file_forbidden');
for (const file of ['server.js', 'node_modules/next/package.json', 'runtime/search-worker/search/worker/index.mjs', 'content/.index/manifest.json']) {
  if (!existsSync(join(stageRoot, file))) throw new Error(`staged_runtime_missing:${file}`);
}

// Build a private per-run config. The repository's installer config and any
// previous dist-desktop directory stay untouched.
let config = readFileSync(withinWorkspace('electron-builder.yml'), 'utf8');
const fromCount = (config.match(/from: \.next\/standalone/g) ?? []).length;
if (fromCount !== 2 || !config.includes('output: dist-desktop')) throw new Error('desktop_config_shape_changed');
config = config.replaceAll('from: .next/standalone', `from: ${stageRel.replace(/\\/g, '/')}/standalone`);
config = config.replace('output: dist-desktop', `output: ${packageRel}`);
const configPath = withinWorkspace(`artifacts/performance/desktop-stage-${id}.yml`);
writeFileSync(configPath, config);
if (packageRequested) {
  run(['node_modules/electron-builder/cli.js', '--win', '--publish', 'never', '--config', configPath]);
  run(['scripts/performance/verify-packaged-desktop.mjs', `--root=${packageRel}`, ...(subjects ? [`--subjects=${subjects}`] : [])]);
}
const originalIndexBytes = inventory.files.filter((file) => file.startsWith('content/.index/')).reduce((sum, file) => sum + (existsSync(withinWorkspace(file)) ? statSync(withinWorkspace(file)).size : 0), 0);
const scopedIndexBytes = scopedIndexRel ? ['manifest.json', 'bm25.json', 'chunks-meta.json', 'vectors.bin', 'vectors.ids.json'].reduce((sum, name) => sum + statSync(withinWorkspace(join(scopedIndexRel, name))).size, 0) : 0;
const assetBytes = scopedIndexRel ? inventory.totalBytes - originalIndexBytes + scopedIndexBytes : inventory.totalBytes;
const report = { schemaVersion: 1, stageRoot, configPath, packageDir: withinWorkspace(packageRel), packaged: packageRequested, tier, subjects: subjects ? subjects.split(',') : [], scopedIndexRel, fileCount: inventory.fileCount, assetBytes, buildMs, totalMs: Date.now() - startedAt, sourceTopLevelEntries: readdirSync(source).length, stageTopLevelEntries: readdirSync(stageRoot).length };
writeFileSync(withinWorkspace(join(stageRel, 'build-report.json')), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + '\n');
