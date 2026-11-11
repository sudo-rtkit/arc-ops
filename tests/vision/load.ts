/* Načtení testovacích snímků (PNG přes vývojovou závislost pngjs). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';

export const FIXTURES = fileURLToPath(new URL('../fixtures/vision/', import.meta.url));
export const AMMO = 'sample-stash-ammo-filter-1080p.png';
export const TOOLTIP = 'sample-stash-all-tooltip-1080p.png';
export const TOP = 'sample-stash-all-top-1080p.png';

const cache = new Map<string, RgbaImage>();
export function loadFixture(name: string): RgbaImage {
  let img = cache.get(name);
  if (!img) {
    const png = PNG.sync.read(readFileSync(FIXTURES + name));
    img = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
    cache.set(name, img);
  }
  return img;
}
export const expected = JSON.parse(readFileSync(FIXTURES + 'expected.json', 'utf8'));
