/** Read-only packaged resource and installer integrity gate; does not launch Electron. */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const arg = process.argv.find((value) => value.startsWith('--root='));
if (!arg) throw new Error('Usage: --root=dist-desktop-staged-<id>');
const workspace = process.cwd(), packageRoot = resolve(arg.slice(7)), rel = relative(workspace, packageRoot).replace(/\\/g, '/');
if (!/^dist-desktop-staged-[a-z0-9-]+$/.test(rel)) throw new Error('unsafe_package_check_root');
const standalone = join(packageRoot, 'win-unpacked/resources/standalone');
const required = ['server.js', 'node_modules/next/package.json', 'runtime/search-worker/search/worker/index.mjs', 'content/.index/manifest.json'];
for (const name of required) if (!existsSync(join(standalone, name))) throw new Error(`packaged_resource_missing:${name}`);
const manifest = JSON.parse(readFileSync(join(standalone, 'content/.index/manifest.json'), 'utf8'));
const requested = process.argv.find((value) => value.startsWith('--subjects='))?.slice(11).split(',').filter(Boolean).sort() ?? [];
if (requested.length && JSON.stringify(manifest.subjectScope) !== JSON.stringify(requested)) throw new Error('packaged_index_scope_mismatch');
if (existsSync(join(standalone, '.env.production')) || existsSync(join(standalone, 'content/.index/embed-cache.bin')) || existsSync(join(standalone, 'dist-desktop'))) throw new Error('packaged_denylist_violation');
for (const name of readdirSync(standalone)) if (/^\.env(?:\..*)?$/.test(name)) throw new Error('packaged_environment_file');
const runtimeDist = readdirSync(standalone).find((name) => name.startsWith('.next-desktop-'));
if (!runtimeDist) throw new Error('packaged_next_runtime_missing');
const prerender = JSON.parse(readFileSync(join(standalone, runtimeDist, 'prerender-manifest.json'), 'utf8'));
const routes = Object.keys(prerender.routes ?? {});
const knownSubjects = new Set(JSON.parse(readFileSync(resolve('lib/content-data/home.generated.json'), 'utf8')).map((row) => row.id));
if (requested.length && routes.some((route) => {
  const subject = route.split('/')[1];
  return knownSubjects.has(subject) && !requested.includes(subject);
})) throw new Error('unselected_static_route_in_package');
const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
const executables = [`StudySolo-portable-${version}.exe`, `StudySolo-setup-${version}.exe`];
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const artifacts = [];
for (const name of executables) {
  const file = join(packageRoot, name);
  if (!existsSync(file) || statSync(file).size < 10 * 1024 * 1024) throw new Error(`installer_missing_or_too_small:${name}`);
  artifacts.push({ name: basename(file), bytes: statSync(file).size, sha256: await sha256(file) });
}
const report = { schemaVersion: 1, packageRoot, indexScope: manifest.subjectScope ?? null, chunks: manifest.chunkCount, vectors: manifest.vectorCount, staticRoutes: routes.length, selectedStaticRoutes: requested.map((id) => ({ subjectId: id, count: routes.filter((route) => route.startsWith(`/${id}/`)).length })), artifacts, resources: { worker: true, index: true, next: true, envCopies: 0 } };
const out = resolve(`artifacts/performance/package-${requested.length ? 'offline' : 'online'}-check.json`);
mkdirSync(resolve('artifacts/performance'), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ output: out, staticRoutes: report.staticRoutes, chunks: report.chunks, vectors: report.vectors, artifacts: artifacts.map(({ name, bytes }) => ({ name, bytes })) }) + '\n');
