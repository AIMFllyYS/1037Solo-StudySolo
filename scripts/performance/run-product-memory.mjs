/** Synthetic S6 product-body residency probe; fake IDB retains disk stand-in bytes. */
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const storage = new Map();
globalThis.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
globalThis.document = { documentElement: { getAttribute: () => null }, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key), key: (index) => [...storage.keys()][index] ?? null, get length() { return storage.size; }, clear: () => storage.clear() };
const { activateStorageOwner, hydrateOwnerStores } = await import('../../lib/storage/ownerScope.ts');
activateStorageOwner('00000000-0000-4000-8000-000000000006');
const [{ useArtifacts }, { useDocuments }, { useImageGen }, { getResourceSnapshot }] = await Promise.all([
  import('../../lib/stores/artifacts.ts'), import('../../lib/stores/documents.ts'), import('../../lib/stores/imageGen.ts'), import('../../lib/performance/resourceMetrics.ts'),
]);
await hydrateOwnerStores();
const artifactBody = '<html><body>' + 'A'.repeat(100_000) + '</body></html>';
const documentBody = '医学段落'.repeat(20_000);
const imageBody = 'a'.repeat(200_000);
const fixtureHash = createHash('sha256').update(`${artifactBody.length}:${documentBody.length}:${imageBody.length}:50:20:10`).digest('hex');
for (let index = 0; index < 50; index++) useArtifacts.getState().saveDone(`synthetic-art-${index}`, `Artifact ${index}`, artifactBody);
for (let index = 0; index < 20; index++) {
  const id = `synthetic-doc-${index}`;
  useDocuments.getState().create(id, { title: id, format: 'markdown', genre: 'review-notes', brief: 'synthetic' });
  useDocuments.getState().setSections(id, [{ title: 'Section', markdown: documentBody, status: 'done' }]);
  useDocuments.getState().setStatus(id, 'done');
}
for (let index = 0; index < 10; index++) {
  const id = `synthetic-image-${index}`;
  useImageGen.getState().openViewer({ id, prompt: 'synthetic', title: id, count: 1 });
  useImageGen.getState().updateSession(id, { status: 'done', images: [{ b64_json: imageBody }] });
  useImageGen.getState().closeViewer(id);
}
const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  const arts = Object.values(useArtifacts.getState().byId), docs = Object.values(useDocuments.getState().byId), images = Object.values(useImageGen.getState().sessions);
  if (arts.length === 50 && docs.length === 20 && images.length === 10 && arts.every((row) => row.bodyRef) && docs.every((row) => row.bodyRef) && images.every((row) => row.bodyRef)) break;
  await new Promise((done) => setTimeout(done, 20));
}
const arts = Object.values(useArtifacts.getState().byId), docs = Object.values(useDocuments.getState().byId), images = Object.values(useImageGen.getState().sessions);
if (!arts.every((row) => row.bodyRef) || !docs.every((row) => row.bodyRef) || !images.every((row) => row.bodyRef)) throw new Error('product_body_checkpoint_timeout');
globalThis.gc?.();
const snapshot = getResourceSnapshot(), memory = process.memoryUsage();
const result = { schemaVersion: 1, scenario: 'S6', fixtureHash, fixture: { artifacts: 50, documents: 20, generatedImages: 10 }, estimatedSourceBodyBytes: 50 * artifactBody.length * 2 + 20 * documentBody.length * 2 + 10 * imageBody.length * 2, resident: { artifactBodyEstimatedBytes: snapshot.artifactBodyEstimatedBytes, documentBodyEstimatedBytes: snapshot.documentBodyEstimatedBytes, imageGenBodyEstimatedBytes: snapshot.imageGenBodyEstimatedBytes }, process: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external, arrayBuffers: memory.arrayBuffers }, note: 'fake IDB keeps synthetic persistence bytes in this Node process; RSS is not a browser-retained-heap claim' };
const out = resolve('artifacts/performance/product-memory.json');
await mkdir(resolve('artifacts/performance'), { recursive: true });
await writeFile(out, JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ output: out, fixtureHash, resident: result.resident, rss: result.process.rss }) + '\n');
