// BM25 检索：惰性加载 content/.index/bm25.json（v3 紧凑格式或旧版字符串 posting）。
import { parseBm25Index, tokenize, type RuntimeBm25Index } from "@/lib/ai/indexing/bm25Index";
import type { ScoredChunk } from "./vectorStoreTypes";
import type { SearchFilter } from "../searchScope";
import { chunkInScope } from "../searchScope";
import { INDEX_FILES, readLocalIndexFile,getChunkMetadataIndex,type SearchChunkMeta } from "./indexIo";
import { searchLog, searchLogOnce } from "../searchLog";
import {createIndexLoader} from './indexLoader';
import {scoreBm25Core} from '../worker/core.mts';

export { tokenize };

interface LoadedBm25{index:RuntimeBm25Index;metaById:Map<string,SearchChunkMeta>}

const MAX_JSON_CHARS = 400 * 1024 * 1024;

function loadIndexOnce(): LoadedBm25 | null {
  const bm25Buf = readLocalIndexFile(INDEX_FILES.bm25);
  if (!bm25Buf) {
    searchLogOnce("error", "search.index.missing", "本地无 bm25.json", { file: INDEX_FILES.bm25 });
    return null;
  }
  if (bm25Buf.length > MAX_JSON_CHARS) {
    searchLog.warn("search.index.parse_error", {
      file: INDEX_FILES.bm25,
      bytes: bm25Buf.length,
      message: "bm25.json 超过 400MB，解析可能耗尽内存",
    });
  }

  const started = Date.now();
  try {
    const parsed = JSON.parse(bm25Buf.toString("utf8"));
    const index=parseBm25Index(parsed);
    if(!index){searchLog.error("search.index.parse_error",{file:INDEX_FILES.bm25,message:"无法识别 BM25 索引格式"});return null}
    const metaById=getChunkMetadataIndex().byId
    searchLogOnce("info", "search.index.loaded", `BM25 已加载：${index.docCount} docs`, {
      file: INDEX_FILES.bm25,bytes:bm25Buf.length,count:index.docCount,ms:Date.now()-started,
    });
    return {index,metaById}
  } catch (err) {
    searchLog.error("search.index.parse_error", { file: INDEX_FILES.bm25, message: String((err as Error).message) });
    return null;
  }
}
const indexLoader=createIndexLoader(loadIndexOnce)
export function retryBM25IndexLoad(){indexLoader.reset()}

export async function bm25Search(
  query: string,
  topK: number,
  filter?: SearchFilter,
): Promise<ScoredChunk[]> {
  const loaded=await indexLoader.load();
  if (!loaded) return [];
  const {index,metaById}=loaded
  return scoreBm25Core(index,metaById,query,topK,subjectId=>chunkInScope(subjectId,filter));
}

export async function isBM25IndexLoaded(): Promise<boolean> {
  return (await indexLoader.load()) !== null;
}

export async function getBm25BuiltAt(): Promise<string> {
  return (await indexLoader.load())?.index.builtAt??'';
}
