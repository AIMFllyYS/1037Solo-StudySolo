/** Read-only vector cache coverage; no embedding endpoint is called. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { generateChunks } from "../../lib/ai/indexing/chunker";

const dir = path.resolve("content/.index");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "embed-cache.meta.json"), "utf8")) as { hashes?: Record<string, string>; dimension?: number; model?: string };
const ids = JSON.parse(fs.readFileSync(path.join(dir, "embed-cache.ids.json"), "utf8")) as string[];
const available = new Set(ids);
const chunks = generateChunks();
const missing: string[] = [], changed: string[] = [], noHash: string[] = [];
for (const chunk of chunks) {
  if (!available.has(chunk.id)) { missing.push(chunk.id); continue; }
  const hash = createHash("sha1").update(chunk.contextPrefix + "\n" + chunk.text).digest("hex").slice(0, 16);
  const prior = meta.hashes?.[chunk.id];
  if (!prior) noHash.push(chunk.id);
  else if (prior !== hash) changed.push(chunk.id);
}
const report = { schemaVersion: 1, chunks: chunks.length, cachedIds: ids.length, missing: missing.length, changed: changed.length, unverifiedHash: noHash.length, dimension: meta.dimension ?? null, model: meta.model ?? null, samples: { missing: missing.slice(0, 10), changed: changed.slice(0, 10) } };
const out = path.resolve("artifacts/performance/index-cache-coverage.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ output: out, chunks: report.chunks, cachedIds: report.cachedIds, missing: report.missing, changed: report.changed, unverifiedHash: report.unverifiedHash }) + "\n");
