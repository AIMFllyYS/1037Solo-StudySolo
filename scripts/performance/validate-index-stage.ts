import * as fs from "node:fs";
import * as path from "node:path";
import { getIndexHealth, verifyIndexContentFreshness } from "../../lib/ai/search/indexHealth";
import { searchLocalIndex, shutdownSearchWorker } from "../../lib/ai/search/searchService";

const arg = process.argv.find((value) => value.startsWith("--dir="));
if (!arg) throw new Error("Usage: --dir=<offline index stage>");
const root = process.cwd();
const dir = path.resolve(arg.slice(6));
if (!dir.startsWith(path.resolve(root, "artifacts/performance") + path.sep) || !fs.existsSync(path.join(dir, "manifest.json"))) throw new Error("invalid_index_stage");
async function main() {
  process.env.SEARCH_INDEX_DIR = dir;
  const health = getIndexHealth(true);
  if (!health.ok || verifyIndexContentFreshness() !== true) throw new Error(`index_stage_not_fresh:${health.reason}`);
  try {
    const subjectId = health.manifest?.subjectScope?.[0] ?? "histology";
    const query = subjectId === "probability" ? "贝叶斯公式" : "被覆上皮";
    const keyword = await searchLocalIndex({ mode: "keyword", query, topK: 8, filter: { subjectId } });
    const vector = await searchLocalIndex({ mode: "vector", query: "", queryVector: Array(health.manifest!.dimension).fill(0.01), topK: 8, filter: { subjectId } });
    if (!keyword.length || !vector.length) throw new Error("index_stage_search_empty");
    process.stdout.write(JSON.stringify({ dir, chunks: health.manifest?.chunkCount, vectors: health.manifest?.vectorCount, keywordHits: keyword.length, vectorHits: vector.length }) + "\n");
  } finally { await shutdownSearchWorker(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
