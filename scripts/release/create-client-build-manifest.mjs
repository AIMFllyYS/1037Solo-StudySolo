import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GITHUB_RELEASE_ASSET_LIMIT = 2 * 1024 * 1024 * 1024;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const COMMIT_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

export function expectedClientArtifacts(platform, version) {
  if (!VERSION_RE.test(version)) throw new Error("invalid_client_version");
  if (platform === "windows") {
    return [`StudySolo-setup-${version}.exe`, `StudySolo-portable-${version}.exe`];
  }
  if (platform === "android") {
    return [`StudySolo-android-${version}-unsigned.apk`];
  }
  throw new Error("invalid_client_platform");
}

export function createClientBuildManifest({ platform, version, sourceSha, artifacts }) {
  if (!VERSION_RE.test(version)) throw new Error("invalid_client_version");
  if (typeof sourceSha !== "string" || !COMMIT_RE.test(sourceSha)) throw new Error("invalid_source_sha");
  const expected = expectedClientArtifacts(platform, version);
  if (!Array.isArray(artifacts) || artifacts.length !== expected.length) throw new Error("client_artifact_count_mismatch");

  const byName = new Map();
  for (const artifact of artifacts) {
    if (!artifact || !expected.includes(artifact.name) || byName.has(artifact.name)) throw new Error("unexpected_client_artifact");
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || artifact.bytes >= GITHUB_RELEASE_ASSET_LIMIT) {
      throw new Error("client_artifact_size_out_of_range");
    }
    if (typeof artifact.sha256 !== "string" || !SHA256_RE.test(artifact.sha256)) throw new Error("invalid_client_artifact_sha256");
    byName.set(artifact.name, { name: artifact.name, bytes: artifact.bytes, sha256: artifact.sha256 });
  }
  for (const name of expected) if (!byName.has(name)) throw new Error("client_artifact_missing");

  return {
    schemaVersion: 1,
    platform,
    version,
    sourceSha: sourceSha.toLowerCase(),
    signed: false,
    artifacts: expected.map((name) => byName.get(name)),
  };
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const match = argv[i].match(/^--([^=]+)=(.*)$/);
    if (match) args.set(match[1], match[2]);
    else if (argv[i].startsWith("--")) args.set(argv[i].slice(2), argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.get("platform");
  const version = args.get("version");
  const sourceSha = args.get("source-sha");
  const artifactDirArg = args.get("artifact-dir");
  if (!platform || !version || !sourceSha || !artifactDirArg) {
    throw new Error("usage: --platform=windows|android --version=X.Y.Z --source-sha=SHA --artifact-dir=PATH");
  }

  const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const packageVersion = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version;
  if (packageVersion !== version) throw new Error("package_version_mismatch");

  const artifactDir = resolve(artifactDirArg);
  const names = expectedClientArtifacts(platform, version);
  const artifacts = [];
  for (const name of names) {
    const path = join(artifactDir, name);
    if (basename(path) !== name) throw new Error("unsafe_client_artifact_path");
    const stat = statSync(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size >= GITHUB_RELEASE_ASSET_LIMIT) throw new Error(`client_artifact_size_invalid:${name}`);
    artifacts.push({ name, bytes: stat.size, sha256: await sha256File(path) });
  }

  const manifest = createClientBuildManifest({ platform, version, sourceSha, artifacts });
  const outputPath = join(artifactDir, "client-build-manifest.json");
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ outputPath, platform, version, sourceSha: manifest.sourceSha, artifacts: manifest.artifacts })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
