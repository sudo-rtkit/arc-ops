/* Přenese runtime grafiku Opse / Bedňáka 2.0 z návrhu (docs/design/buddy/bednak2) do aplikace (0.10.0):
   - src/core/data/ops2.json: společná logika (podoby, sloty, díly, odemykání, časování animací, proměny, jiskra),
   - src/core/data/ops2-corner.json a ops2-detail.json: geometrie varianty (mřížka, cesty, posuny dílů, kotvy, viditelnost),
   - src/assets/ops2/{corner,detail}/**: jen PNG, na které manifesty odkazují (pásy těl, díly, proměny, jiskra).
   Kotvy jsou z velké části stejné napříč snímky, takže se ukládají jako tabulka unikátních sad a snímek odkazuje
   indexem (z 6 MB manifestu zbude pár desítek kB). Stálý zOrder (shodný s drawOrder), opticClearance a výrazové
   atlasy runtime nepotřebuje. 256 px detail aplikace skládá ve 128 a zvětší přesně 2×, detail-256/ se nekopíruje.
   Spuštění: node scripts/gen-ops-assets.mjs. Nic nestahuje. */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'docs/design/buddy/bednak2');
const out = join(root, 'src/assets/ops2');
const read = f => JSON.parse(readFileSync(join(src, f), 'utf8').replace(/^﻿/, ''));
const corner = read('ops-layers.json');
const detail = read('ops-layers-detail.json');

const files = new Set();
const use = f => { if (!existsSync(join(src, f))) throw new Error('chybí ' + f); files.add(f); return f; };
const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('varianty se liší: ' + what); };

/* Obě varianty musí mít stejnou logiku (sloty, díly, odemykání, časování); liší se jen geometrie. */
same(Object.keys(corner.slots), Object.keys(detail.slots), 'slots');
same(corner.drawOrder, detail.drawOrder, 'drawOrder');
same(corner.states, detail.states, 'states');
same(corner.unlocks.map(u => [u.level, u.form, u.unlockedParts, u.defaultOutfit, u.transformation ?? null]), detail.unlocks.map(u => [u.level, u.form, u.unlockedParts, u.defaultOutfit, u.transformation ?? null]), 'unlocks');
same(corner.parts.map(p => [p.id, p.slot, p.variant]), detail.parts.map(p => [p.id, p.slot, p.variant]), 'parts');
same(corner.forms.map(f => [f.id, f.levels]), detail.forms.map(f => [f.id, f.levels]), 'forms');

const slots = Object.keys(corner.slots);
const common = {
  version: corner.version,
  slots,
  drawOrder: corner.drawOrder,
  states: Object.fromEntries(Object.entries(corner.states).map(([k, s]) => [k, { frameCount: s.frameCount, durationsMs: s.durationsMs, loop: s.loop, returnTo: s.returnTo }])),
  forms: corner.forms.map(f => ({ id: f.id, name: f.name, levels: f.levels })),
  parts: corner.parts.map(p => ({ id: p.id, slot: p.slot, variant: p.variant, name: p.name, ...(p.frameCount ? { frameCount: p.frameCount } : {}) })),
  unlocks: corner.unlocks.map(u => ({ level: u.level, form: u.form, unlockedParts: u.unlockedParts, defaultOutfit: u.defaultOutfit, ...(u.transformation ? { transformation: u.transformation } : {}) })),
  transforms: corner.transforms.map(t => ({ id: t.id, from: t.from, to: t.to, frameCount: t.frameCount, durationsMs: t.durationsMs })),
  fx: { sparkle: { frameCount: corner.fx.sparkle.frameCount, durationsMs: corner.fx.sparkle.durationsMs } },
  aliases: corner.compatibilityAliases ?? {},
};
same(common.transforms, detail.transforms.map(t => ({ id: t.id, from: t.from, to: t.to, frameCount: t.frameCount, durationsMs: t.durationsMs })), 'transforms');
same(common.fx, { sparkle: { frameCount: detail.fx.sparkle.frameCount, durationsMs: detail.fx.sparkle.durationsMs } }, 'fx');

function geometry(m) {
  const z = new Set(m.forms.flatMap(f => Object.values(f.states).flatMap(s => s.frames.map(fr => JSON.stringify(fr.zOrder)))));
  if (z.size !== 1) throw new Error(m.variant + ': zOrder se mění mezi snímky – runtime s tím nepočítá');
  const table = [], index = new Map();
  const ref = anchors => {
    const row = slots.map(sl => anchors[sl]);
    const k = JSON.stringify(row);
    if (!index.has(k)) { index.set(k, table.length); table.push(row); }
    return index.get(k);
  };
  return {
    variant: m.variant,
    frameSize: m.frameSize,
    anchors: table,
    forms: Object.fromEntries(m.forms.map(f => [f.id, Object.fromEntries(Object.entries(f.states).map(([k, s]) => {
      if (s.frames.length !== m.states[k].frameCount) throw new Error(`${m.variant}/${f.id}/${k}: počet snímků`);
      /* snímek = index do tabulky kotev; neviditelný snímek (začátek příchodu, konec odchodu) = -1 - index */
      return [k, { file: use(s.file), frames: s.frames.map(fr => (fr.visible === false ? -1 - ref(fr.anchors) : ref(fr.anchors))) }];
    }))])),
    parts: Object.fromEntries(m.parts.map(p => [p.id, { file: use(p.file), offset: p.offset, ...(p.frameSize ? { frameSize: p.frameSize } : {}) }])),
    transforms: Object.fromEntries(m.transforms.map(t => [t.id, use(t.file)])),
    sparkle: use(m.fx.sparkle.file),
  };
}

const gCorner = geometry(corner), gDetail = geometry(detail);
rmSync(out, { recursive: true, force: true });
for (const f of files) { mkdirSync(dirname(join(out, f)), { recursive: true }); copyFileSync(join(src, f), join(out, f)); }
writeFileSync(join(root, 'src/core/data/ops2.json'), JSON.stringify(common) + '\n');
writeFileSync(join(root, 'src/core/data/ops2-corner.json'), JSON.stringify(gCorner) + '\n');
writeFileSync(join(root, 'src/core/data/ops2-detail.json'), JSON.stringify(gDetail) + '\n');
console.log(`ops2.json + corner (${gCorner.anchors.length} sad kotev) + detail (${gDetail.anchors.length} sad kotev) + ${files.size} PNG`);
