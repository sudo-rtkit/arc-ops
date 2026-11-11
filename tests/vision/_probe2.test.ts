import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { detectLayout } from '../../src/core/vision/layout';
import { gridCells, frameLum } from '../../src/core/vision/cells';
const D = 'tests/fixtures/vision/own/';
const load = (f: string) => { const p = PNG.sync.read(readFileSync(f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
it('probe2', () => {
  for (const f of [D+'own-materials-scrolled-tooltip-fabric.png', D+'own-materials-tooltip-battery.png', D+'own-all-legendary-cropped-tooltip.png', 'tests/fixtures/vision/sample-stash-all-tooltip-1080p.png', D+'own-prerade-free-loadout.png']) {
    const img = load(f);
    const lay = detectLayout(img)!;
    for (const p of lay.panels) console.log(f.slice(-25), p.panel, gridCells(p).map(c => `${c.row},${c.col}${c.framed?'':'*'}:${frameLum(img, c.box).toFixed(0)}`).join(' '));
  }
}, 60000);
