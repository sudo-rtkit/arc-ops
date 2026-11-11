/* Katalog buildů (0.8.0): každý build a varianta projde pravidly stromu, plán z buildu dosáhne přesně jeho bodů,
   popisy jsou v obou jazycích a klíče plánů se chovají správně. */
import { describe, expect, it } from 'vitest';
import { BUILD_CATALOG } from '../../src/core/data/builds';
import { PLANS, SKILL, SKILLS } from '../../src/core/data/skills';
import {
  addBlock, catalogPlanKey, catalogRef, catalogSteps, invalidNodes, isPlanKey, nextPlanPoint, planName, planSteps, planTarget, pointsIn,
  stepsFromBuild, totalPoints,
} from '../../src/core/skills';
import { BUILD_TAGS, buildBudget, buildPoints, compareTree, filterBuilds, sortBuilds } from '../../src/core/buildCatalog';
import type { BranchId, BuildText, CatalogBuild, PlanStep, Points } from '../../src/core/types';
import { setLang } from '../../src/i18n';

/* Spec: součty větví (Conditioning / Mobility / Survival). */
const TOTALS: Record<string, [number, number, number]> = {
  'aggressive-pvp': [24, 41, 11], 'balanced-raid': [31, 31, 14], 'looter-breach': [31, 14, 31], 'pve-loot': [31, 26, 19],
  'solo-survival': [14, 31, 31], 'silent-thief': [14, 31, 31], 'stamina-runner': [19, 41, 16], 'team-support': [31, 4, 41],
  'pvp-fighter': [31, 31, 14], 'expedition-pvp': [33, 41, 17], buldozer: [41, 31, 4], prizrak: [21, 41, 14],
};
const TOTALS_91: Record<string, [number, number, number]> = { buldozer: [41, 31, 19], prizrak: [21, 50, 20] };

function fillBy(steps: PlanStep[], budgetPts: number): Points {
  const prof = { level: budgetPts - 1, expBonus: 0 };
  const cur: Points = {};
  for (let g = 0; g < 200; g++) {
    const nx = nextPlanPoint(cur, steps);
    if (!nx || addBlock(cur, nx.id, prof)) break;
    cur[nx.id] = (cur[nx.id] || 0) + 1;
  }
  return cur;
}

function checkRules(points: Points, label: string) {
  expect(Object.keys(invalidNodes(points)), label).toEqual([]);
  for (const [id, n] of Object.entries(points)) {
    expect(SKILL[id], `${label}: ${id}`).toBeTruthy();
    expect(Number.isInteger(n) && n >= 1 && n <= SKILL[id].max, `${label}: ${id}=${n}`).toBe(true);
  }
  for (const b of ['c', 'm', 's'] as BranchId[]) {
    const inB = SKILLS.filter(s => s.b === b && (points[s.id] || 0) > 0);
    expect(inB.filter(s => s.t === 2).length, `${label}/${b}: volba`).toBeLessThanOrEqual(1);
    const ends = inB.filter(s => s.t === 4).length;
    expect(ends, `${label}/${b}: konce`).toBeLessThanOrEqual(2);
    const noEnd = pointsIn(points, b, { excludeEnd: true });
    if (ends >= 1) expect(noEnd, `${label}/${b}: práh 30`).toBeGreaterThanOrEqual(30);
    if (ends === 2) expect(noEnd + 1, `${label}/${b}: práh 40`).toBeGreaterThanOrEqual(40);
    /* Volba po 10 bodech jde jen ze startu a raných skillů (střední skilly se otevřou až po volbě). */
    if (inB.some(s => s.t === 2)) expect(inB.filter(s => s.t <= 1).reduce((a, s) => a + points[s.id], 0), `${label}/${b}: 10 před volbou`).toBeGreaterThanOrEqual(10);
    if (inB.some(s => s.t === 3)) expect(inB.some(s => s.t === 2), `${label}/${b}: střed bez volby`).toBe(true);
  }
}

const branchSums = (p: Points): [number, number, number] => [pointsIn(p, 'c'), pointsIn(p, 'm'), pointsIn(p, 's')];

describe('katalog buildů: pravidla stromu', () => {
  it('12 buildů s unikátním id a všemi součty ze spec', () => {
    expect(BUILD_CATALOG).toHaveLength(12);
    expect(new Set(BUILD_CATALOG.map(b => b.id)).size).toBe(12);
    expect(BUILD_CATALOG.map(b => b.id).sort()).toEqual(Object.keys(TOTALS).sort());
  });
  for (const b of BUILD_CATALOG) {
    describe(b.id, () => {
      const want = b.only91 ? 91 : 76;
      it(`základ: součet ${want}, větve ${TOTALS[b.id].join('/')}, bez neplatných uzlů`, () => {
        checkRules(b.points, b.id);
        expect(totalPoints(b.points)).toBe(want);
        expect(branchSums(b.points)).toEqual(TOTALS[b.id]);
        expect(buildBudget(b, false)).toBe(want);
      });
      it('plán z buildu dosáhne přesně jeho bodů (s rozpočtem buildu)', () => {
        const steps = catalogSteps(b, false);
        expect(fillBy(steps, want)).toEqual(b.points);
        expect(planTarget({}, steps)).toEqual(b.points);
        expect(fillBy(planSteps(catalogPlanKey(b), []), want)).toEqual(b.points);
      });
      if (b.variant91) {
        it(`varianta 91: součet 91, větve ${TOTALS_91[b.id].join('/')}, plán ji dosáhne`, () => {
          checkRules(b.variant91!, b.id + ':91');
          expect(totalPoints(b.variant91!)).toBe(91);
          expect(branchSums(b.variant91!)).toEqual(TOTALS_91[b.id]);
          expect(fillBy(planSteps(catalogPlanKey(b, true), []), 91)).toEqual(b.variant91);
          /* Varianta jen přidává: z 76 se na 91 dostaneš bez resetu. */
          expect(compareTree(b.points, b.variant91!).needsReset).toBe(false);
        });
      }
      it('3 klíčové skilly z buildu', () => {
        expect(b.keys).toHaveLength(3);
        for (const k of b.keys) expect(b.points[k] || 0, k).toBeGreaterThan(0);
      });
    });
  }
  it('Stamina Runner = přesný cíl vestavěného plánu runner', () => {
    const r = BUILD_CATALOG.find(b => b.id === 'stamina-runner')!;
    expect(r.plan).toBe('runner');
    expect(fillBy(PLANS.runner.steps, 76)).toEqual(r.points);
    expect(catalogPlanKey(r)).toBe('runner');
  });
  it('vestavěné plány runner a looter zůstávají a jdou rozdat bez chyb', () => {
    for (const k of ['runner', 'looter']) {
      const target = fillBy(planSteps(k), 76);
      expect(totalPoints(target)).toBe(76);
      expect(Object.keys(invalidNodes(target))).toEqual([]);
    }
  });
});

describe('katalog buildů: texty a zdroje', () => {
  const textFields = (d: BuildText) => [d.summary, d.playstyle, d.loadout, d.leveling, ...d.strengths, ...d.weaknesses, ...d.synergies, ...(d.notes ? [d.notes] : [])];
  for (const b of BUILD_CATALOG) {
    it(`${b.id}: název a popis v cs i en, stejná struktura`, () => {
      expect(b.name.cs.trim() && b.name.en.trim()).toBeTruthy();
      for (const lang of ['cs', 'en'] as const) {
        const d = b.desc[lang];
        expect(d, lang).toBeTruthy();
        for (const f of textFields(d)) expect(f.trim().length, `${b.id}/${lang}`).toBeGreaterThan(10);
        expect(d.strengths.length).toBeGreaterThanOrEqual(2);
        expect(d.weaknesses.length).toBeGreaterThanOrEqual(2);
        expect(d.synergies.length).toBeGreaterThanOrEqual(2);
      }
      const { cs, en } = b.desc;
      expect([en.strengths.length, en.weaknesses.length, en.synergies.length, !!en.notes]).toEqual([cs.strengths.length, cs.weaknesses.length, cs.synergies.length, !!cs.notes]);
      expect(/[áčďéěíňóřšťúůýž]/i.test(textFields(en).join(' ')), `${b.id}: čeština v en`).toBe(false);
      expect(/[áčďéěíňóřšťúůýž]/i.test(textFields(cs).join(' ')), `${b.id}: cs bez diakritiky?`).toBe(true);
    });
    it(`${b.id}: verze hry, datum, štítky, zdroj`, () => {
      expect(b.gameVersion).toBe('2.0–2.3');
      expect(b.source.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const t of b.tags) expect(BUILD_TAGS).toContain(t);
      expect([1, 2, 3]).toContain(b.difficulty);
      if (b.source.kind === 'web') {
        expect(b.source.refs.length).toBeGreaterThan(0);
        for (const r of b.source.refs) expect(r.url).toMatch(/^https:\/\/[a-z.]+\/$/);
      } else expect(b.source.refs).toEqual([]);
    });
  }
  it('vlastní buildy (Buldozer, Přízrak) jsou označené jako teorie a poctivě přiznávají neověřenou kombinaci', () => {
    const own = BUILD_CATALOG.filter(b => b.source.kind === 'own');
    expect(own.map(b => b.id)).toEqual(['buldozer', 'prizrak']);
    expect(BUILD_CATALOG.filter(x => x.theory).map(x => x.id)).toEqual(['buldozer', 'prizrak']);
    for (const b of own) {
      expect(b.theory).toBe(true);
      expect(b.tags).toContain('broken');
      expect(b.variant91).toBeTruthy();
      expect(b.desc.cs.notes).toMatch(/Teorie – vyzkoušej sám/);
      expect(b.desc.cs.notes).toMatch(/není ověřená ve hře/);
      expect(b.desc.en.notes).toMatch(/Theory - try it yourself/);
      expect(b.desc.en.notes).toMatch(/untested/);
    }
    const bul = own[0];
    expect(bul.desc.cs.notes).toMatch(/náhledových hodnot/);
    expect(bul.desc.en.notes).toMatch(/tree preview numbers/);
  });
  it('Přízrak: konce In The Flow + Wall Run, volby Vault Spring / Back On Your Feet / Quick Roll, smyčka hry a alternativa', () => {
    const p = BUILD_CATALOG.find(b => b.id === 'prizrak')!;
    expect(p.tags).toEqual(['pvp', 'broken']);
    const pick = (t: number) => SKILLS.filter(s => s.t === t && (p.points[s.id] || 0) > 0).map(s => s.id).sort();
    expect(pick(4)).toEqual(['m_flow', 'm_wallrun']);
    expect(pick(2)).toEqual(['c_feet', 'm_spring', 's_quickroll']);
    expect(compareTree(p.points, p.variant91!).add.map(r => r.id).sort()).toEqual(['m_roll', 'm_scrambler', 'm_swift', 's_ankles', 's_landing', 's_silent']);
    expect(p.desc.cs.playstyle).toMatch(/odstřel.*střech.*flank.*Quick Roll/s);
    expect(p.desc.en.playstyle).toMatch(/snipe.*roofs.*flank.*Quick Roll/s);
    expect(p.desc.cs.notes).toMatch(/In The Flow za Sprinting On Fumes/);
    expect(p.desc.en.notes).toMatch(/In The Flow for Sprinting On Fumes/);
  });
  it('názvy skillů v popisech jsou anglicky jako ve hře (každý zmíněný skill existuje)', () => {
    const names = SKILLS.map(s => s.name);
    for (const b of BUILD_CATALOG) for (const k of b.keys) expect(names).toContain(SKILL[k].name);
  });
});

describe('katalog buildů: klíče plánu, porovnání, filtr', () => {
  const bul = BUILD_CATALOG.find(b => b.id === 'buldozer')!;
  const exp = BUILD_CATALOG.find(b => b.id === 'expedition-pvp')!;
  it('klíče catalog:<id> a catalog:<id>:91', () => {
    expect(catalogPlanKey(bul)).toBe('catalog:buldozer');
    expect(catalogPlanKey(bul, true)).toBe('catalog:buldozer:91');
    expect(catalogPlanKey(exp, true)).toBe('catalog:expedition-pvp');
    expect(isPlanKey('catalog:buldozer')).toBe(true);
    expect(isPlanKey('catalog:buldozer:91')).toBe(true);
    expect(isPlanKey('catalog:expedition-pvp:91')).toBe(false);
    expect(isPlanKey('catalog:nope')).toBe(false);
    expect(isPlanKey('runner') && isPlanKey('looter')).toBe(true);
    expect(isPlanKey('build:x')).toBe(false);
    expect(isPlanKey('build:x', [{ id: 'x', name: 'X', note: '', points: {} }])).toBe(true);
    expect(catalogRef('catalog:buldozer:91')!.points).toBe(bul.variant91);
    expect(buildPoints(bul, true)).toBe(bul.variant91);
    expect(buildPoints(exp, true)).toBe(exp.points);
  });
  it('název plánu podle jazyka', () => {
    setLang('cs'); expect(planName('catalog:buldozer')).toBe('Buldozer');
    setLang('en'); expect(planName('catalog:buldozer:91')).toBe('Bulldozer (91)');
    setLang('cs');
  });
  it('stepsFromBuild u vlastních uložených buildů beze změny', () => {
    expect(stepsFromBuild({ c_used: 1 })).toEqual([{ id: 'c_used', to: 1 }]);
  });
  it('porovnání: co přidat, co je navíc, cena resetu 2 000 za bod', () => {
    const empty = compareTree({}, bul.points);
    expect(empty.needsReset).toBe(false);
    expect(empty.addPoints).toBe(76);
    expect(empty.resetCost).toBe(0);
    const cur: Points = { s_craft: 1, s_instincts: 5, s_silent: 4 };
    const d = compareTree(cur, bul.points);
    expect(d.needsReset).toBe(true);
    expect(d.extra).toEqual([{ id: 's_instincts', have: 5, want: 3 }, { id: 's_silent', have: 4, want: 0 }]);
    expect(d.extraPoints).toBe(6);
    expect(d.resetCost).toBe(10 * 2000);
    expect(d.addPoints).toBe(76 - 4);
    expect(compareTree(bul.points, bul.points).same).toBe(true);
  });
  it('filtr štítků (všechny vybrané) a řazení', () => {
    expect(filterBuilds(BUILD_CATALOG, []).length).toBe(12);
    expect(filterBuilds(BUILD_CATALOG, ['broken']).map(b => b.id)).toEqual(['buldozer', 'prizrak']);
    expect(filterBuilds(BUILD_CATALOG, ['expedition']).map(b => b.id)).toEqual(['expedition-pvp', 'buldozer']);
    expect(filterBuilds(BUILD_CATALOG, ['pvp', 'loot']).map(b => b.id)).toEqual(['balanced-raid', 'buldozer']);
    const byDiff = sortBuilds(BUILD_CATALOG, 'difficulty', {}, 'cs');
    expect(byDiff[0].difficulty).toBe(1);
    expect(byDiff[byDiff.length - 1].difficulty).toBe(3);
    expect(sortBuilds(BUILD_CATALOG, 'name', {}, 'en')[0].name.en).toBe('Aggressive PvP');
    const runner = BUILD_CATALOG.find(b => b.id === 'stamina-runner')!;
    expect(sortBuilds(BUILD_CATALOG, 'fit', runner.points, 'cs')[0].id).toBe('stamina-runner');
    expect(sortBuilds(BUILD_CATALOG, 'default', {}, 'cs').map(b => b.id)).toEqual(BUILD_CATALOG.map(b => b.id));
  });
  it('každý build se dá vybrat jako plán (typ CatalogBuild)', () => {
    const all: CatalogBuild[] = BUILD_CATALOG;
    for (const b of all) expect(isPlanKey(catalogPlanKey(b))).toBe(true);
  });
});
