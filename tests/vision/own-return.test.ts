/* 0.8.1 / 0.10.1: skutečné snímky hráče po raidu a obrazovky postupu (jen lokálně, složka own/ je v .gitignore). Bez
   složky se testy přeskočí, takže čerstvý klon projde. Ručně odečtené hodnoty: own/return-and-progression/
   expected-manual.json (return-findings: BACKPACK 14/14, QUICK USE 4/4, hodnota loadoutu 55 551 = NE mince ani
   výdělek, váha 51/35). Rozložení buněk níže je ruční odečet téhož snímku (počet nebo tier + vzácnost). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import type { RgbaImage } from '../../src/core/vision/image';
import type { PanelRead } from '../../src/core/vision/read';
import { readCapture, screenKind } from '../../src/core/opsCapture';
import { readProgress, type ProgressRead } from '../../src/core/vision/progress';
import { applyProgress, defaultApply, proposeProgress, type ProfileProposal, type QuestProposal, type SkillsProposal, type StationsProposal } from '../../src/core/progressImport';
import { resize } from '../../src/core/vision/image';
import { analyzeLoot } from '../../src/core/visionImport';
import { applyRaidLoot, checkRaidLoot, lootItems, lootRows, lootSignature } from '../../src/core/lootImport';
import { matchContext } from '../../src/core/catalog';
import { getMaterials } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { itemKey } from '../../src/core/types';

const DIR = FIXTURES + 'own/return-and-progression/';
const HAS = existsSync(DIR + 'expected-manual.json') && existsSync(DIR + 'return-findings.png');
const OLD = FIXTURES + 'own/';
const exp = HAS ? JSON.parse(readFileSync(DIR + 'expected-manual.json', 'utf8')) : {};
const cache = new Map<string, RgbaImage>();
const load = (path: string): RgbaImage => {
  if (!cache.has(path)) { const p = PNG.sync.read(readFileSync(path)); cache.set(path, { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }); }
  return cache.get(path)!;
};
const R: Record<string, string> = { common: 'c', uncommon: 'u', rare: 'r', epic: 'e', legendary: 'l', unknown: '?' };
function tokens(p: PanelRead): (string | null)[][] {
  return Array.from({ length: p.grid.rows }, (_, row) => Array.from({ length: p.grid.cols }, (_, col) => {
    if (p.hidden.some(h => h.row === row && h.col === col)) return 'H';
    const c = p.cells.find(x => x.row === row && x.col === col);
    return c ? `${c.count ?? c.tier ?? '-'}${R[c.rarity]}` : null;
  }));
}
/* ruční odečet return-findings.png */
const BACKPACK = [['2c', '60c', '1r', '3u'], ['-e', '80c', '80c', 'IVr'], ['80c', '1r', '3u', '3r'], ['80c', 'Ir', null, null]];
const QUICK = [['1r', '3u', '4c'], ['2u', null, null]];
const CTX = matchContext(getMaterials(defaultState()).map(m => m.name));

describe.skipIf(!HAS)('vlastní snímek po raidu: return-findings.png (1920×1080)', () => {
  const img = () => load(DIR + 'return-findings.png');
  const read = () => { const r = readCapture(img()); if (r.kind !== 'read') throw new Error('nečteno'); return r; };

  it('rozměr a druh obrazovky: FINDINGS → loot (dřív se odmítal, protože chyběl STASH)', () => {
    expect([img().width, img().height]).toEqual(exp.resolution);
    expect(screenKind(img())).toBe('findings');
    expect(read().screen).toBe('loot');
    expect(read().read.panels.map(p => p.panel)).toEqual(['backpack', 'quickUse']);
  });

  it('všechna viditelná políčka a počty: BACKPACK 14/14, QUICK USE 4/4', () => {
    const r = read().read;
    const bp = r.panels.find(p => p.panel === 'backpack')!, qu = r.panels.find(p => p.panel === 'quickUse')!;
    expect([bp.slots, bp.slotsMax]).toEqual([exp['return-findings'].backpackSlots, 14]);
    expect([qu.slots, qu.slotsMax]).toEqual([exp['return-findings'].quickUseSlots, 4]);
    expect(bp.cells).toHaveLength(14);
    expect(qu.cells).toHaveLength(4);
    expect(tokens(bp)).toEqual(BACKPACK);
    expect(tokens(qu)).toEqual(QUICK);
    expect([bp.hidden, qu.hidden, bp.empty, qu.empty].map(x => x.length)).toEqual([0, 0, 0, 0]);
    expect(r.warnings).not.toContain('countUnreadable');
  });

  it('hodnota loadoutu 55 551 ani váha 51/35 se nikde nečtou jako mince nebo výdělek', () => {
    const r = read().read;
    expect([r.coins, r.premium, r.stashValue]).toEqual([null, null, null]);
    expect(JSON.stringify(r)).not.toContain(String(exp['return-findings'].loadoutValue));
  });

  it('rozpoznání skupin z katalogu: známé názvy, neznámé zůstanou ke kontrole (ne hádání)', () => {
    const a = analyzeLoot(read().read, [], CTX);
    expect(a.groups.reduce((n, g) => n + g.cells.length, 0)).toBe(18);
    const named = Object.fromEntries(a.groups.filter(g => g.match.status === 'known').map(g => [itemKey(g.match.itemKey!, g.tier ?? undefined), g.count]));
    /* čtyři políčka Medium Ammo po 80 = 320; Anvil s tierem I */
    expect(named['Medium Ammo']).toBe(320);
    expect(named['Anvil I']).toBe(1);
    expect(named['Bandage']).toBe(2);
    expect(named['Adrenaline Shot']).toBe(4);
    /* epický předmět bez počtu a zbraň IV se neodhadují */
    expect(a.groups.filter(g => g.match.status === 'unknown').length).toBeGreaterThanOrEqual(2);
    expect(a.groups.reduce((n, g) => n + (g.count ?? 0), 0)).toBe(2 + 60 + 1 + 3 + 1 + 320 + 1 + 1 + 3 + 3 + 1 + 1 + 3 + 4 + 2);
  });

  it('odečtení výbavy: co hráč přinesl, se nezapíše jako loot; bez výbavy je nutná ruční kontrola', () => {
    const r = read().read;
    const a = analyzeLoot(r, [], CTX);
    const rows = lootRows(a.groups.filter(g => g.match.status === 'known').map(g => ({ id: g.id, name: itemKey(g.match.itemKey!, g.tier ?? undefined), qty: g.count ?? 1 })),
      [{ name: 'Medium Ammo', qty: 160 }, { name: 'Anvil I', qty: 1 }, { name: 'Bandage', qty: 2 }]);
    const items = lootItems(rows);
    expect(items.find(x => x.name === 'Medium Ammo')!.qty).toBe(160);
    expect(items.some(x => x.name === 'Anvil I' || x.name === 'Bandage')).toBe(false);
    const s = defaultState();
    s.profile.coins = exp.profile.coins;
    const sig = lootSignature(r);
    expect(checkRaidLoot(s, { raidId: null, items, replace: false, toInventory: false, gearChecked: false }, sig)).toBe('gearUnchecked');
    applyRaidLoot(s, { raidId: null, items, replace: false, toInventory: false, gearChecked: true }, sig, 1, 'R');
    expect(s.profile.coins).toBe(exp.profile.coins);
    expect(s.raids[0].coins).toBe(0);
    expect(checkRaidLoot(s, { raidId: 'R', items, replace: true, toInventory: false, gearChecked: true }, lootSignature(read().read))).toBe('duplicate');
  });
});

describe.skipIf(!HAS)('vlastní snímky: ostatní obrazovky', () => {
  it('MANAGE LOADOUT před raidem (zástupné ikony) není FINDINGS', () => {
    if (!existsSync(OLD + 'own-prerade-free-loadout.png')) return;
    expect(readCapture(load(OLD + 'own-prerade-free-loadout.png'))).toEqual({ kind: 'empty', reason: 'otherScreen' });
  });
  it('starší snímky FINDINGS: přežitý → loot, KNOCKED OUT → loot bez položek', () => {
    if (!existsSync(OLD + 'own-after-raid-knocked-out.png')) return;
    const ko = readCapture(load(OLD + 'own-after-raid-knocked-out.png'));
    expect(ko).toMatchObject({ kind: 'read', screen: 'loot' });
    if (ko.kind === 'read') expect(analyzeLoot(ko.read, [], CTX).empty).toBe(true);
    const ok = readCapture(load(OLD + 'own-after-raid-survived-findings.png'));
    expect(ok).toMatchObject({ kind: 'read', screen: 'loot' });
    if (ok.kind === 'read') expect(ok.read.panels.find(p => p.panel === 'backpack')!.cells).toHaveLength(14);
  });
  it('INVENTORY se STASH zůstává stash (čte se jen STASH)', () => {
    if (!existsSync(OLD + 'own-all-1-top.png')) return;
    const r = readCapture(load(OLD + 'own-all-1-top.png'));
    expect(r).toMatchObject({ kind: 'read', screen: 'stash' });
    if (r.kind === 'read') expect(r.read.panels.map(p => p.panel)).toEqual(['stash']);
  });
  it('žádný starší snímek inventáře se nečte jako obrazovka postupu', () => {
    for (const f of readdirSync(OLD).filter(x => x.endsWith('.png'))) expect(readProgress(load(OLD + f)), f).toBeNull();
    expect(readProgress(load(DIR + 'return-findings.png'))).toBeNull();
  });
});

/* 0.10.1: obrazovky postupu. Ručně odečtené hodnoty: own/return-and-progression/expected-manual.json. Každá obrazovka
   se čte v původním rozlišení i zmenšená a zvětšená (1366, 2560), návrh se páruje s daty aplikace. */
const prog = (f: string, width = 0): ProgressRead => {
  let img = load(DIR + f);
  if (width) img = resize(img, width, Math.round((img.height * width) / img.width));
  const r = readCapture(img);
  if (r.kind !== 'progress') throw new Error(f + ': ' + r.kind);
  return r.progress;
};
const SIZES = [0, 1366, 2560];

describe.skipIf(!HAS)('vlastní snímky: obrazovky postupu (0.10.1)', () => {
  it.each(SIZES)('profil: level 20, XP 2977/29000, mince 58 313 (šířka %i)', w => {
    const r = prog('profile.png', w);
    expect(r.screen).toBe('profile');
    const p = proposeProgress(r, defaultState()) as ProfileProposal;
    expect([p.level.value, p.xp.value, p.xpNext.value, p.coins.value]).toEqual([exp.profile.level, exp.profile.xp, exp.profile.xpNext, exp.profile.coins]);
    /* při 1366 px je malé písmo XP nejednoznačné (7 skoro jako 1): hodnota je správně, ale hráč ji potvrdí */
    const xc = w === 1366 ? 'medium' : 'high';
    expect([p.level.conf, p.xp.conf, p.xpNext.conf, p.coins.conf]).toEqual(['high', xc, xc, 'high']);
    const s = defaultState();
    applyProgress(s, { profile: { level: 20, xp: p.xp.value!, xpNext: p.xpNext.value!, coins: p.coins.value! } });
    expect(s.profile).toMatchObject({ level: 20, xp: 2977, xpNext: 29000, coins: 58313 });
    expect(defaultApply(p).profile).toEqual(w === 1366 ? { level: 20, coins: 58313 } : { level: 20, xp: 2977, xpNext: 29000, coins: 58313 });
  });

  it.each(SIZES)('skill tree: součty větví 0/17/4 jen pro kontrolu, nic se nezapisuje (šířka %i)', w => {
    const r = prog('skill-tree.png', w);
    expect(r.screen).toBe('skills');
    if (r.screen !== 'skills') return;
    const t = exp['skill-tree'];
    expect([r.totals.c.value, r.totals.m.value, r.totals.s.value]).toEqual([t.conditioning, t.mobility, t.survival]);
    expect(r.tooltip).toBeNull();
    const p = proposeProgress(r, defaultState()) as SkillsProposal;
    expect(p.skill).toBeNull();
    expect(defaultApply(p)).toEqual({});
  });

  it.each(SIZES)('skill-marathon-max: Marathon Runner V bez šipky = aktuální rank 5 (maximum) (šířka %i)', w => {
    const r = prog('skill-marathon-max.png', w);
    if (r.screen !== 'skills') throw new Error(r.screen);
    expect(r.tooltip).toMatchObject({ arrow: false, current: { value: 5 }, next: { value: null } });
    const p = proposeProgress(r, defaultState()) as SkillsProposal;
    expect(p.skill).toMatchObject({ id: 'm_marathon', name: exp['skill-marathon-max'].name, max: 5, now: 0, next: null, conf: 'high' });
    expect(p.skill!.current).toMatchObject({ value: exp['skill-marathon-max'].currentRank, conf: 'high' });
    expect(defaultApply(p)).toEqual({ skills: { m_marathon: 5 } });
  });

  it.each(SIZES)('skill-looters-partial: Looter’s Instincts III→IV = aktuální rank 3, IV je jen návrh (šířka %i)', w => {
    const r = prog('skill-looters-partial.png', w);
    if (r.screen !== 'skills') throw new Error(r.screen);
    expect(r.tooltip).toMatchObject({ arrow: true, current: { value: 3 }, next: { value: 4 } });
    const s = defaultState();
    s.skills.current = { s_craft: 1, s_silent: 2 };
    const p = proposeProgress(r, s) as SkillsProposal;
    expect(p.skill).toMatchObject({ id: 's_instincts', current: { value: exp['skill-looters-partial'].currentRank }, next: exp['skill-looters-partial'].nextRank });
    applyProgress(s, defaultApply(p));
    /* jen rank z tooltipu; skilly zakryté tooltipem ani ostatní ranky se nemění */
    expect(s.skills.current).toEqual({ s_craft: 1, s_silent: 2, s_instincts: 3 });
  });

  it.each(SIZES)('úkoly Shoring Up Defenses a Battening Down: zaškrtnuté cíle, nikdy „splněno“ (šířka %i)', w => {
    for (const [f, key] of [['quest-shoring.png', 'quest-shoring'], ['quest-battening.png', 'quest-battening']] as const) {
      const r = prog(f, w);
      if (r.screen !== 'quest') throw new Error(r.screen);
      expect(r.objectives).toEqual(exp[key].checkedObjectives);
      const s = defaultState();
      const p = proposeProgress(r, s, 'en') as QuestProposal;
      expect(p.title).toBe(exp[key].name);
      expect(p.trader).toBe(exp[key].vendor);
      /* při 1366 px je název čitelný hůř (E/F): úkol se pozná, ale jen s potvrzením hráčem */
      expect([p.countMatch, p.open, p.done]).toEqual([true, true, false]);
      expect(p.conf).toEqual(w === 1366 ? expect.stringMatching(/^(high|medium)$/) : 'high');
      /* nesplněný úkol v aplikaci: snímek nenabízí nic k zápisu (připnutí jen na přání) */
      expect(defaultApply(p)).toEqual({});
      /* omylem splněný v aplikaci: snímek s nezaškrtnutým cílem nabídne zrušení „splněno“ (předvybrané jen jisté) */
      s.quests.done[p.questId!] = 1;
      const q = proposeProgress(r, s) as QuestProposal;
      expect(defaultApply(q)).toEqual(q.conf === 'high' ? { questUndone: [p.questId] } : {});
      if (q.conf !== 'high') continue;
      applyProgress(s, defaultApply(q));
      expect(s.quests.done[p.questId!]).toBeUndefined();
    }
  });

  it.each(SIZES)('dílna: Gear Bench a Gunsmith úroveň 1 a materiály na další úroveň (šířka %i)', w => {
    for (const [f, key, id] of [['gear-level.png', 'gear-level', 'gear'], ['gunsmith-level.png', 'gunsmith-level', 'gunsmith']] as const) {
      const r = prog(f, w);
      expect(r.screen).toBe('station');
      const s = defaultState();
      const p = proposeProgress(r, s) as StationsProposal;
      expect(p.rows).toEqual([expect.objectContaining({ id, name: exp[key].station, value: exp[key].level, conf: 'high', now: 0 })]);
      expect(p.recipeMatch).toBe(true);
      expect(Object.fromEntries(p.resources!.map(x => [x.name, [x.have, x.need]]))).toEqual(exp[key].resources);
      applyProgress(s, defaultApply(p));
      expect(s.stations[id]).toBe(1);
      /* materiály jsou jen informace: zásoba v aplikaci se nemění */
      expect(s.inventory).toEqual(defaultState().inventory);
    }
  });

  it.each(SIZES)('přehled dílny: sedm stanic s úrovní I, Scrappy bez čísla; jisté jen stanice ověřené detailem (šířka %i)', w => {
    const r = prog('workshop-overview.png', w);
    if (r.screen !== 'workshop') throw new Error(r.screen);
    expect(r.tiles.map(x => [x.slot, x.level.value])).toEqual([[0, null], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]);
    const p = proposeProgress(r, defaultState()) as StationsProposal;
    expect(p.rows.map(x => [x.id, x.value, x.conf])).toEqual([
      ['scrappy', null, 'unknown'], ['gear', 1, 'high'], ['utility', 1, 'medium'], ['gunsmith', 1, 'high'], ['medical', 1, 'medium'], ['refiner', 1, 'medium'], ['explosives', 1, 'medium'],
    ]);
    expect(defaultApply(p)).toEqual({ stations: { gear: 1, gunsmith: 1 } });
  });
});
