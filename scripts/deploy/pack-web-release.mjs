/** Package a clean CI standalone build; no service is started or switched. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const root = process.cwd();
const output = process.env.STUDYSOLO_RELEASE_OUTPUT;
if (!output || !isAbsolute(output)) throw new Error("absolute_release_output_required");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("release_commit_invalid");
const stage = join(output, `studysolo-web-${commit}`);
await mkdir(stage, { recursive: false });
await cp(join(root, ".next/standalone"), stage, { recursive: true, verbatimSymlinks: true });
await cp(join(root, ".next/static"), join(stage, ".next/static"), { recursive: true });
await cp(join(root, "public"), join(stage, "public"), { recursive: true });

let files = 0;
let bytes = 0;
async function check(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const rel = relative(stage, path).replaceAll("\\", "/");
    const components = rel.split("/");
    if (components.some(part => /^\.env(?:\.|$)/.test(part)
      || [".local-archive", ".git", "dist-desktop", "_raw", "_raw-src"].includes(part))) {
      throw new Error("private_or_raw_release_asset_forbidden");
    }
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      const link = await readlink(path);
      const resolved = resolve(dirname(path), link);
      const target = relative(stage, resolved);
      if (isAbsolute(link) || isAbsolute(target) || target === ".." || target.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
        throw new Error("release_symlink_outside_package");
      }
    } else if (stat.isDirectory()) {
      await check(path);
    } else if (stat.isFile()) {
      files++;
      bytes += stat.size;
    } else {
      throw new Error("release_special_file_forbidden");
    }
  }
}
await check(stage);
for (const path of ["server.js", ".next/BUILD_ID", "node_modules/next/package.json", "runtime/search-worker/search/worker/index.mjs", "content/.index/manifest.json", "lib/sandbox/skill-packs/catalog.json"]) {
  if (!(await lstat(join(stage, path))).isFile()) throw new Error(`release_runtime_missing:${path}`);
}
const packageInfo = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const metadata = { schemaVersion: 1, product: "StudySolo", target: "linux-amd64-web", commit, version: packageInfo.version, buildId: (await readFile(join(stage, ".next/BUILD_ID"), "utf8")).trim(), files, bytes, operatorEnvironmentIncluded: false, serviceStarted: false };
await writeFile(join(stage, "studysolo-release.json"), JSON.stringify(metadata, null, 2));
const archive = join(output, `studysolo-web-${commit}.tar.gz`);
execFileSync("tar", ["-czf", archive, "-C", stage, "."], { stdio: ["ignore", "ignore", "pipe"] });
const digest = createHash("sha256");
for await (const chunk of createReadStream(archive)) digest.update(chunk);
const hash = digest.digest("hex");
await writeFile(`${archive}.sha256`, `${hash}  studysolo-web-${commit}.tar.gz\n`);
await writeFile(join(output, "release-reference.json"), JSON.stringify({ ...metadata, archiveSha256: hash }, null, 2));
console.log(JSON.stringify({ commit, buildId: metadata.buildId, archiveSha256: hash, files, bytes, serviceStarted: false }));
