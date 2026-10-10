/** Read-only runtime asset whitelist for Web and desktop packaging experiments. */
import * as fs from "node:fs";
import * as path from "node:path";
import { contentTree } from "../../lib/content-data/manifest";
import { mediaManifest } from "../../lib/content-data/media";
import { videoPoster } from "../../lib/content/poster";
import { INDEX_FILES } from "../../lib/ai/search/indexes/indexIo";

export type RuntimeTier = "web" | "desktop-online" | "desktop-offline-subjects";
const ROOT = process.cwd();
const INDEX_RUNTIME = [INDEX_FILES.manifest, INDEX_FILES.bm25, INDEX_FILES.chunksMeta, INDEX_FILES.vectorsBin, INDEX_FILES.vectorsIds];
const PUBLIC_COMMON = ["public/pdfjs", "public/plugins", "public/rdkit", "public/skills"];
const PUBLIC_SUBJECT_ROOTS = ["public/images", "public/images-display/v2", "public/chemistry", "public/histology", "public/physics"];

function collect(relative: string, files: Set<string>): void {
  const absolute = path.resolve(ROOT, relative);
  if (!absolute.startsWith(ROOT + path.sep)) throw new Error(`asset_path_outside_workspace:${relative}`);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) { files.add(relative.replace(/\\/g, "/")); return; }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("_backup") || entry.name === "_raw" || entry.name === "_raw-src") continue;
    collect(path.join(relative, entry.name), files);
  }
}

export function runtimeAssetInventory(tier: RuntimeTier, subjectIds: readonly string[] = []) {
  if (tier !== "web" && tier !== "desktop-online" && tier !== "desktop-offline-subjects") throw new Error("invalid_runtime_tier");
  const allowed = new Set<string>(contentTree.subjects.map((subject) => subject.id));
  for (const id of subjectIds) if (!allowed.has(id)) throw new Error(`unknown_offline_subject:${id}`);
  if (tier === "desktop-offline-subjects" && subjectIds.length === 0) throw new Error("offline_subjects_required");
  const files = new Set<string>(), missing: string[] = [];
  if (tier !== "web") {
    const subjects = tier === "desktop-online" ? [...allowed] : [...new Set(subjectIds)];
    for (const id of subjects) collect(`content/${id}`, files);
    if (tier === "desktop-online" || subjects.includes("probability")) collect("content/chapters", files);
    if (tier === "desktop-online") {
      collect("content/examples", files); collect("content/quiz", files);
    } else {
      for (const id of subjects) { collect(`content/examples/${id}`, files); collect(`content/quiz/${id}`, files); }
      if (subjects.includes("probability")) {
        for (const entry of fs.readdirSync(path.resolve(ROOT, "content/examples"), { withFileTypes: true })) {
          if (entry.isDirectory() && /^ch\d+$/.test(entry.name)) collect(`content/examples/${entry.name}`, files);
        }
      }
    }
    for (const name of INDEX_RUNTIME) {
      const relative = `content/.index/${name}`;
      if (fs.existsSync(path.resolve(ROOT, relative))) collect(relative, files);
      else missing.push(relative);
    }
    for (const workerFile of ["runtime/search-worker/search/worker/index.mjs", "runtime/search-worker/search/worker/core.mjs", "runtime/search-worker/indexing/bm25Index.js"]) {
      if (fs.existsSync(path.resolve(ROOT, workerFile))) collect(workerFile, files);
      else missing.push(workerFile);
    }
    collect("lib/ai/prompts", files);
    for (const dir of PUBLIC_COMMON) collect(dir, files);
    if (tier === "desktop-online") {
      for (const dir of [...PUBLIC_SUBJECT_ROOTS, "public/media/posters"]) collect(dir, files);
    } else {
      for (const id of subjects) { collect(`public/images/${id}`, files); collect(`public/images-display/v2/${id}`, files); collect(`public/${id}`, files); }
    }
    if (tier === "desktop-offline-subjects") {
      const selected = new Set(subjects);
      for (const video of mediaManifest.videos) {
        if (!selected.has(video.subjectId)) continue;
        const relative = `public${video.src}`;
        if (fs.existsSync(path.resolve(ROOT, relative))) collect(relative, files);
        else missing.push(relative);
        const poster = videoPoster(video);
        if (poster && fs.existsSync(path.resolve(ROOT, `public${poster}`))) collect(`public${poster}`, files);
      }
    }
  }
  const paths = [...files].sort();
  if (paths.some((file) => /(^|\/)(_raw|_raw-src|embed-cache|dist-desktop|1037Solo-Classolo)(\/|\.|$)/.test(file))) throw new Error("runtime_asset_denylist_violation");
  const totalBytes = paths.reduce((sum, file) => sum + fs.statSync(path.resolve(ROOT, file)).size, 0);
  return { schemaVersion: 1, tier, subjects: tier === "desktop-offline-subjects" ? [...new Set(subjectIds)].sort() : [], fileCount: paths.length, totalBytes, missing, files: paths };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("runtime-asset-inventory.ts")) {
  const tier = (process.argv.find((arg) => arg.startsWith("--tier="))?.slice(7) ?? "desktop-online") as RuntimeTier;
  const subjects = process.argv.find((arg) => arg.startsWith("--subjects="))?.slice(11).split(",").filter(Boolean) ?? [];
  const result = runtimeAssetInventory(tier, subjects);
  const outputDir = path.resolve(ROOT, "artifacts/performance");
  fs.mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, `asset-inventory-${tier}.json`);
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({ output, tier, fileCount: result.fileCount, totalBytes: result.totalBytes, missing: result.missing.length }) + "\n");
  if (result.missing.length) process.exitCode = 1;
}
