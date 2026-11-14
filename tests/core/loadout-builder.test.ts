/* 0.23.0: loadout builder. Výpočty (hodnota, váha, riziko bez bezpečné kapsy, dostupnost ve skrýši), pravidla míst
   (výchozí počty podle obrazovek hry, volný loadout bez bezpečné kapsy, přepnutí druhu), porovnání, nákupní seznam,
   předvyplnění ze snímku (i z vlastních snímků hráče, jen lokálně), migrace na schéma 19 a loadout v Přípravě na raid. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  LOADOUT_PRESETS, compareLoadouts, emptyLoadout, itemFacts, loadoutFromScan, loadoutGear, loadoutHaveOf, loadoutShopping, loadoutSummary,
  normalizeLoadout, normalizeSlots, switchKind, usableSections,
} from '../../src/core/loadouts';
import { raidGear } from '../../src/core/lootImport';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { normalizePlanRecord } from '../../src/core/raidPrep';
import { knownRisk, loadoutOutcome, planLoadout, planRecord } from '../../src/core/raidEval';
import { readLoadout } from '../../src/core/vision/loadout';
import { loadoutSnap } from '../../src/core/raidLife';
import { matchContext } from '../../src/core/catalog';
import { getMaterials } from '../../src/core/gamedata';
import type { Loadout } from '../../src/core/types';
import type { RgbaImage } from '../../src/core/vision/image';

const NOW = Date.UTC(2026, 10, 14, 12);
const wName = (id: string) => ({ anvil: 'Anvil', ferro: 'Ferro' }[id] ?? id);
const none = () => 0;
const build = (x: Partial<Loadout>): Loadout => normalizeLoadout({ id: 'L', name: 'Test', ...x });

describe('0.23.0: údaje o předmětu z katalogu', () => {
  it('přesný název; zbraň bez tieru jen se stejnou hodnotou pro všechny tiery; neznámý předmět nic', () => {
    expect(itemFacts('Light Shield')).toEqual({ value: 640, weight: 5, stack: 1 });
    expect(itemFacts('light shield')).toEqual({ value: 640, weight: 5, stack: 1 });
    expect(itemFacts('Anvil II')).toEqual({ value: 7000, weight: 5, stack: 1 });
    /* Anvil I–IV: cena se liší (neznámá), váha je pro všechny tiery stejná (známá) */
    expect(itemFacts('Anvil')).toEqual({ value: null, weight: 5, stack: 1 });
    expect(itemFacts('Adrenaline Shot')).toEqual({ value: 300, weight: 0.2, stack: 5 });
    expect(itemFacts('Mystery Gadget')).toEqual({ value: null, weight: null, stack: 1 });
    expect(itemFacts('Mystery Gadget II')).toEqual({ value: null, weight: null, stack: 1 });
  });
});

describe('0.23.0: souhrn loadoutu', () => {
  const lo = build({
    augment: 'Looting Mk. 2', shield: 'Light Shield', primary: 'anvil', primaryTier: 'II', secondary: 'ferro',
    items: [{ name: 'Adrenaline Shot', qty: 7 }, { name: 'Mystery Gadget', qty: 1 }],
    quickUse: [{ name: 'Bandage', qty: 3 }],
    safe: [{ name: 'Agave', qty: 2 }],
  });

  it('hodnota = součet známých cen, neznámé se vypíšou; riziko bez bezpečné kapsy', () => {
    const s = loadoutSummary(lo, wName, none);
    /* 2000 + 640 + 7000 (Anvil II) + 7×300 + 3×250 + 2×1000; Ferro bez tieru a Mystery Gadget bez ceny */
    expect(s.value).toBe(2000 + 640 + 7000 + 2100 + 750 + 2000);
    expect(s.valueUnknown.sort()).toEqual(['Ferro', 'Mystery Gadget']);
    expect(s.safeValue).toBe(2000);
    expect(s.risk).toBe(s.value - 2000);
    expect(s.riskUnknown.sort()).toEqual(['Ferro', 'Mystery Gadget']);
    expect(s.free).toBe(false);
  });

  it('váha proti mezi (výchozí 30 kg vlastního loadoutu), na desetiny', () => {
    const s = loadoutSummary(lo, wName, none);
    /* 2 + 5 + 5 + 7×0.2 + 3×0.1 + 2×0.2; Ferro bez tieru: váha I–IV se neliší? jinak neznámá */
    const ferro = itemFacts('Ferro').weight;
    expect(s.weight).toBeCloseTo(2 + 5 + 5 + 1.4 + 0.3 + 0.4 + (ferro ?? 0), 5);
    expect(s.weightMax).toBe(30);
    expect(s.weightUnknown).toEqual(ferro === null ? ['Ferro', 'Mystery Gadget'] : ['Mystery Gadget']);
    expect(s.weightOver).toBe(s.weight > 30);
    const heavy = loadoutSummary({ ...lo, slots: { ...lo.slots, weight: 10 } }, wName, none);
    expect(heavy.weightOver).toBe(true);
    const unknownMax = loadoutSummary({ ...lo, slots: { ...lo.slots, weight: null } }, wName, none);
    expect([unknownMax.weightMax, unknownMax.weightOver]).toEqual([null, false]);
  });

  it('místa: stack se počítá do políček, plné místo se označí', () => {
    const s = loadoutSummary(lo, wName, none);
    const by = Object.fromEntries(s.slots.map(x => [x.section, x]));
    /* Adrenaline Shot 7 ks po 5 = 2 políčka, Mystery Gadget 1 */
    expect(by.backpack).toEqual({ section: 'backpack', used: 3, max: 20, over: false });
    expect(by.quickUse).toEqual({ section: 'quickUse', used: 1, max: 5, over: false });
    expect(by.safe).toEqual({ section: 'safe', used: 1, max: 3, over: false });
    const tight = loadoutSummary({ ...lo, slots: { ...lo.slots, backpack: 2 } }, wName, none);
    expect(tight.slots.find(x => x.section === 'backpack')!.over).toBe(true);
  });

  it('dostupnost ve skrýši: Zásoba i Vybavení, stejný předmět v různých místech se sečte, chybějící označené', () => {
    const st = {
      inventory: { 'Adrenaline Shot': 3, agave: 5 },
      items: { 'Anvil II': { key: 'Anvil II', name: 'Anvil', category: 'weapon' as const, tier: 'II' as const, count: 1 }, Bandage: { key: 'Bandage', name: 'Bandage', category: 'quickUse' as const, count: 1 } },
    };
    const two = { ...lo, items: [...lo.items, { name: 'Bandage', qty: 1 }] };
    const s = loadoutSummary(two, wName, loadoutHaveOf(st));
    const row = (n: string) => s.need.find(r => r.name === n)!;
    expect(row('Anvil II')).toEqual({ name: 'Anvil II', need: 1, have: 1, missing: 0 });
    expect(row('Adrenaline Shot')).toEqual({ name: 'Adrenaline Shot', need: 7, have: 3, missing: 4 });
    expect(row('Bandage')).toEqual({ name: 'Bandage', need: 4, have: 1, missing: 3 });
    expect(row('Agave')).toEqual({ name: 'Agave', need: 2, have: 5, missing: 0 });
    expect(s.missing.map(r => r.name).sort()).toEqual(['Adrenaline Shot', 'Bandage', 'Ferro', 'Light Shield', 'Looting Mk. 2', 'Mystery Gadget']);
  });

  it('název bez tieru splní kterýkoli tier, název s tierem jen ten tier', () => {
    const have = loadoutHaveOf({ inventory: {}, items: { a: { key: 'Ferro III', name: 'Ferro', category: 'weapon', tier: 'III', count: 1 }, b: { key: 'Ferro', name: 'Ferro', category: 'weapon', count: 1 } } });
    expect(have('Ferro')).toBe(2);
    expect(have('ferro iii')).toBe(1);
    expect(have('Ferro II')).toBe(0);
  });

  it('volný loadout: výbavu dává hra, riziko 0', () => {
    const s = loadoutSummary(switchKind(lo, 'free'), wName, none);
    expect([s.free, s.risk, s.riskUnknown]).toEqual([true, 0, []]);
    expect(s.weightMax).toBe(35);
  });

  it('prázdný loadout: nuly, nic nechybí', () => {
    const s = loadoutSummary(emptyLoadout(), wName, none);
    expect([s.value, s.weight, s.risk, s.need.length, s.missing.length]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('0.23.0: pravidla míst', () => {
  it('výchozí počty podle obrazovek hry: vlastní 20/5/1/3 a 30 kg, volný 14/4 bez bezpečné kapsy a 35 kg', () => {
    expect(LOADOUT_PRESETS.custom).toEqual({ backpack: 20, quickUse: 5, augmented: 1, safe: 3, weight: 30 });
    expect(LOADOUT_PRESETS.free).toEqual({ backpack: 14, quickUse: 4, augmented: 0, safe: 0, weight: 35 });
    expect(emptyLoadout().slots).toEqual(LOADOUT_PRESETS.custom);
    expect(emptyLoadout('free').slots).toEqual(LOADOUT_PRESETS.free);
  });

  it('bezpečná kapsa a augmented slots jen s počtem míst > 0 (nebo neznámým)', () => {
    expect(usableSections(emptyLoadout())).toEqual(['backpack', 'quickUse', 'augmented', 'safe']);
    expect(usableSections(emptyLoadout('free'))).toEqual(['backpack', 'quickUse']);
    expect(usableSections({ slots: { ...LOADOUT_PRESETS.free, safe: null } })).toEqual(['backpack', 'quickUse', 'safe']);
  });

  it('přepnutí na volný loadout: výchozí počty, předměty z míst, která nemá, se zahodí', () => {
    const lo = build({ items: [{ name: 'Bandage', qty: 1 }], safe: [{ name: 'Agave', qty: 1 }], augmented: [{ name: 'Smoke Grenade', qty: 1 }], slots: { backpack: 24, quickUse: 6, augmented: 1, safe: 3, weight: 40 } });
    const f = switchKind(lo, 'free');
    expect(f.kind).toBe('free');
    expect(f.slots).toEqual(LOADOUT_PRESETS.free);
    expect([f.items.length, f.safe, f.augmented]).toEqual([1, [], []]);
    expect(switchKind(f, 'custom').slots).toEqual(LOADOUT_PRESETS.custom);
  });

  it('normalizace počtů: chybějící = výchozí, výslovné null = neznámé, meze a desetiny', () => {
    expect(normalizeSlots(undefined, 'custom')).toEqual(LOADOUT_PRESETS.custom);
    expect(normalizeSlots({ backpack: null, weight: 31.26 }, 'custom')).toEqual({ ...LOADOUT_PRESETS.custom, backpack: null, weight: 31.3 });
    expect(normalizeSlots({ backpack: 999, quickUse: -1, safe: 'x', weight: 1e9 }, 'free')).toEqual({ backpack: 60, quickUse: null, augmented: 0, safe: null, weight: 500 });
  });
});

describe('0.23.0: porovnání a nákupní seznam', () => {
  const a = build({ name: 'A', items: [{ name: 'Bandage', qty: 5 }] });
  const b = build({ id: 'B', name: 'B', shield: 'Light Shield', items: [{ name: 'Bandage', qty: 10 }, { name: 'Mystery Gadget', qty: 1 }] });
  it('rozdíl B − A po údajích, neznámé ceny označené', () => {
    const rows = compareLoadouts(loadoutSummary(a, wName, none), loadoutSummary(b, wName, none));
    const by = Object.fromEntries(rows.map(r => [r.metric, r]));
    expect(by.value).toMatchObject({ a: 1250, b: 640 + 2500, diff: 640 + 2500 - 1250, unknownA: false, unknownB: true });
    expect(by.risk.diff).toBe(by.value.diff);
    expect(by.weight).toMatchObject({ a: 0.5, b: 6 });
    expect(by.missing).toMatchObject({ a: 5, b: 12 });
    expect(by.slots).toMatchObject({ a: 1, b: 3 });
  });
  it('do nákupního seznamu jen označené loadouty; stejný předmět = největší chybějící počet', () => {
    expect(loadoutShopping([a, b], wName, none)).toEqual([]);
    const rows = loadoutShopping([{ ...a, shop: true }, { ...b, shop: true }], wName, n => (n === 'Bandage' ? 2 : 0));
    expect(rows).toEqual([
      { name: 'Bandage', missing: 8, loadouts: ['A', 'B'] },
      { name: 'Light Shield', missing: 1, loadouts: ['B'] },
      { name: 'Mystery Gadget', missing: 1, loadouts: ['B'] },
    ]);
  });
});

describe('0.23.0: předvyplnění ze snímku', () => {
  const weapons = [{ id: 'anvil', name: 'Anvil' }, { id: 'ferro', name: 'Ferro' }];
  it('jen pojmenované řádky; zbraň podle názvu s tierem, neznámá pod svým názvem; počty míst z přečtených čísel', () => {
    const l = loadoutFromScan([
      { slot: 'augment', name: 'Looting Mk. 2', qty: 1 }, { slot: 'shield', name: '  ', qty: 1 },
      { slot: 'weapon1', name: 'Anvil II', qty: 1 }, { slot: 'weapon2', name: 'Kettle', qty: 1 },
      { slot: 'backpack', name: 'Bandage', qty: 3 }, { slot: 'backpack', name: 'Bandage', qty: 2 }, { slot: 'backpack', name: '', qty: 9 },
      { slot: 'quickUse', name: 'Adrenaline Shot', qty: 0 },
    ], { kind: 'custom', backpackMax: 22, quickUseMax: null, weightMax: 32.5 }, weapons);
    expect([l.augment, l.shield, l.primary, l.primaryTier, l.secondary, l.secondaryTier]).toEqual(['Looting Mk. 2', '', 'anvil', 'II', 'Kettle', '']);
    expect(l.items).toEqual([{ name: 'Bandage', qty: 5 }]);
    expect(l.quickUse).toEqual([{ name: 'Adrenaline Shot', qty: 1 }]);
    expect(l.slots).toEqual({ ...LOADOUT_PRESETS.custom, backpack: 22, weight: 32.5 });
  });
  it('volný loadout ze snímku: druh a výchozí počty volného loadoutu; nepoznaný druh nechá druh formuláře', () => {
    const base = build({ name: 'Mine', safe: [{ name: 'Agave', qty: 1 }] });
    const f = loadoutFromScan([], { kind: 'free', backpackMax: 14, quickUseMax: 4, weightMax: 35 }, weapons, base);
    expect([f.kind, f.name, f.safe]).toEqual(['free', 'Mine', []]);
    expect(f.slots).toEqual(LOADOUT_PRESETS.free);
    expect(loadoutFromScan([], { kind: 'unknown', backpackMax: null, quickUseMax: null, weightMax: null }, weapons, base).kind).toBe('custom');
  });

  const OWN = new URL('../fixtures/vision/own/', import.meta.url);
  const has = (n: string) => existsSync(new URL(n, OWN));
  const load = (n: string): RgbaImage => { const p = PNG.sync.read(readFileSync(new URL(n, OWN))); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
  const ctx = () => matchContext(getMaterials(defaultState()).map(m => m.name), []);
  const fromShot = (n: string) => {
    const r = readLoadout(load(n))!;
    const s = loadoutSnap(r, [], ctx(), 1);
    const rows = s.fields.filter(f => f.state === 'item' && f.name && (f.slot === 'shield' || f.slot === 'augment' || f.slot === 'backpack' || f.slot === 'quickUse'))
      .map(f => ({ slot: f.slot as 'shield', name: f.name!, qty: f.qty }));
    return loadoutFromScan(rows, { kind: r.kind, backpackMax: r.backpackMax, quickUseMax: r.quickUseMax, weightMax: r.weightMax }, weapons);
  };
  it.skipIf(!has('own-manage-loadout-custom-empty.png'))('vlastní snímek: prázdný vlastní loadout = 20/5 a 30 kg, žádný předmět', () => {
    const l = fromShot('own-manage-loadout-custom-empty.png');
    expect([l.kind, l.slots.backpack, l.slots.quickUse, l.slots.weight, l.items.length, l.quickUse.length]).toEqual(['custom', 20, 5, 30, 0, 0]);
  });
  it.skipIf(!has('own-manage-loadout-free.png'))('vlastní snímek: volný loadout = 14/4 a 35 kg, náhodná místa zůstanou prázdná', () => {
    const l = fromShot('own-manage-loadout-free.png');
    expect([l.kind, l.slots.backpack, l.slots.quickUse, l.slots.safe, l.slots.weight, l.items.length]).toEqual(['free', 14, 4, 0, 35, 0]);
  });
  it.skipIf(!has('own-after-raid-survived-findings-2.png'))('vlastní snímek FINDINGS: štít a obsah batohu se předvyplní', () => {
    const l = fromShot('own-after-raid-survived-findings-2.png');
    expect(l.shield).toBe('Light Shield');
    expect(l.items.find(i => i.name === 'Heavy Ammo')?.qty).toBe(27);
    expect([l.slots.backpack, l.slots.quickUse, l.slots.weight]).toEqual([14, 4, 35]);
  });
});

describe('0.23.0: schéma 19 a zálohy', () => {
  it('starší loadout (schéma 18) dostane druh, tiery, prázdná místa a výchozí počty; účel Free Loadout = volný', () => {
    expect(SCHEMA).toBe(19);
    const st = normalize({ schema: 18, loadouts: [
      { id: 'a', name: 'Old', purpose: 'Money run', primary: 'anvil', items: [{ name: 'Bandage', qty: 2 }] },
      { id: 'b', name: 'Free', purpose: 'Free Loadout' },
    ] }, NOW);
    expect(st.schema).toBe(19);
    const [a, b] = st.loadouts;
    expect(a).toMatchObject({ kind: 'custom', primaryTier: '', secondaryTier: '', quickUse: [], augmented: [], safe: [], shop: false, slots: LOADOUT_PRESETS.custom, items: [{ name: 'Bandage', qty: 2 }] });
    expect(b).toMatchObject({ kind: 'free', slots: LOADOUT_PRESETS.free });
  });
  it('záloha nese loadouty builderu beze změny; novější schéma se odmítne', () => {
    const s = defaultState(NOW);
    s.loadouts = [build({ kind: 'free', quickUse: [{ name: 'Bandage', qty: 1 }], primaryTier: 'III', shop: true, slots: { ...LOADOUT_PRESETS.free, weight: 36 } })];
    const back = parseBackup(makeBackup(s, new Date(NOW)), NOW);
    if ('error' in back) throw new Error(back.error);
    expect(back.state.loadouts).toEqual(s.loadouts);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 20, state: {} }), NOW)).toHaveProperty('error');
  });
  it('výbava do zápisu raidu: zbraně, augment, štít a předměty ze všech míst; loot ze snímku odečte batoh i quick use', () => {
    const l = build({ primary: 'anvil', primaryTier: 'II', augment: 'Aug', items: [{ name: 'Bandage', qty: 1 }], quickUse: [{ name: 'Bandage', qty: 2 }], safe: [{ name: 'Agave', qty: 1 }] });
    expect(loadoutGear(l, wName)).toEqual([{ name: 'Anvil II', qty: 1 }, { name: 'Aug', qty: 1 }, { name: 'Bandage', qty: 3 }, { name: 'Agave', qty: 1 }]);
    expect(raidGear({ gear: [], loadout: 'L' }, [l])).toEqual({ items: [{ name: 'Bandage', qty: 1 }, { name: 'Bandage', qty: 2 }], source: 'loadout' });
  });
});

describe('0.23.0: loadout v Přípravě na raid a ve vyhodnocení', () => {
  it('plán s loadoutem: souhrn nad zásobou, známé riziko, výsledek podle záznamu raidu; záznam plánu nese riziko', () => {
    const s = defaultState(NOW);
    s.loadouts = [build({ id: 'L1', shield: 'Light Shield', items: [{ name: 'Bandage', qty: 2 }], safe: [{ name: 'Agave', qty: 1 }] })];
    s.inventory = { Bandage: 1 };
    const lo = planLoadout(s, 'L1')!;
    expect(lo.name).toBe('Test');
    expect(lo.sum.missing.map(m => `${m.name}:${m.missing}`).sort()).toEqual(['Agave:1', 'Bandage:1', 'Light Shield:1']);
    expect(knownRisk(lo.sum)).toBe(640 + 500);
    expect(planLoadout(s, '')).toBeNull();
    expect(planLoadout(s, 'deleted')).toBeNull();
    expect(knownRisk(loadoutSummary(build({ items: [{ name: 'Mystery Gadget', qty: 1 }] }), wName, none))).toBeNull();
    expect([loadoutOutcome({ ok: false }), loadoutOutcome({ ok: true }), loadoutOutcome(null)]).toEqual(['lost', 'kept', null]);
    const plan = { goals: { quests: [], stations: [], projects: [], money: true }, map: 'dam', loadout: 'L1', route: '', startedAt: NOW, sig: '', found: [], snap: [], open: [] };
    const ev = { source: 'stock' as const, raidId: null, legacy: false, rows: [], need: 0, found: 0, missing: 0, done: [], kind: 'all' as const, value: null, extra: {} };
    expect(planRecord(s, plan, ev, 'cs', '2026-11-14').risk).toBe(1140);
    expect('risk' in planRecord(s, { ...plan, loadout: '' }, ev, 'cs', '2026-11-14')).toBe(false);
  });
  it('záznam plánu: riziko jen číslo nebo null, starší záznam bez pole zůstane bez něj', () => {
    expect(normalizePlanRecord({ at: 1, risk: 1234.4 }).plan!.risk).toBe(1234);
    expect(normalizePlanRecord({ at: 1, risk: null }).plan!.risk).toBeNull();
    expect('risk' in normalizePlanRecord({ at: 1 }).plan!).toBe(false);
    expect('risk' in normalizePlanRecord({ at: 1, risk: 'x' }).plan!).toBe(false);
  });
});
