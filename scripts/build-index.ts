// 离线索引构建脚本：生成 bm25.json + chunks-meta.json + vectors.bin 到 content/.index/
// 用法:
//   npx tsx scripts/build-index.ts              # BM25 + 增量补齐向量
//   npx tsx scripts/build-index.ts --bm25-only  # 只重建关键词索引
//   npx tsx scripts/build-index.ts --vectors    # 只补齐缺失向量
//   npx tsx scripts/build-index.ts --publish    # 构建后显式上传到 COS 制品库
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildCompactBm25Index } from '../lib/ai/indexing/bm25Index';
import { contentHashOf } from '../lib/ai/indexing/contentHash';

// 手动加载 .env.local（Next.js 不在 CLI 脚本中自动加载）
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if((val.startsWith("'")&&val.endsWith("'"))||(val.startsWith('"')&&val.endsWith('"')))val=val.slice(1,-1);
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch { /* file not found is ok */ }
}
loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

// ── 索引数据结构 ──

interface ChunkData {
  id: string;
  path: string;
  subjectId: string;
  subjectName: string;
  categoryId: string;
  itemId: string;
  title: string;
  chunkIndex: number;
  text: string;
  contextPrefix: string;
}

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

interface EmbedCache {
  model: string;
  dimension: number;
  hashes: Record<string, string>;
  vectors: Map<string, number[]>;
}

function readJsonIfExists<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function loadEmbedCache(indexDir: string): EmbedCache {
  const cache: EmbedCache = {
    model: process.env.AI_EMBEDDING_MODEL || 'BAAI/bge-m3',
    dimension: 0,
    hashes: {},
    vectors: new Map(),
  };

  const progressMeta = readJsonIfExists<{
    model?: string;
    dimension?: number;
    hashes?: Record<string, string>;
  }>(path.join(indexDir, 'embed-cache.meta.json'));
  const progressIds = readJsonIfExists<string[]>(path.join(indexDir, 'embed-cache.ids.json'));
  const progressBin = (() => {
    try {
      return fs.readFileSync(path.join(indexDir, 'embed-cache.bin'));
    } catch {
      return null;
    }
  })();

  if (progressMeta?.hashes) cache.hashes = progressMeta.hashes;
  if (progressMeta?.model) cache.model = progressMeta.model;

  const ingest = (ids: string[], buf: Buffer, dimensionHint?: number) => {
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    const floats = new Float32Array(copy.buffer);
    const dim = dimensionHint || (ids.length > 0 ? Math.floor(floats.length / ids.length) : 0);
    if (!dim || dim * ids.length !== floats.length) return;
    cache.dimension = dim;
    for (let i = 0; i < ids.length; i++) {
      cache.vectors.set(ids[i], Array.from(floats.subarray(i * dim, (i + 1) * dim)));
    }
  };

  if (progressIds && progressBin) ingest(progressIds, progressBin, progressMeta?.dimension);

  const finalIds = readJsonIfExists<string[]>(path.join(indexDir, 'vectors.ids.json'));
  const finalBin = (() => {
    try {
      return fs.readFileSync(path.join(indexDir, 'vectors.bin'));
    } catch {
      return null;
    }
  })();
  if (finalIds && finalBin) ingest(finalIds, finalBin);

  return cache;
}

function writeFloat32Bin(filePath: string, rows: number[][]): void {
  if (!rows.length) {
    fs.writeFileSync(filePath, Buffer.alloc(0));
    return;
  }
  const dim = rows[0].length;
  const buf = Buffer.allocUnsafe(rows.length * dim * 4);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let d = 0; d < dim; d++) {
      buf.writeFloatLE(row[d] ?? 0, (i * dim + d) * 4);
    }
  }
  fs.writeFileSync(filePath, buf);
}

function persistCache(indexDir: string, cache: EmbedCache, orderedIds: string[]): void {
  const ids = orderedIds.filter((id) => cache.vectors.has(id));
  const rows = ids.map((id) => cache.vectors.get(id)!);
  writeFloat32Bin(path.join(indexDir, 'embed-cache.bin'), rows);
  fs.writeFileSync(path.join(indexDir, 'embed-cache.ids.json'), JSON.stringify(ids));
  fs.writeFileSync(
    path.join(indexDir, 'embed-cache.meta.json'),
    JSON.stringify({ model: cache.model, dimension: cache.dimension, hashes: cache.hashes }),
  );
}

async function embedBatchWithRetry(
  embedding: { embedBatch: (texts: string[]) => Promise<number[][]> },
  texts: string[],
  retries = 6,
): Promise<number[][]> {
  let delay = 2000;
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await embedding.embedBatch(texts);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const rateLimited = msg.includes('429') || /rate limit|TPM limit/i.test(msg);
      if (!rateLimited || attempt === retries - 1) throw err;
      console.warn(`\n   ⏳ rate limited, retry ${attempt + 1}/${retries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 60000);
    }
  }
  throw lastErr;
}

function finalizeVectors(indexDir: string, chunks: ChunkData[], cache: EmbedCache, contentHash: string): number {
  const ids = chunks.filter((c) => cache.vectors.has(c.id)).map((c) => c.id);
  const rows = ids.map((id) => cache.vectors.get(id)!);
  const dimension = cache.dimension || rows[0]?.length || 0;
  writeFloat32Bin(path.join(indexDir, 'vectors.bin'), rows);
  fs.writeFileSync(path.join(indexDir, 'vectors.ids.json'), JSON.stringify(ids));
  const manifest = {
    version: 2 as const,
    builtAt: new Date().toISOString(),
    embeddingModel: cache.model,
    dimension,
    chunkCount: chunks.length,
    vectorCount: ids.length,
    contentHash,
    files: ['bm25.json', 'chunks-meta.json', 'vectors.bin', 'vectors.ids.json', 'manifest.json'],
  };
  fs.writeFileSync(path.join(indexDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return ids.length;
}

// ── 主流程 ──

async function main() {
  // 动态导入（确保 env 已加载）
  const { generateChunks } = await import('../lib/ai/indexing/chunker');
  const { SiliconFlowEmbedding } = await import('../lib/ai/embedding');

  const requestedDir=process.argv.find(arg=>arg.startsWith('--index-dir='))?.slice('--index-dir='.length);
  const indexDir=requestedDir?path.resolve(requestedDir):path.join(process.cwd(),'content','.index');
  if(requestedDir&&!indexDir.startsWith(path.resolve('artifacts/performance')+path.sep))throw new Error('index stage must stay under artifacts/performance');
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  console.log('🔍 Generating chunks from content tree...');
  const chunks = generateChunks();
  console.log(`   → ${chunks.length} chunks generated`);

  if (!chunks.length) {
    console.error('❌ No chunks generated. Check content files.');
    process.exit(1);
  }

  // ── BM25 索引（不依赖 embedding，必须先落盘）──
  console.log('📑 Building BM25 inverted index (title-boosted compact v3)...');
  const bm25Index = buildCompactBm25Index(chunks);
  const bm25Path = path.join(indexDir, 'bm25.json');
  fs.writeFileSync(bm25Path, JSON.stringify(bm25Index));
  console.log(`   → BM25 index written to ${bm25Path} (${(fs.statSync(bm25Path).size / 1024 / 1024).toFixed(2)} MB)`);

  const chunksMeta = {
    builtAt: new Date().toISOString(),
    chunks: chunks.map((c) => ({
      id: c.id,
      path: c.path,
      subjectId: c.subjectId,
      subjectName: c.subjectName,
      categoryId: c.categoryId,
      itemId: c.itemId,
      title: c.title,
      chunkIndex: c.chunkIndex,
      text: c.text,
    })),
  };
  const chunksMetaPath = path.join(indexDir, 'chunks-meta.json');
  fs.writeFileSync(chunksMetaPath, JSON.stringify(chunksMeta));
  console.log(`   → Chunks meta written to ${chunksMetaPath}`);

  const { academicYearOfSubject } = await import('../lib/constants/academic-year');
  const sophomoreCount = chunks.filter((c) => academicYearOfSubject(c.subjectId) === 'sophomore-1').length;
  console.log(`   → Sophomore textbook/detail chunks: ${sophomoreCount}`);

  const contentHash = contentHashOf(chunks);
  const skipVectors = process.argv.includes('--bm25-only');
  // Legacy files are ignored by the v2 manifest; keep them for recovery.

  if (skipVectors) {
    const cache = loadEmbedCache(indexDir);
    const kept = finalizeVectors(indexDir, chunks, cache, contentHash);
    console.log(`\n✅ BM25-only index build complete! 保留已有向量 ${kept}/${chunks.length}`);
    console.log(`   Chunks: ${chunks.length}`);
    console.log(`   BM25 terms: ${Object.keys(bm25Index.invertedIndex).length} (v${bm25Index.version})`);
    return;
  }

  // ── 向量索引（增量：只 embed 缺失或正文已变的 chunk；大二优先）──
  console.log('🧠 Generating embeddings via SiliconFlow API...');
  console.log(`   Model: ${process.env.AI_EMBEDDING_MODEL || 'BAAI/bge-m3'}`);
  console.log(`   API: ${process.env.AI_BASE_URL || '(not set)'}`);
  const embedding = new SiliconFlowEmbedding();
  const cache = loadEmbedCache(indexDir);
  cache.model = process.env.AI_EMBEDDING_MODEL || cache.model || 'BAAI/bge-m3';

  const sophomoreFirst = [
    ...chunks.filter((c) => academicYearOfSubject(c.subjectId) === 'sophomore-1'),
    ...chunks.filter((c) => academicYearOfSubject(c.subjectId) !== 'sophomore-1'),
  ];
  // 无 hash 的旧向量视为仍有效，避免 embed-cache.meta 被清掉后整库重嵌。
  let reusedWithoutHash = 0;
  const missing = sophomoreFirst.filter((c) => {
    const hash = hashText(c.contextPrefix + '\n' + c.text);
    const cached = cache.vectors.get(c.id);
    if (!cached) return true;
    const prev = cache.hashes[c.id];
    if (!prev) {
      cache.hashes[c.id] = hash;
      reusedWithoutHash += 1;
      return false;
    }
    return prev !== hash;
  });
  console.log(
    `   → Cached vectors: ${cache.vectors.size}; reused without hash: ${reusedWithoutHash}; to embed: ${missing.length}`,
  );
  const accountId=process.argv.find(arg=>arg.startsWith('--account-id='))?.slice('--account-id='.length);
  if(missing.length&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(accountId??''))throw new Error('embedding requires --account-id=<dedicated test account UUID>');
  const {runPaidContext}=await import('../lib/billing/settlement/paidContext');
  const {runWithLedgerContext}=await import('../lib/billing/ledger/usageLedger');

  const batchSize = 32;
  let embedded = 0;
  let failedBatches = 0;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const texts = batch.map((c) => c.contextPrefix + '\n' + c.text);
    try {
      const vectors = await runPaidContext({userId:accountId!,requestId:randomUUID(),route:'/ops/build-index',sequence:0,reservedCny:0,budgetCny:5},
        ()=>runWithLedgerContext({userId:accountId,route:'/ops/build-index',mainUsedPlatformCredentials:true},
          ()=>embedBatchWithRetry(embedding,texts)));
      if (!cache.dimension && vectors[0]?.length) cache.dimension = vectors[0].length;
      for (let j = 0; j < batch.length; j++) {
        if (!vectors[j]?.length) continue;
        cache.vectors.set(batch[j].id, vectors[j]);
        cache.hashes[batch[j].id] = hashText(texts[j]);
      }
      embedded += batch.length;
      failedBatches = 0;
      const pct = missing.length ? ((embedded / missing.length) * 100).toFixed(1) : '100.0';
      process.stdout.write(`\r   → Progress: ${embedded}/${missing.length} (${pct}%)`);
      if (embedded % (batchSize * 8) === 0 || i + batchSize >= missing.length) {
        persistCache(indexDir, cache, sophomoreFirst.map((c) => c.id));
        console.log(`\n   → checkpoint ${embedded}/${missing.length} vectors=${cache.vectors.size}`);
      }
    } catch (err) {
      failedBatches += 1;
      console.error(`\n⚠ Embedding API error at batch starting index ${i}:`, err);
      persistCache(indexDir, cache, sophomoreFirst.map((c) => c.id));
      if (failedBatches >= 5) {
        console.error('   → 连续失败过多，停止请求；已写入的向量会保留，下次可续跑。');
        break;
      }
    }
    if (i + batchSize < missing.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  console.log('');

  const vectorCount = finalizeVectors(indexDir, chunks, cache, contentHash);
  const vectorBinPath = path.join(indexDir, 'vectors.bin');
  const vectorSize = fs.existsSync(vectorBinPath)
    ? (fs.statSync(vectorBinPath).size / 1024 / 1024).toFixed(2)
    : '0';
  console.log(`   → Vector index written to ${vectorBinPath} (${vectorSize} MB, ${vectorCount} vectors)`);

  console.log('\n✅ Index build complete!');
  console.log(`   Chunks: ${chunks.length}`);
  console.log(`   Vectors: ${vectorCount}`);
  console.log(`   Dimension: ${cache.dimension || 'n/a'}`);
  console.log(`   BM25 terms: ${Object.keys(bm25Index.invertedIndex).length} (v${bm25Index.version})`);
  if (vectorCount < chunks.length) {
    console.log(`⚠ PARTIAL vectors: ${vectorCount}/${chunks.length} — rerun pnpm build-index to resume`);
  }

  const wantPublish = process.argv.includes('--publish');
  if (!wantPublish) {
    console.log('\n   (未加 --publish，跳过 COS 制品上传。部署请把 content/.index/ 随产物同步到服务器。)');
    return;
  }

  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  if (!secretId || !secretKey || !bucket || !region) {
    console.warn('\n⚠ --publish 需要 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION，已跳过上传。');
    return;
  }

  console.log('\n☁️  Uploading index files to COS artifact bucket...');
  try {
    const COS = (await import('cos-nodejs-sdk-v5')).default;
    const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

    for (const filename of ['bm25.json', 'chunks-meta.json', 'vectors.bin', 'vectors.ids.json', 'manifest.json']) {
      const localPath = path.join(indexDir, filename);
      if (!fs.existsSync(localPath)) {
        console.log(`   · skip ${filename} (missing)`);
        continue;
      }
      const key = `index/${filename}`;
      const size = (fs.statSync(localPath).size / 1024 / 1024).toFixed(2);
      await new Promise<void>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: fs.createReadStream(localPath),
            ContentType: filename.endsWith('.bin') ? 'application/octet-stream' : 'application/json',
          },
          (err: unknown, _data: unknown) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });
      console.log(`   ✓ index/${filename} (${size} MB)`);
    }
    console.log(`\n   artifact: https://${bucket}.cos.${region}.myqcloud.com/index/`);
  } catch (e) {
    console.error('   ✗ COS upload failed:', e);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
