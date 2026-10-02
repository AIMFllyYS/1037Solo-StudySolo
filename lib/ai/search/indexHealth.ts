import * as fs from "node:fs";
import { generateChunks } from "@/lib/ai/indexing/chunker";
import { contentHashOf } from "@/lib/ai/indexing/contentHash";
import {
  INDEX_FILES,
  getLocalIndexDir,
  localIndexFile,
  parseManifest,
  readLocalIndexFile,
  type SearchIndexManifest,
} from "./indexIo";
import { searchLog, searchLogOnce } from "./searchLog";

export interface IndexHealth {
  ok: boolean;
  reason: string;
  manifest: SearchIndexManifest | null;
  contentHashMatch: boolean | null;
  embeddingReachable: boolean | null;
}

let cached: IndexHealth | null = null;
let cachedSignature = "";

const REQUIRED_FILES = [
  INDEX_FILES.manifest,
  INDEX_FILES.bm25,
  INDEX_FILES.chunksMeta,
  INDEX_FILES.vectorsBin,
  INDEX_FILES.vectorsIds,
] as const;

export function resetIndexHealthCache(): void {
  cached = null;
  cachedSignature = "";
}

function missingFiles(): string[] {
  return REQUIRED_FILES.filter((name) => !fs.existsSync(localIndexFile(name)));
}

function indexSignature(): string {
  return [getLocalIndexDir(), process.env.AI_EMBEDDING_MODEL ?? "", ...REQUIRED_FILES.map((name) => {
    try { const stat = fs.statSync(localIndexFile(name)); return `${name}:${stat.size}:${stat.mtimeMs}`; }
    catch { return `${name}:missing`; }
  })].join("|");
}

function inspectVectors(manifest: SearchIndexManifest): string | null {
  try {
    const bytes = fs.statSync(localIndexFile(INDEX_FILES.vectorsBin)).size;
    const expected = manifest.vectorCount * manifest.dimension * 4;
    if (bytes !== expected) {
      return `vectors.bin 字节数 ${bytes} ≠ vectorCount×dimension×4 (${expected})`;
    }
  } catch (err) {
    return `无法读取 vectors.bin：${(err as Error).message}`;
  }
  const envModel = process.env.AI_EMBEDDING_MODEL;
  if (envModel && manifest.embeddingModel && envModel !== manifest.embeddingModel) {
    return `嵌入模型不一致：索引 ${manifest.embeddingModel} / 环境 ${envModel}`;
  }
  return null;
}

/** Explicit build/audit gate. Never call from request readiness. */
export function verifyIndexContentFreshness(): boolean | null {
  try {
    const manifest = parseManifest(readLocalIndexFile(INDEX_FILES.manifest));
    if (!manifest) return null;
    const selected = manifest.subjectScope?.length ? new Set(manifest.subjectScope) : null;
    const hash = contentHashOf(selected ? generateChunks().filter((chunk) => selected.has(chunk.subjectId)) : generateChunks());
    return hash === manifest.contentHash;
  } catch (err) {
    searchLog.warn("search.index.hash_error", { message: String((err as Error).message) });
    return null;
  }
}

export function getIndexHealth(force = false): IndexHealth {
  const signature = indexSignature();
  if (cached && !force && signature === cachedSignature) return cached;
  cachedSignature = signature;

  const dir = getLocalIndexDir();
  const missing = missingFiles();
  if (missing.length) {
    const reason = `缺少 ${missing.join(", ")}（目录 ${dir}）`;
    searchLogOnce("error", "search.index.missing", reason, { dir, missing });
    cached = { ok: false, reason, manifest: null, contentHashMatch: null, embeddingReachable: null };
    return cached;
  }

  const manifest = parseManifest(readLocalIndexFile(INDEX_FILES.manifest));
  if (!manifest) {
    const reason = "manifest.json 无效或 version ≠ 2";
    searchLogOnce("error", "search.index.missing", reason);
    cached = { ok: false, reason, manifest: null, contentHashMatch: null, embeddingReachable: null };
    return cached;
  }

  const vectorErr = inspectVectors(manifest);
  if (vectorErr) {
    searchLogOnce("error", "search.index.missing", vectorErr);
    cached = { ok: false, reason: vectorErr, manifest, contentHashMatch: null, embeddingReachable: null };
    return cached;
  }

  if (!/^[a-f0-9]{64}$/i.test(manifest.contentHash ?? "")) {
    const reason = "manifest.json 缺少有效内容摘要";
    cached = { ok: false, reason, manifest, contentHashMatch: null, embeddingReachable: null };
    return cached;
  }
  // Request readiness deliberately does not read or chunk article bodies.
  // The build-index pipeline computes contentHash; verifyIndexContentFreshness is an explicit deep gate.
  const contentHashMatch: null = null;
  if (manifest.vectorCount < manifest.chunkCount) {
    searchLogOnce("warn", "search.index.partial_vectors", `${manifest.chunkCount - manifest.vectorCount} chunks 暂无向量；关键词检索仍覆盖全文`, {
      chunkCount: manifest.chunkCount,
      vectorCount: manifest.vectorCount,
    });
  }

  searchLogOnce("info", "search.index.loaded", `检索索引就绪：${manifest.chunkCount} chunks / ${manifest.vectorCount} vectors`, {
    builtAt: manifest.builtAt,
    model: manifest.embeddingModel,
    dimension: manifest.dimension,
    contentHashMatch,
  });

  cached = { ok: true, reason: "", manifest, contentHashMatch, embeddingReachable: null };
  return cached;
}
