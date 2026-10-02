import { getIndexHealth } from "@/lib/ai/search/indexHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = getIndexHealth();
  const manifest = health.manifest;
  return Response.json({
    ok: health.ok,
    reason: health.ok ? undefined : health.reason,
    builtAt: manifest?.builtAt ?? null,
    chunkCount: manifest?.chunkCount ?? null,
    vectorCount: manifest?.vectorCount ?? null,
    vectorCoverage: manifest?.chunkCount ? manifest.vectorCount / manifest.chunkCount : null,
    partialVectorIndex: manifest ? manifest.vectorCount < manifest.chunkCount : null,
    model: manifest?.embeddingModel ?? null,
    dimension: manifest?.dimension ?? null,
    contentHash: manifest?.contentHash ?? null,
    contentHashMatch: health.contentHashMatch,
  });
}
