/** Read-only S6 image metadata probe. It never decodes full bitmaps. */
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve('public/images');
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(entry.name)) files.push(file);
  }
}
walk(root);
const rows = [];
for (const file of files) {
  try {
    const meta = await sharp(file, { failOn: 'none' }).metadata();
    const width = meta.width ?? 0, height = meta.height ?? 0;
    rows.push({ path: relative(process.cwd(), file).replace(/\\/g, '/'), width, height, bytes: statSync(file).size, decodedRgbaBytes: width * height * 4 });
  } catch { /* corrupt source remains available to original renderer fallback */ }
}
const large = rows.filter((row) => row.width > 2400 || row.height > 2400 || row.decodedRgbaBytes > 32 * 1024 * 1024);
const result = { schemaVersion: 1, files: rows.length, sourceBytes: rows.reduce((sum, row) => sum + row.bytes, 0), candidates: large.length, candidateSourceBytes: large.reduce((sum, row) => sum + row.bytes, 0), candidateDecodedRgbaBytes: large.reduce((sum, row) => sum + row.decodedRgbaBytes, 0), top: large.sort((a, b) => b.decodedRgbaBytes - a.decodedRgbaBytes).slice(0, 20) };
const output = resolve('artifacts/performance/image-metadata.json');
mkdirSync(resolve('artifacts/performance'), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ output, files: result.files, candidates: result.candidates, sourceMB: Math.round(result.sourceBytes / 1024 / 1024), candidateDecodedMB: Math.round(result.candidateDecodedRgbaBytes / 1024 / 1024) }) + '\n');
