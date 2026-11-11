/* Přenese runtime grafiku Opse z návrhu (docs/design/buddy/layers) do aplikace:
   - src/core/data/opsLayers.json: zúžený manifest (bez kontrolních údajů a stálého zOrder; pořadí je drawOrder),
   - src/assets/ops/**: jen PNG, na které manifest odkazuje (těla, díly, proměny, jiskra).
   Spuštění: node scripts/gen-ops-assets.mjs. Nic nestahuje. */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'docs/design/buddy/layers');
const out = join(root, 'src/assets/ops');
const m = JSON.parse(readFileSync(join(src, 'ops-layers.json'), 'utf8').replace(/^﻿/, ''));

const files = new Set();
const use = f => { if (!existsSync(join(src, f))) throw new Error('chybí ' + f); files.add(f); return f; };
const state = s => ({ frameCount: s.frameCount, durationsMs: s.durationsMs, loop: s.loop, returnTo: s.returnTo });

const z = new Set(m.forms.flatMap(f => Object.values(f.states).flatMap(s => s.frames.map(fr => JSON.stringify(fr.zOrder)))));
if (z.size !== 1) throw new Error('zOrder se mění mezi snímky – runtime s tím nepočítá');

const runtime = {
  version: m.version,
  frameSize: m.frameSize,
  slots: Object.keys(m.slots),
  drawOrder: m.drawOrder,
  states: Object.fromEntries(Object.entries(m.states).map(([k, s]) => [k, state(s)])),
  forms: m.forms.map(f => ({
    id: f.id, name: f.name, levels: f.levels,
    states: Object.fromEntries(Object.entries(f.states).map(([k, s]) => [k, { file: use(s.file), anchors: s.frames.map(fr => fr.anchors) }])),
  })),
  parts: m.parts.map(p => ({
    id: p.id, slot: p.slot, variant: p.variant, name: p.name, file: use(p.file), offset: p.offset,
    ...(p.forms ? { forms: Object.fromEntries(Object.entries(p.forms).map(([k, v]) => [k, { file: use(v.file), offset: v.offset }])) } : {}),
    ...(p.frameSize ? { frameSize: p.frameSize, frameCount: p.frameCount } : {}),
  })),
  unlocks: m.unlocks.map(u => ({ level: u.level, form: u.form, unlockedParts: u.unlockedParts, defaultOutfit: u.defaultOutfit, ...(u.transformation ? { transformation: u.transformation } : {}) })),
  transforms: m.transforms.map(t => ({ id: t.id, from: t.from, to: t.to, file: use(t.file), frameCount: t.frameCount, durationsMs: t.durationsMs })),
  fx: { sparkle: { file: use(m.fx.sparkle.file), frameCount: m.fx.sparkle.frameCount, durationsMs: m.fx.sparkle.durationsMs } },
};

rmSync(out, { recursive: true, force: true });
for (const f of files) { mkdirSync(dirname(join(out, f)), { recursive: true }); copyFileSync(join(src, f), join(out, f)); }
writeFileSync(join(root, 'src/core/data/opsLayers.json'), JSON.stringify(runtime) + '\n');
console.log(`opsLayers.json + ${files.size} PNG`);
