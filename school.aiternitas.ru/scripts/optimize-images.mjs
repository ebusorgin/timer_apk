#!/usr/bin/env node
/**
 * Optimize images: resize and compress PNGs in client/public
 * Usage: node scripts/optimize-images.mjs
 */

import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'client', 'public');

// Max width by image type
const HERO = ['hero-dynamic.png', 'hero-school.png'];
const GALLERY = ['gallery-tech-class.png', 'gallery-art-class.png', 'gallery-robotics.png', 'gallery-creative.png'];
const CARDS = ['tech-class.png', 'art-class.png', 'teens-coding.png'];

const MAX_WIDTH = {
  hero: 1200,
  gallery: 900,
  cards: 600,
};

async function getCategory(name) {
  if (HERO.includes(name)) return 'hero';
  if (GALLERY.includes(name)) return 'gallery';
  if (CARDS.includes(name)) return 'cards';
  return null;
}

async function optimize() {
  const sharp = (await import('sharp')).default;
  const files = await readdir(PUBLIC_DIR);
  const pngs = files.filter((f) => extname(f).toLowerCase() === '.png');

  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of pngs) {
    const path = join(PUBLIC_DIR, file);
    const category = await getCategory(file);
    if (!category) continue;

    const { size: before } = await stat(path);
    totalBefore += before;

    const maxW = MAX_WIDTH[category];
    const img = sharp(path);
    const meta = await img.metadata();
    const width = meta.width || 0;

    let pipeline = img;
    if (width > maxW) {
      pipeline = pipeline.resize(maxW, null, { withoutEnlargement: true });
    }

    await pipeline
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path + '.tmp');

    const { rename, unlink } = await import('fs/promises');
    await unlink(path);
    await rename(path + '.tmp', path);

    const { size: after } = await stat(path);
    totalAfter += after;
    const saved = ((1 - after / before) * 100).toFixed(1);
    console.log(`${file}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB (-${saved}%)`);
  }

  const totalSaved = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
  console.log(`\nTotal: ${(totalBefore / 1024 / 1024).toFixed(1)} MB → ${(totalAfter / 1024 / 1024).toFixed(1)} MB (-${totalSaved}%)`);
}

optimize().catch((err) => {
  console.error(err);
  process.exit(1);
});
