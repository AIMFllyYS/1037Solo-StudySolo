// 向量存储：只加载本地 content/.index/vectors.bin（与 chunks-meta 按 id 对齐）。
import type { ScoredChunk } from "./vectorStoreTypes";
import type { SearchFilter } from "./searchScope";
import { chunkInScope } from "./searchScope";
import {
  INDEX_FILES,
  parseManifest,
  readLocalIndexFile,
  getChunkMetadataIndex,type SearchChunkMeta,
} from "./indexIo";
import { searchLogOnce } from "./searchLog";
import {createIndexLoader} from './indexLoader';
import {scoreVectorCore} from './worker/core.mjs';

export type { ScoredChunk } from "./vectorStoreTypes";

type ChunkRow=SearchChunkMeta

interface VectorIndex {
  model: string;
  dimension: number;
  ids: string[];
  metaById: Map<string, ChunkRow>;
  matrix: Float32Array;
  /** Keeps a shared Buffer alive when matrix is a zero-copy aligned view. */
  sourceBuffer?:Buffer;
  /** 每行向量的预计算范数（√Σy²），避免检索时对 4 万行逐行重算。 */
  norms: Float32Array;
  /** 与 ids 平行的 meta 数组，热循环免 Map 查找。 */
  metaList: (ChunkRow | undefined)[];
}

/** 索引装载后统一的派生量：行范数 + 平行 meta 数组。 */
function finalizeIndex(index: Omit<VectorIndex, "norms" | "metaList">): VectorIndex {
  const { ids, matrix, dimension, metaById } = index;
  const norms = new Float32Array(ids.length);
  const metaList = new Array<ChunkRow | undefined>(ids.length);
  for (let i = 0; i < ids.length; i++) {
    let sum = 0;
    const off = i * dimension;
    for (let j = 0; j < dimension; j++) {
      const y = matrix[off + j];
      sum += y * y;
    }
    norms[i] = Math.sqrt(sum);
    metaList[i] = metaById.get(ids[i]);
  }
  return { ...index, norms, metaList };
}


export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function cosineSimilarityRow(
  query: ArrayLike<number>,
  matrix: Float32Array,
  rowOffset: number,
  dim: number,
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < dim; i++) {
    const x = query[i] ?? 0;
    const y = matrix[rowOffset + i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function float32ViewFromBuffer(buf:Buffer):{matrix:Float32Array;borrowed:boolean}{
  if(buf.byteLength%4!==0)throw new Error('vector byte length must be divisible by four')
  const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1
  if(littleEndian&&buf.byteOffset%4===0)return {matrix:new Float32Array(buf.buffer,buf.byteOffset,buf.byteLength/4),borrowed:true}
  const copy=new Uint8Array(buf.byteLength);copy.set(buf)
  return {matrix:new Float32Array(copy.buffer),borrowed:false}
}

function loadBinaryIndex(bin: Buffer, idsRaw: Buffer, metaById: Map<string, ChunkRow>): VectorIndex | null {
  let ids: string[];
  try {
    ids = JSON.parse(idsRaw.toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(ids) || ids.length === 0) return null;
  let view:{matrix:Float32Array;borrowed:boolean}
  try{view=float32ViewFromBuffer(bin)}catch{return null}
  const matrix=view.matrix;
  const dimension = Math.floor(matrix.length / ids.length);
  if (dimension < 8 || dimension * ids.length !== matrix.length) {
    searchLogOnce("error", "search.index.missing", `vectors.bin 长度与 ids 不对齐（ids=${ids.length}, floats=${matrix.length}），跳过向量索引`);
    return null;
  }
  const manifest = parseManifest(readLocalIndexFile(INDEX_FILES.manifest));
  return finalizeIndex({
    model: manifest?.embeddingModel || process.env.AI_EMBEDDING_MODEL || "BAAI/bge-m3",
    dimension,
    ids,
    metaById,
    matrix,
    ...(view.borrowed?{sourceBuffer:bin}:{}),
  });
}

function loadLegacyJsonIndex(raw: Buffer, localMeta: Map<string, ChunkRow>): VectorIndex | null {
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as {
      model?: string;
      dimension?: number;
      chunks?: Array<ChunkRow & { vector?: number[] }>;
    };
    const chunks = parsed.chunks ?? [];
    if (!chunks.length || !chunks[0]?.vector?.length) return null;

    if (localMeta.size > 0) {
      const overlap = chunks.filter((c) => localMeta.has(c.id)).length;
      if (overlap < chunks.length * 0.8) {
        searchLogOnce(
          "warn",
          "search.index.loaded",
          `跳过 vectors.json：与本地 chunks-meta 重叠过低（${overlap}/${chunks.length}），避免混入过期向量`,
        );
        return null;
      }
    }

    const dimension = parsed.dimension || chunks[0].vector.length;
    const ids: string[] = [];
    const matrix = new Float32Array(chunks.length * dimension);
    const metaById = new Map<string, ChunkRow>(localMeta);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.vector || chunk.vector.length !== dimension) continue;
      ids.push(chunk.id);
      matrix.set(chunk.vector, ids.length * dimension - dimension);
      if (!metaById.has(chunk.id)) {
        metaById.set(chunk.id, {
          id: chunk.id,
          path: chunk.path,
          subjectId: chunk.subjectId,
          subjectName: chunk.subjectName,
          categoryId: chunk.categoryId,
          itemId: chunk.itemId,
          title: chunk.title,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
        });
      }
    }
    if (!ids.length) return null;
    return finalizeIndex({
      model: parsed.model || process.env.AI_EMBEDDING_MODEL || "BAAI/bge-m3",
      dimension,
      ids,
      metaById,
      matrix: ids.length === chunks.length ? matrix : matrix.subarray(0, ids.length * dimension),
    });
  } catch {
    return null;
  }
}

function loadIndexOnce(): VectorIndex | null {
  const metaById = getChunkMetadataIndex().byId;

  const localBin = readLocalIndexFile(INDEX_FILES.vectorsBin);
  const localIds = readLocalIndexFile(INDEX_FILES.vectorsIds);
  if (localBin && localIds) {
    const binary=loadBinaryIndex(localBin, localIds, metaById);
    if (binary) {
      searchLogOnce(
        "info",
        "search.index.loaded",
        `向量索引 vectors.bin 已加载：${binary.ids.length} 条 × ${binary.dimension} 维`,
        { file: INDEX_FILES.vectorsBin, count: binary.ids.length, dimension: binary.dimension },
      );
      return binary;
    }
  }

  const legacy = readLocalIndexFile(INDEX_FILES.vectorsJson);
  if (legacy) {
    const parsed=loadLegacyJsonIndex(legacy, metaById);
    if (parsed) {
      searchLogOnce("info", "search.index.loaded", `向量索引 vectors.json（旧格式）已加载：${parsed.ids.length} 条`);
      return parsed;
    }
  }

  searchLogOnce("error", "search.index.missing", "本地无可用向量索引（缺 vectors.bin）。请运行 pnpm build-index。");
  return null;
}
const indexLoader=createIndexLoader(loadIndexOnce)
export function retryVectorIndexLoad(){indexLoader.reset()}

export async function vectorSearch(
  queryEmbedding: number[],
  topK: number,
  filter?: SearchFilter,
): Promise<ScoredChunk[]> {
  const index = await indexLoader.load();
  if (!index || !index.ids.length) return [];
  if (queryEmbedding.length !== index.dimension) {
    searchLogOnce(
      "error",
      "search.embed.error",
      `查询向量维度 ${queryEmbedding.length} 与索引 ${index.dimension} 不一致，跳过向量检索`,
    );
    return [];
  }

  return scoreVectorCore(index,queryEmbedding,topK,subjectId=>chunkInScope(subjectId,filter));
}

export async function isVectorIndexLoaded(): Promise<boolean> {
  return (await indexLoader.load()) !== null;
}

export async function getVectorIndexModel(): Promise<string | null> {
  const index = await indexLoader.load();
  return index?.model ?? null;
}
