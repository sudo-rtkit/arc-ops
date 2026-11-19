/* 0.34.0: oblečení Opse: data, odemykání, normalizace, skládání snímku, opravy těla, nátěr, líné načítání, hláška. */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  CLOTHING, CLOTHING_SETS, CLOTHING_SET_IDS, CLOTHING_SLOTS, clothingProgress, newlyUnlockedSets, normalizeClothingSets, normalizeWorn,
  parsePiece, ruleMet, syncClothing, unlockedSets, wornClothing, wornKey, type ClothingProgress, type Worn,
} from '../../src/core/clothing';
import { PALETTE_RGB, applyRepair, planFrame, type ClothingGeo } from '../../src/core/clothingPlan';
import { pieceName, setName } from '../../src/core/clothingNames';
import { clothingLine, createClothingNotices } from '../../src/core/clothingNotice';
import { OPS, normalizeBuddy } from '../../src/core/ops';
import { OPS_PALETTE, PAINTS, PAINT_KEEP, PAINT_SWAP, paintMap, recolorPixels } from '../../src/core/paints';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { GameInfo } from '../../src/core/ai';
import type { AppState } from '../../src/core/types';
import type { LineRef } from '../../src/core/opsVoice';

const NOW = new Date(2026, 10, 19, 12, 0).getTime();
const ROOT = join(__dirname, '../..');
async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}
const prog = (p: Partial<ClothingProgress> = {}): ClothingProgress => ({ level: 0, rounds: 0, extractions: 0, ...p });
const raid = (ok: boolean, i: number) => ({ id: 'r' + i, ts: NOW - i * 1000, map: 'dam', type: 'pvp', route: '', ok, coins: 0, min: 20, notes: '' });

describe('0.34.0 oblečení: zabalená data', () => {
  it('16 sad × 4 díly, sloty, pořadí kreslení navazuje na stávající díly', () => {
    expect(CLOTHING_SETS).toHaveLength(16);
    expect(CLOTHING_SET_IDS).toEqual(['field', 'rain', 'forge', 'dune', 'courier', 'winter', 'signal', 'diver', 'medic', 'surveyor', 'scout', 'welder', 'dock', 'hazmat', 'archivist', 'drone']);
    expect(CLOTHING_SLOTS).toEqual(['headwear', 'torso', 'neck', 'back']);
    for (const s of CLOTHING_SETS) {
      for (const lang of ['cs', 'en'] as const) expect(setName(s.id, lang)).not.toBe(s.id);
      for (const slot of CLOTHING_SLOTS) for (const lang of ['cs', 'en'] as const) expect(pieceName(s.id + '-' + slot, lang).length).toBeGreaterThan(2);
    }
    expect(setName('field', 'en')).toBe('Trail Gatherer');
    expect(CLOTHING.drawOrder.filter(s => !(CLOTHING_SLOTS as readonly string[]).includes(s))).toEqual(OPS.drawOrder);
    /* záda mezi pláštěm a tělem, trup po opasku, krk po štítku, pokrývka hlavy po ploutvi */
    const at = (s: string) => CLOTHING.drawOrder.indexOf(s);
    expect([at('cape') < at('back'), at('back') < at('body'), at('belt') < at('torso'), at('tag') < at('neck'), at('fin') < at('headwear')]).toEqual([true, true, true, true, true]);
    expect(CLOTHING.hides).toEqual({
      headwear: ['antenna', 'fin'], torso: ['paint', 'armour', 'shoulders', 'cables', 'radio', 'belt', 'badges', 'tag', 'charm'],
      neck: ['badges', 'lamp'], back: ['backpack', 'cape'],
    });
    /* hledí (visor) nic neskrývá */
    expect(Object.values(CLOTHING.hides).flat()).not.toContain('visor');
    expect(CLOTHING.hiddenClips).toEqual(['appear', 'dismiss', 'transform']);
  });

  it('paleta oblečení = paleta src/core/paints.ts (generátor ověřuje i přemalované a pevné barvy)', () => {
    expect([...CLOTHING.palette].sort()).toEqual(Object.keys(OPS_PALETTE).sort());
    expect(PALETTE_RGB).toHaveLength(20);
    expect(PALETTE_RGB[CLOTHING.palette.indexOf('apricot')]).toEqual([0xF4, 0xAD, 0x82]);
    expect([...PAINT_SWAP, ...PAINT_KEEP].sort()).toEqual(Object.keys(OPS_PALETTE).sort());
    /* nejtěžší metadata (názvy) nejsou v balíku, který načítá každé okno */
    expect(readFileSync(join(ROOT, 'src/core/data/clothing.json'), 'utf8').length).toBeLessThan(2000);
  });

  it('geometrie pro každou variantu a podobu: 64 dílů, pohyb pro všech 26 klipů, opravy jen na plátně', () => {
    const dir = join(ROOT, 'src/core/data/clothing');
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(10);
    for (const f of files) {
      const g = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ClothingGeo;
      expect(f).toBe(`${g.variant}-${g.form}.json`);
      expect(Object.keys(g.pieces)).toHaveLength(64);
      expect(g.size).toBe(g.variant === 'corner' ? 96 : 128);
      for (const [clip, st] of Object.entries(OPS.states)) expect(g.motion[clip]).toHaveLength(st.frameCount * 3);
      for (const clip of Object.keys(g.frames)) expect(CLOTHING.hiddenClips).not.toContain(clip);
      for (const [ri, x, y] of g.refs) {
        const [w, h] = g.repairs[ri];
        expect(x >= 0 && y >= 0 && x + w <= g.size && y + h <= g.size).toBe(true);
      }
      /* Začátečník nemá zapečenou anténu ani batoh: žádné opravy */
      if (g.form === 'rookie') expect(g.repairs).toEqual([]);
      for (const p of Object.values(g.pieces)) expect(p.every(Number.isInteger)).toBe(true);
    }
  });
});

describe('0.34.0 oblečení: postupné odemykání (unlockSuggestions)', () => {
  it('přesně 6 sad za level, 5 za kola miniher, 5 za extrakce', () => {
    const by = (kind: string) => CLOTHING_SETS.filter(s => s.unlock.kind === kind).map(s => [s.id, (s.unlock as { level?: number; count?: number }).level ?? (s.unlock as { count: number }).count]);
    expect(by('level')).toEqual([['field', 5], ['dune', 17], ['signal', 29], ['surveyor', 41], ['dock', 53], ['drone', 65]]);
    expect(by('rounds')).toEqual([['rain', 7], ['courier', 13], ['diver', 19], ['scout', 25], ['hazmat', 31]]);
    expect(by('extractions')).toEqual([['forge', 5], ['winter', 8], ['medic', 11], ['welder', 14], ['archivist', 17]]);
  });

  it('pravidla jsou čistá a deterministická, hranice včetně', () => {
    expect(ruleMet({ kind: 'level', level: 5 }, prog({ level: 4 }))).toBe(false);
    expect(ruleMet({ kind: 'level', level: 5 }, prog({ level: 5 }))).toBe(true);
    expect(ruleMet({ kind: 'rounds', count: 7 }, prog({ rounds: 6 }))).toBe(false);
    expect(ruleMet({ kind: 'rounds', count: 7 }, prog({ rounds: 7 }))).toBe(true);
    expect(ruleMet({ kind: 'extractions', count: 5 }, prog({ extractions: 5, level: 0 }))).toBe(true);
    expect(newlyUnlockedSets([], prog())).toEqual([]);
    expect(newlyUnlockedSets([], prog({ level: 17, rounds: 13, extractions: 5 }))).toEqual(['field', 'rain', 'forge', 'dune', 'courier']);
    expect(newlyUnlockedSets(['field', 'rain'], prog({ level: 17, rounds: 13, extractions: 5 }))).toEqual(['forge', 'dune', 'courier']);
    expect(newlyUnlockedSets([], prog({ level: 99, rounds: 999, extractions: 999 }))).toEqual(CLOTHING_SET_IDS);
    expect(newlyUnlockedSets([], prog({ level: 99, rounds: 999, extractions: 999 }))).toEqual(newlyUnlockedSets([], prog({ level: 99, rounds: 999, extractions: 999 })));
  });

  it('postup: level profilu, dohraná kola všech miniher, jen úspěšné extrakce z deníku', () => {
    const s = defaultState(NOW, 'cs');
    s.profile.level = 12;
    s.games.tetris.played = 3; s.games.quiz.played = 2; s.games.hack.played = 2;
    s.raids = [raid(true, 1), raid(false, 2), raid(true, 3)] as AppState['raids'];
    expect(clothingProgress(s)).toEqual({ level: 12, rounds: 7, extractions: 2 });
    expect(syncClothing(s)).toEqual(['field', 'rain']);
    expect(s.buddy.clothingSets).toEqual(['field', 'rain']);
    expect(syncClothing(s)).toEqual([]);
  });

  it('odemčená sada zůstane i po poklesu levelu, zkrácení deníku a načtení stavu', () => {
    const s = defaultState(NOW, 'cs');
    s.profile.level = 30;
    syncClothing(s);
    expect(s.buddy.clothingSets).toEqual(['field', 'dune', 'signal']);
    s.profile.level = 1;
    expect(syncClothing(s)).toEqual([]);
    expect(s.buddy.clothingSets).toEqual(['field', 'dune', 'signal']);
    const n = normalize(JSON.parse(JSON.stringify(s)), NOW, 'cs');
    expect(n.buddy.clothingSets).toEqual(['field', 'dune', 'signal']);
    expect(n.profile.level).toBe(1);
  });

  it('normalize nic neodvozuje (schéma zůstává 19); store sady doplní při načtení', async () => {
    expect(SCHEMA).toBe(19);
    const empty = normalize({}, NOW, 'cs');
    expect(empty.buddy.clothingSets).toBeUndefined();
    expect(empty.buddy.clothing).toBeUndefined();
    const stored = { schema: SCHEMA, profile: { level: 41 }, raids: Array.from({ length: 8 }, (_, i) => raid(true, i)) };
    expect(normalize(stored, NOW, 'cs').buddy.clothingSets).toBeUndefined();
    const app = await makeApp(stored);
    expect(app.store.getState().state.buddy.clothingSets).toEqual(['field', 'forge', 'dune', 'winter', 'signal', 'surveyor']);
  });
});

describe('0.34.0 oblečení: normalizace (jen známá ID, omezené délky)', () => {
  it('sady: nesmysly, cizí typy a duplicity pryč, pořadí manifestu', () => {
    expect(normalizeClothingSets(['rain', 'field', 'rain', 'nope', 42, null, { id: 'dock' }, '../etc', 'FIELD'])).toEqual(['field', 'rain']);
    expect(normalizeClothingSets('field')).toEqual([]);
    expect(normalizeClothingSets(undefined)).toEqual([]);
  });

  it('příliš dlouhý seznam: čte se jen začátek (nejvýš 64 položek)', () => {
    const long = [...Array.from({ length: 10_000 }, (_, i) => 'x' + i), 'field'];
    expect(normalizeClothingSets(long)).toEqual([]);
    expect(normalizeClothingSets(['dock', ...Array.from({ length: 100 }, () => 'drone')])).toEqual(['dock', 'drone']);
  });

  it('oblečení: jen díl správného slotu ze známé sady; neznámé sloty a cesty zahodí', () => {
    expect(normalizeWorn({ headwear: 'field-headwear', torso: 'field-headwear', neck: 'nope-neck', back: '../../x.png', hat: 'rain-headwear', __proto__: { torso: 'rain-torso' } })).toEqual({ headwear: 'field-headwear' });
    expect(normalizeWorn({ headwear: 'rain-headwear', torso: 'forge-torso', neck: 'dune-neck', back: 'drone-back' })).toEqual({ headwear: 'rain-headwear', torso: 'forge-torso', neck: 'dune-neck', back: 'drone-back' });
    expect(normalizeWorn('field-headwear')).toEqual({});
    expect(normalizeWorn(['field-headwear'])).toEqual({});
    expect(parsePiece('field-' + 'x'.repeat(100))).toBeNull();
    expect(parsePiece('field-back')).toEqual({ set: 'field', slot: 'back' });
    expect(pieceName('field-headwear', 'cs')).toBe('Čepice s krátkým kšiltem');
    expect(pieceName('field-headwear', 'en')).toBe('Short-brim cap');
  });

  it('normalizeBuddy: pole jen s obsahem; nosí se jen díly odemčených sad', () => {
    const b = normalizeBuddy({ clothingSets: ['field', 'junk'], clothing: { headwear: 'field-headwear', back: 'drone-back', neck: 7 } });
    expect(b.clothingSets).toEqual(['field']);
    expect(b.clothing).toEqual({ headwear: 'field-headwear', back: 'drone-back' });
    expect(wornClothing(b)).toEqual({ headwear: 'field-headwear' });
    expect(unlockedSets(b)).toEqual(['field']);
    expect(normalizeBuddy({})).not.toHaveProperty('clothing');
    expect(normalizeBuddy({})).not.toHaveProperty('clothingSets');
    expect(wornKey(wornClothing(b))).toBe('field-headwear|||');
    expect(wornClothing(null)).toEqual({});
  });
});

describe('0.34.0 oblečení: akce store', () => {
  it('díl jen z odemčené sady a správného slotu, celá sada, Vše automaticky vše vrátí', async () => {
    const app = await makeApp({ schema: SCHEMA, profile: { level: 17 }, buddy: { form: 'veteran', outfit: { antenna: null } } });
    const b = () => app.store.getState().state.buddy;
    expect(b().clothingSets).toEqual(['field', 'dune']);
    app.actions.setClothing('headwear', 'rain-headwear');
    expect(b().clothing).toBeUndefined();
    app.actions.setClothing('headwear', 'field-torso');
    app.actions.setClothing('hat', 'field-headwear');
    expect(b().clothing).toBeUndefined();
    app.actions.setClothing('headwear', 'field-headwear');
    app.actions.setClothing('torso', 'dune-torso');
    expect(b().clothing).toEqual({ headwear: 'field-headwear', torso: 'dune-torso' });
    app.actions.setClothing('torso', null);
    expect(b().clothing).toEqual({ headwear: 'field-headwear' });
    app.actions.setClothingSet('rain');
    expect(b().clothing).toEqual({ headwear: 'field-headwear' });
    app.actions.setClothingSet('dune');
    expect(b().clothing).toEqual({ headwear: 'dune-headwear', torso: 'dune-torso', neck: 'dune-neck', back: 'dune-back' });
    app.actions.resetBuddyOutfit();
    expect(b().clothing).toBeUndefined();
    expect(b().form).toBeUndefined();
    expect(b().outfit).toEqual({});
    /* reset bez čehokoli ručního nic nemění */
    const before = app.store.getState().state;
    app.actions.resetBuddyOutfit();
    expect(app.store.getState().state).toBe(before);
    /* po resetu zůstanou sady odemčené */
    expect(b().clothingSets).toEqual(['field', 'dune']);
  });

  it('dohrané kolo nebo úspěšný raid sadu odemkne hned při změně', async () => {
    const app = await makeApp({ schema: SCHEMA, games: { tetris: { played: 6, best: 0, bestPct: 0 } } });
    expect(app.store.getState().state.buddy.clothingSets).toBeUndefined();
    app.actions.finishGame({ game: 'tetris', score: 10, greedy: 100 });
    expect(app.store.getState().state.buddy.clothingSets).toEqual(['rain']);
  });
});

/* ----- skládání snímku na malých syntetických datech ----- */
const synth = (extra: Partial<ClothingGeo> = {}): ClothingGeo => ({
  variant: 'corner', form: 'explorer', size: 32, atlas: 'corner-explorer.png',
  pieces: {
    'field-headwear': [0, 0, 6, 3, 10, 4, 0], 'field-torso': [0, 4, 8, 4, 8, 16, 1],
    'field-neck': [0, 9, 4, 2, 12, 14, 1], 'field-back': [0, 12, 6, 6, 4, 10, 0],
  },
  motion: { idle: [0, 0, 0, 1, -1, 2], talk: [0, 0, 0], appear: [0, 0, 0], dismiss: [0, 0, 0], sleep: [0, 0, 0] },
  repairs: [[2, 1, 1, 0, 0, 2, 0], [3, 1, 1, 0, 1, 2, 1, 0, 0, 1, 5]],
  refs: [[0, 5, 5], [1, 6, 6], [0, 7, 7]],
  frames: { idle: [0, 1, 2, -1, -1, -1], sleep: [0, -1, -1] },
  ...extra,
});
const ALL: Worn = { headwear: 'field-headwear', torso: 'field-torso', neck: 'field-neck', back: 'field-back' };
const order = (plan: ReturnType<typeof planFrame>) => plan.layers.map(l => (l.kind === 'body' ? 'body' : l.kind === 'part' ? l.slot : '+' + l.slot));

describe('0.34.0 oblečení: plán snímku (syntetická data)', () => {
  it('bez oblečení nebo bez geometrie = přesně dosavadní pořadí dílů', () => {
    const base = ['cape', 'body', ...OPS.drawOrder.slice(2)];
    expect(order(planFrame(null, 'idle', 0, ALL))).toEqual(OPS.drawOrder);
    expect(order(planFrame(synth(), 'idle', 0, {}))).toEqual(base);
    expect(planFrame(synth(), 'idle', 0, {}).repair).toBeNull();
  });

  it('pořadí kreslení oblečení mezi stávajícími sloty a sjednocení skrytých slotů', () => {
    const plan = planFrame(synth(), 'idle', 0, ALL);
    expect(order(plan)).toEqual(['+back', 'body', 'visor', '+torso', '+neck', 'tool', '+headwear']);
    expect(new Set(plan.hides)).toEqual(new Set(['antenna', 'fin', 'paint', 'armour', 'shoulders', 'cables', 'radio', 'belt', 'badges', 'tag', 'charm', 'lamp', 'backpack', 'cape']));
    const neck = planFrame(synth(), 'idle', 0, { neck: 'field-neck' });
    expect(order(neck)).toEqual(['cape', 'body', 'backpack', 'paint', 'armour', 'shoulders', 'cables', 'radio', 'visor', 'belt', 'tag', '+neck', 'tool', 'antenna', 'fin', 'charm']);
  });

  it('poloha = origin + pohyb jen jednou; horní reference dT, dolní dB', () => {
    const plan = planFrame(synth(), 'idle', 1, ALL);
    const at = (slot: string) => plan.layers.find(l => l.kind === 'cloth' && l.slot === slot) as { x: number; y: number; sx: number; sy: number };
    expect(at('headwear')).toMatchObject({ x: 11, y: 3, sx: 0, sy: 0 });
    expect(at('torso')).toMatchObject({ x: 9, y: 18 });
    expect(at('back')).toMatchObject({ x: 5, y: 9 });
  });

  it('oprava těla podle viditelných dílů: both, headwear, back; chybějící položka nic nemění', () => {
    expect(planFrame(synth(), 'idle', 0, ALL).repair).toMatchObject({ key: 'both', x: 7, y: 7 });
    expect(planFrame(synth(), 'idle', 0, { headwear: 'field-headwear', torso: 'field-torso' }).repair).toMatchObject({ key: 'headwear', x: 5, y: 5 });
    expect(planFrame(synth(), 'idle', 0, { back: 'field-back' }).repair).toMatchObject({ key: 'back', x: 6, y: 6 });
    expect(planFrame(synth(), 'idle', 0, { torso: 'field-torso', neck: 'field-neck' }).repair).toBeNull();
    expect(planFrame(synth(), 'idle', 1, ALL).repair).toBeNull();
    expect(planFrame(synth(), 'talk', 0, ALL).repair).toBeNull();
  });

  it('příchod, odchod, neviditelný snímek a neznámý klip: žádné oblečení, skrývání ani oprava', () => {
    for (const plan of [planFrame(synth(), 'appear', 0, ALL), planFrame(synth(), 'dismiss', 0, ALL), planFrame(synth(), 'idle', 0, ALL, false), planFrame(synth(), 'nope', 0, ALL), planFrame(synth(), 'transform', 0, ALL), planFrame(synth(), 'idle', 7, ALL)]) {
      expect(plan.layers.filter(l => l.kind === 'cloth')).toEqual([]);
      expect(plan.hides).toEqual([]);
      expect(plan.repair).toBeNull();
    }
    /* spánek oblečení drží */
    expect(planFrame(synth(), 'sleep', 0, ALL).layers.filter(l => l.kind === 'cloth')).toHaveLength(4);
  });

  it('díl, který by vyjel z plátna (okraj 1 px), se potlačí celý i s hides a opravou', () => {
    const geo = synth({ pieces: { ...synth().pieces, 'field-headwear': [0, 0, 6, 3, 0, 4, 0] } });
    const plan = planFrame(geo, 'idle', 0, { headwear: 'field-headwear' });
    expect(plan.layers.filter(l => l.kind === 'cloth')).toEqual([]);
    expect(plan.hides).toEqual([]);
    expect(plan.repair).toBeNull();
    /* záda zůstanou, oprava pak jen back */
    expect(planFrame(geo, 'idle', 0, { headwear: 'field-headwear', back: 'field-back' }).repair).toMatchObject({ key: 'back' });
    const edge = synth({ pieces: { ...synth().pieces, 'field-headwear': [0, 0, 6, 3, 25, 4, 0] } });
    expect(planFrame(edge, 'idle', 0, { headwear: 'field-headwear' }).layers.some(l => l.kind === 'cloth')).toBe(true);
    const out = synth({ pieces: { ...synth().pieces, 'field-headwear': [0, 0, 6, 3, 26, 4, 0] } });
    expect(planFrame(out, 'idle', 0, { headwear: 'field-headwear' }).layers.some(l => l.kind === 'cloth')).toBe(false);
  });

  it('applyRepair: maska vymaže RGBA, obnova zapíše barvu palety, mimo dlaždici nic', () => {
    const W = 4, H = 3, d = new Uint8ClampedArray(W * H * 4).fill(200);
    /* 3 × 2: maska (0,0)-(1,0) a (1,1); obnova (1,0) barva 0, (0,1) barva 5 */
    applyRepair(d, W, H, [3, 2, 2, 0, 0, 2, 1, 1, 1, 2, 0, 1, 1, 0, 1, 0, 1, 5], 2, 1);
    const px = (x: number, y: number) => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
    expect(px(2, 1)).toEqual([0, 0, 0, 0]);
    expect(px(3, 1)).toEqual([...PALETTE_RGB[0], 255]);
    expect(px(2, 2)).toEqual([...PALETTE_RGB[5], 255]);
    expect(px(3, 2)).toEqual([0, 0, 0, 0]);
    expect(px(0, 0)).toEqual([200, 200, 200, 200]);
    /* oprava přesahující dlaždici nic nezapíše mimo ni a nespadne */
    const e = new Uint8ClampedArray(W * H * 4).fill(9);
    applyRepair(e, W, H, [2, 1, 1, 0, 0, 2, 0], 3, 2);
    expect([...e].filter(v => v !== 9)).toHaveLength(4);
  });
});

describe('0.34.0 oblečení: nátěr na barvách oblečení', () => {
  it('atlas: přemalované barvy se mění přesně podle nátěru, pevné barvy (lem, oči, signální) zůstanou', () => {
    const png = PNG.sync.read(readFileSync(join(ROOT, 'src/assets/clothing/corner-veteran.png')));
    const pal = new Map(Object.entries(OPS_PALETTE).map(([k, v]) => [parseInt(v.slice(1), 16), k]));
    for (const paint of PAINTS.filter(p => p.id !== 'original')) {
      const d = Uint8Array.from(png.data);
      recolorPixels(d, paint.id);
      const map = paintMap(paint.id);
      let swapped = 0, kept = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!png.data[i + 3]) { expect(d[i + 3]).toBe(0); continue; }
        const rgb = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
        const name = pal.get(rgb)!;
        expect(name).toBeDefined();
        expect(d[i + 3]).toBe(255);
        const to = map.get(rgb);
        if ((PAINT_KEEP as readonly string[]).includes(name)) { expect([d[i], d[i + 1], d[i + 2]]).toEqual([png.data[i], png.data[i + 1], png.data[i + 2]]); kept++; }
        else if (to) { expect([d[i], d[i + 1], d[i + 2]]).toEqual(to); swapped++; }
      }
      expect(swapped).toBeGreaterThan(100);
      expect(kept).toBeGreaterThan(10);
    }
  });
});

describe('0.34.0 oblečení: líné načítání', () => {
  const g = globalThis as unknown as { Image?: unknown };
  const had = g.Image;
  afterEach(() => { g.Image = had; });

  it('žádný soubor aplikace geometrii neimportuje staticky; načítá ji jen clothingData', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []));
    /* import, dynamický import nebo glob s cestou do data/clothing/ (komentáře se nepočítají) */
    const hits = walk(join(ROOT, 'src')).filter(f => /(?:from|import\(|glob(?:<[^>]*>)?\()\s*['"][^'"]*data\/clothing\//.test(readFileSync(f, 'utf8')));
    expect(hits.map(f => f.replace(/\\/g, '/').replace(/.*\/src\//, 'src/'))).toEqual(['src/ops/clothingData.ts']);
    expect(readFileSync(join(ROOT, 'src/ops/clothingData.ts'), 'utf8')).not.toMatch(/eager:\s*true[^)]*data\/clothing|data\/clothing[^)]*eager:\s*true/);
  });

  it('preload bez oblečení geometrii nenačte, s oblečením jen tu jednu podobu', async () => {
    g.Image = class { complete = true; naturalWidth = 1; src = ''; decoding = ''; addEventListener() { /* nic */ } };
    const data = await import('../../src/ops/clothingData');
    const { preload } = await import('../../src/ops/sprite');
    const start = data.clothingLoads();
    await preload('corner', 20, {}, undefined, {});
    await preload('detail', 50, {}, 'legend', undefined);
    expect(data.clothingLoads()).toBe(start);
    expect(data.clothingGeo('corner', 'explorer')).toBeUndefined();
    await preload('corner', 20, {}, undefined, { neck: 'field-neck' });
    expect(data.clothingLoads()).toBe(start + 1);
    const geo = data.clothingGeo('corner', 'explorer')!;
    expect(geo.form).toBe('explorer');
    expect(Object.keys(geo.pieces)).toHaveLength(64);
    await preload('corner', 20, {}, undefined, { neck: 'field-neck' });
    expect(data.clothingLoads()).toBe(start + 1);
    expect(data.clothingGeo('corner', 'legend')).toBeUndefined();
    /* atlas jen ze zabaleného seznamu */
    expect(data.atlasUrl('corner-explorer.png')).toBeTruthy();
    expect(data.atlasUrl('../ops2/corner/x.png')).toBeUndefined();
  });
});

describe('0.34.0 oblečení: hláška o nové sadě', () => {
  const away: GameInfo = { known: true, running: false, visible: false, screen: null };
  const base = (): AppState => {
    const s = defaultState(NOW, 'cs');
    s.buddy.enabled = true;
    return s;
  };
  it('jen s dialogy a buddym, mimo raid a bez hry v popředí; jedna sada jménem, víc počtem', () => {
    const s = base();
    expect(clothingLine(s, away, ['rain'])).toEqual({ line: 'clothing.unlocked', params: { name: setName('rain', 'cs') } });
    expect(clothingLine(s, away, ['rain', 'field'])).toEqual({ line: 'clothing.unlockedMany', params: { count: 2 } });
    expect(clothingLine(s, away, [])).toBeNull();
    expect(clothingLine({ ...s, opsPrefs: { ...s.opsPrefs, dialogs: false } }, away, ['rain'])).toBeNull();
    expect(clothingLine({ ...s, buddy: { ...s.buddy, enabled: false } }, away, ['rain'])).toBeNull();
    expect(clothingLine(s, { ...away, running: true, visible: true }, ['rain'])).toBeNull();
    expect(clothingLine(s, { ...away, running: true }, ['rain'])).toBeNull();
    expect(clothingLine(s, { ...away, known: false }, ['rain'])).toBeNull();
    expect(clothingLine({ ...s, raidLife: { ...s.raidLife, phase: 'inRaid' } }, away, ['rain'])).toBeNull();
    const en = clothingLine({ ...s, settings: { ...s.settings, lang: 'en' } }, away, ['field'])!;
    expect(en.params).toEqual({ name: 'Trail Gatherer' });
  });

  it('hlídač: sady známé při načtení nehlásí; novou ohlásí jednou, zablokovanou později', () => {
    let state = base();
    state.buddy.clothingSets = ['field'];
    let game = { ...away, running: true };
    const subs = new Set<(x: { ready: boolean; state: AppState }) => void>();
    const store = { getState: () => ({ ready: true, state }), subscribe: (f: (x: { ready: boolean; state: AppState }) => void) => { subs.add(f); return () => subs.delete(f); } };
    const said: LineRef[] = [];
    const n = createClothingNotices({ store }, { say: l => said.push(l), game: () => game });
    const push = (s: AppState) => { state = s; subs.forEach(f => f({ ready: true, state })); };
    expect(said).toEqual([]);
    push({ ...state, buddy: { ...state.buddy, clothingSets: ['field', 'rain'] } });
    expect(said).toEqual([]);
    expect(n.pending()).toEqual(['rain']);
    game = away;
    n.poke();
    expect(said).toEqual([{ line: 'clothing.unlocked', params: { name: setName('rain', 'cs') } }]);
    n.poke();
    push({ ...state });
    expect(said).toHaveLength(1);
    n.stop();
  });
});
