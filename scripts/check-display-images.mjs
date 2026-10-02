import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mapping = JSON.parse(readFileSync(resolve('lib/content-data/display-images.generated.json'), 'utf8'));
let checked = 0;
for (const [original, display] of Object.entries(mapping)) {
  if (!original.startsWith('/images/') || !display.src?.startsWith('/images-display/v2/')) throw new Error(`invalid_display_mapping:${original}`);
  const originalFile = resolve(`public${original}`), displayFile = resolve(`public${display.src}`);
  if (!existsSync(originalFile) || !existsSync(displayFile)) throw new Error(`missing_display_asset:${original}`);
  const meta = await sharp(displayFile).metadata();
  if (meta.width !== display.width || meta.height !== display.height || (meta.width ?? 0) > 2048 || (meta.height ?? 0) > 2048) throw new Error(`invalid_display_dimensions:${original}`);
  checked++;
}
if (checked < 1) throw new Error('display_mapping_empty');
process.stdout.write(`display-images: ${checked} original/derivative pairs verified\n`);
