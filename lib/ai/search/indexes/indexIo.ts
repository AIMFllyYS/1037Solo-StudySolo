// 检索索引文件 I/O：只认本地 content/.index/（自托管 / 桌面打包产物）。
// 不再从 COS /tmp 回退——陈旧远端索引会把学年过滤后的结果静默打空。
import * as fs from "node:fs";
import * as path from "node:path";

export const INDEX_FILES = {
  bm25: "bm25.json",
  chunksMeta: "chunks-meta.json",
  vectorsBin: "vectors.bin",
  vectorsIds: "vectors.ids.json",
  vectorsJson: "vectors.json",
  manifest: "manifest.json",
} as const;

export interface SearchIndexManifest {
  version: 2;
  builtAt: string;
  embeddingModel: string;
  dimension: number;
  chunkCount: number;
  vectorCount: number;
  contentHash: string;
  files: string[];
  /** Present only in a desktop offline subject subset. */
  subjectScope?: string[];
}

export function getLocalIndexDir(): string {
  return process.env.SEARCH_INDEX_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "content", ".index");
}

export function localIndexFile(name: string): string {
  return path.join(/* turbopackIgnore: true */ getLocalIndexDir(), name);
}

export function readFileIfExists(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ filePath);
  } catch {
    return null;
  }
}


export function readLocalIndexFile(filename: string): Buffer | null {
  return readFileIfExists(localIndexFile(filename));
}

export interface SearchChunkMeta{id:string;path:string;subjectId:string;subjectName:string;categoryId:string;itemId:string;title:string;chunkIndex:number;text:string}
export interface SharedChunkMetadata{rows:SearchChunkMeta[];byId:Map<string,SearchChunkMeta>}
let metaCache:{key:string;value:SharedChunkMetadata}|null=null
export const chunkMetadataIo={stat:(file:string)=>fs.statSync(file),read:(file:string)=>readFileIfExists(file)}
/** One parsed chunks-meta representation per index revision, shared by BM25 and vectors. */
export function getChunkMetadataIndex():SharedChunkMetadata{
  const file=localIndexFile(INDEX_FILES.chunksMeta)
  let signature='missing'
  try{const stat=chunkMetadataIo.stat(file);signature=`${stat.size}:${stat.mtimeMs}`}catch{}
  const key=`${file}:${signature}`
  if(metaCache?.key===key)return metaCache.value
  let rows:SearchChunkMeta[]=[]
  const raw=chunkMetadataIo.read(file)
  if(raw)try{
    const parsed=JSON.parse(raw.toString('utf8')) as {chunks?:unknown}|unknown[]
    const candidates=Array.isArray(parsed)?parsed:Array.isArray(parsed.chunks)?parsed.chunks:[]
    rows=candidates.filter((row):row is SearchChunkMeta=>typeof row==='object'&&row!==null&&typeof (row as {id?:unknown}).id==='string')
  }catch{rows=[]}
  const value={rows,byId:new Map(rows.map(row=>[row.id,row]))}
  metaCache={key,value}
  return value
}
export function resetChunkMetadataForTests(){metaCache=null}

export function parseManifest(raw: Buffer | null): SearchIndexManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as SearchIndexManifest;
    if (parsed?.version !== 2) return null;
    if (parsed.subjectScope && (!Array.isArray(parsed.subjectScope) || parsed.subjectScope.some((id) => typeof id !== "string"))) return null;
    return parsed;
  } catch {
    return null;
  }
}
