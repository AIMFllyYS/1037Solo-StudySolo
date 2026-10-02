/** Deterministic high-DPR display derivatives; original teaching images stay untouched. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const inputRoot = resolve('public/images');
const outputRoot = resolve('public/images-display/v2');
const manifestPath = resolve('lib/content-data/display-images.generated.json');
const MAX_EDGE = 2048;
const MIN_EDGE = 2400;
const DECODE_THRESHOLD = 32 * 1024 * 1024;
sharp.concurrency(2);

async function list(dir, out = []) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const absolute = join(dir, item.name);
    if (item.isDirectory()) await list(absolute, out);
    else if (item.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(item.name)) out.push(absolute);
  }
  return out;
}

const sources = (await list(inputRoot)).sort();
const manifest = {};
let generated = 0, reused = 0, sourceDecoded = 0, displayDecoded = 0;
let failures = 0;
async function processImage(source) {
  let meta;
  try { meta = await sharp(source, { failOn: 'none' }).metadata(); }
  catch { return; }
  const width = meta.width ?? 0, height = meta.height ?? 0;
  if (!width || !height || (width <= MIN_EDGE && height <= MIN_EDGE && width * height * 4 <= DECODE_THRESHOLD)) return;
  const rel = relative(inputRoot, source).replace(/\\/g, '/');
  const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 12);
  const destRel = `${rel}.${digest}.webp`;
  const dest = join(outputRoot, destRel);
  await mkdir(dirname(dest), { recursive: true });
  try {
    if (!existsSync(dest)) {
      await sharp(source, { failOn: 'none', limitInputPixels: 150_000_000 })
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90, effort: 4 })
        .toFile(dest);
      generated++;
    } else reused++;
    const display = await sharp(dest).metadata();
    const displayWidth = display.width ?? 0, displayHeight = display.height ?? 0;
    if (!displayWidth || !displayHeight) return;
    manifest[`/images/${rel}`] = { src: `/images-display/v2/${destRel}`, width: displayWidth, height: displayHeight, originalWidth: width, originalHeight: height };
    sourceDecoded += width * height * 4;
    displayDecoded += displayWidth * displayHeight * 4;
  } catch (error) {
    failures++;
    if (failures <= 3) process.stderr.write(`[display-images] skipped ${rel}: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}\n`);
  }
}

// Two full decodes max in flight; file count alone is not the memory budget.
let next = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < sources.length) await processImage(sources[next++]);
}));
const ordered = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(manifestPath, JSON.stringify(ordered, null, 2) + '\n');
process.stdout.write(JSON.stringify({ generated, reused, failures, entries: Object.keys(ordered).length, sourceDecodedMB: Math.round(sourceDecoded / 1024 / 1024), displayDecodedMB: Math.round(displayDecoded / 1024 / 1024) }) + '\n');
if (failures) process.exitCode = 1;
