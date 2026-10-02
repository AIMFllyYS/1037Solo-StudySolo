/** Offline fresh keyword index + verified reuse of existing vectors. Never calls a provider. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { generateChunks } from "../../lib/ai/indexing/chunker";
import { buildCompactBm25Index } from "../../lib/ai/indexing/bm25Index";
import { contentHashOf } from "../../lib/ai/indexing/contentHash";
import { INDEX_FILES, parseManifest } from "../../lib/ai/search/indexIo";

const root = process.cwd();
const source = path.resolve(root, "content/.index");
const output = path.resolve(root, `artifacts/performance/index-stage-${new Date().toISOString().toLowerCase().replace(/[:.]/g, "-")}`);
if (!output.startsWith(path.resolve(root, "artifacts/performance") + path.sep) || fs.existsSync(output)) throw new Error("unsafe_or_existing_index_stage");
const oldManifest = parseManifest(fs.readFileSync(path.join(source, INDEX_FILES.manifest)));
if (!oldManifest) throw new Error("existing_index_manifest_invalid");
const chunks = generateChunks();
const currentIds = new Set(chunks.map((chunk) => chunk.id));
const vectorIds = JSON.parse(fs.readFileSync(path.join(source, INDEX_FILES.vectorsIds), "utf8")) as string[];
const vectorIdSet = new Set(vectorIds);
const vectorBin = path.join(source, INDEX_FILES.vectorsBin);
if (fs.statSync(vectorBin).size !== vectorIds.length * oldManifest.dimension * 4) throw new Error("existing_vector_matrix_invalid");
const cachedMeta = JSON.parse(fs.readFileSync(path.join(source, "embed-cache.meta.json"), "utf8")) as { hashes?: Record<string, string> };
const stale: string[] = [];
for (const id of vectorIds) if (!currentIds.has(id)) stale.push(id);
for (const chunk of chunks) {
  if (!vectorIdSet.has(chunk.id)) continue;
  const expected = createHash("sha1").update(chunk.contextPrefix + "\n" + chunk.text).digest("hex").slice(0, 16);
  if (cachedMeta.hashes?.[chunk.id] !== expected) stale.push(chunk.id);
}
if (stale.length) throw new Error(`existing_vector_reuse_unsafe:${stale.length}`);
const missingVectors = chunks.length - vectorIds.length;
fs.mkdirSync(output, { recursive: true });
const bm25 = buildCompactBm25Index(chunks);
fs.writeFileSync(path.join(output, INDEX_FILES.bm25), JSON.stringify(bm25));
fs.writeFileSync(path.join(output, INDEX_FILES.chunksMeta), JSON.stringify({ builtAt: new Date().toISOString(), chunks: chunks.map(({ id, path: contentPath, subjectId, subjectName, categoryId, itemId, title, chunkIndex, text }) => ({ id, path: contentPath, subjectId, subjectName, categoryId, itemId, title, chunkIndex, text })) }));
for (const name of [INDEX_FILES.vectorsBin, INDEX_FILES.vectorsIds, "embed-cache.bin", "embed-cache.ids.json", "embed-cache.meta.json"]) {
  const file = path.join(source, name);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(output, name));
}
const manifest = { version: 2 as const, builtAt: new Date().toISOString(), embeddingModel: oldManifest.embeddingModel, dimension: oldManifest.dimension, chunkCount: chunks.length, vectorCount: vectorIds.length, contentHash: contentHashOf(chunks), files: [INDEX_FILES.bm25, INDEX_FILES.chunksMeta, INDEX_FILES.vectorsBin, INDEX_FILES.vectorsIds, INDEX_FILES.manifest] };
fs.writeFileSync(path.join(output, INDEX_FILES.manifest), JSON.stringify(manifest, null, 2));
const report = { schemaVersion: 1, output, chunks: chunks.length, vectors: vectorIds.length, missingVectors, contentHash: manifest.contentHash, paidCalls: 0 };
fs.writeFileSync(path.join(output, "offline-build-report.json"), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ output, chunks: report.chunks, vectors: report.vectors, missingVectors, paidCalls: 0 }) + "\n");
