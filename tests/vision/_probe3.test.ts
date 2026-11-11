import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { detectLayout } from '../../src/core/vision/layout';
import { findOverlays } from '../../src/core/vision/overlays';
import { refineBox, textLines } from '../../src/core/vision/tooltip';
const load = (f: string) => { const p = PNG.sync.read(readFileSync(f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
it('probe3', () => {
  for (const f of ['tests/fixtures/vision/sample-stash-all-tooltip-1080p.png', ...['own-materials-tooltip-medium-gun-parts.png', 'own-materials-tooltip-battery.png', 'own-materials-scrolled-tooltip-crude-explosives.png','own-materials-scrolled-tooltip-fabric.png', 'own-all-legendary-cropped-tooltip.png'].map(x => 'tests/fixtures/vision/own/' + x)]) {
    const img = load(f); const lay = detectLayout(img)!;
    const o = findOverlays(img, lay.cellPx).find(o => o.kind === 'tooltip')!;
    const b = refineBox(img, o.box);
    console.log(f.slice(-30), JSON.stringify(o.box), JSON.stringify(b), textLines(img, b).map(l => `${l.y0}-${l.y1}`).join(' '));
  }
}, 60000);
