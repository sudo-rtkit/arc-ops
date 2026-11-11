import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { readScreenshot } from '../../src/core/vision/read';
const D = 'tests/fixtures/vision/own/';
it('probe', () => {
  const files = process.env.F ? process.env.F.split(',') : readdirSync(D).filter(f => f.endsWith('.png'));
  for (const f of files) {
    const p = PNG.sync.read(readFileSync(D + f));
    const img = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
    const t = Date.now();
    const r = readScreenshot(img);
    console.log(`== ${f} ${Date.now()-t}ms hdr=${r.headerSlots}/${r.headerSlotsMax} val=${r.stashValue} coins=${r.coins} warn=${r.warnings} ov=${r.overlays.map(o=>o.kind+'@'+[o.box.x,o.box.y,o.box.w,o.box.h]).join(';')}`);
    for (const pn of r.panels) {
      console.log(`  ${pn.panel} y=${pn.grid.y} ${pn.grid.cols}x${pn.grid.rows} slots=${pn.slots}/${pn.slotsMax} sel=${JSON.stringify(pn.selected)} pt=${pn.partialTop?.visible} pb=${pn.partialBottom?.visible}`);
      const rows: string[] = [];
      for (let row = 0; row < pn.grid.rows; row++) {
        const cs: string[] = [];
        for (let col = 0; col < pn.grid.cols; col++) {
          const c = pn.cells.find(x => x.row === row && x.col === col);
          const h = pn.hidden.some(x => x.row === row && x.col === col);
          cs.push(h ? 'H' : c ? `${c.count ?? (c.tier ?? (c.countText ? '?' + c.countText : '-'))}${c.rarity[0]}` : '.');
        }
        rows.push(cs.join(' '));
      }
      console.log('   ' + rows.join(' | '));
    }
  }
}, 120000);
