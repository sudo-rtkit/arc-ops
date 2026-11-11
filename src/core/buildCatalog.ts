/* Katalog buildů: výběr varianty, porovnání s aktuálním stromem, filtr a řazení. Čisté funkce bez Reactu. */
import type { BuildTag, CatalogBuild, Points } from './types';
import { BUILD_CATALOG } from './data/builds';
import { SKILLS } from './data/skills';
import { resetCost, totalPoints } from './skills';

export const BUILD_TAGS: BuildTag[] = ['pvp', 'pve', 'solo', 'squad', 'loot', 'stealth', 'expedition', 'broken'];
export type BuildSort = 'default' | 'name' | 'difficulty' | 'fit';
export const BUILD_SORTS: BuildSort[] = ['default', 'name', 'difficulty', 'fit'];

export const hasVariant = (b: CatalogBuild): boolean => !!b.variant91;
/* Body buildu: základ, nebo varianta 91 (když existuje). */
export const buildPoints = (b: CatalogBuild, v91: boolean): Points => (v91 && b.variant91 ? b.variant91 : b.points);
/* Počet bodů, na který je build (76, nebo 91 u buildu jen pro Expedice / varianty). */
export const buildBudget = (b: CatalogBuild, v91: boolean): number => totalPoints(buildPoints(b, v91));

export interface DiffRow { id: string; have: number; want: number }
export interface TreeDiff {
  add: DiffRow[];          /* skilly, kterým chybí body */
  extra: DiffRow[];        /* skilly s body navíc (build je nechce, nebo méně) */
  addPoints: number;
  extraPoints: number;
  needsReset: boolean;     /* něco přebývá: bez resetu ve hře se k buildu nedostaneš */
  resetCost: number;       /* reset vrací všechny body aktuálního stromu, 2 000 za bod; 0 bez resetu */
  same: boolean;
}

/* Co přidat a co je navíc proti cílovému buildu. Pořadí řádků = pořadí skillů ve stromu. */
export function compareTree(cur: Points, target: Points): TreeDiff {
  const add: DiffRow[] = [];
  const extra: DiffRow[] = [];
  for (const s of SKILLS) {
    const have = cur[s.id] || 0;
    const want = target[s.id] || 0;
    if (want > have) add.push({ id: s.id, have, want });
    else if (have > want) extra.push({ id: s.id, have, want });
  }
  const addPoints = add.reduce((a, r) => a + r.want - r.have, 0);
  const extraPoints = extra.reduce((a, r) => a + r.have - r.want, 0);
  const needsReset = extra.length > 0;
  return { add, extra, addPoints, extraPoints, needsReset, resetCost: needsReset ? resetCost(cur) : 0, same: !add.length && !extra.length };
}

/* Filtr štítků: build musí mít všechny vybrané štítky. */
export const filterBuilds = (list: CatalogBuild[], tags: BuildTag[]): CatalogBuild[] =>
  list.filter(b => tags.every(t => b.tags.includes(t)));

export function sortBuilds(list: CatalogBuild[], sort: BuildSort, cur: Points, lang: 'cs' | 'en'): CatalogBuild[] {
  const out = [...list];
  if (sort === 'name') out.sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang));
  else if (sort === 'difficulty') out.sort((a, b) => a.difficulty - b.difficulty);
  else if (sort === 'fit') {
    /* Nejblíž mému stromu: nejdřív bez resetu (méně bodů k přidání), pak s resetem (méně bodů navíc). */
    const score = (b: CatalogBuild) => { const d = compareTree(cur, b.points); return d.needsReset ? 1000 + d.extraPoints * 10 + d.addPoints / 100 : d.addPoints; };
    out.sort((a, b) => score(a) - score(b));
  }
  return out;
}

export const catalogBuild = (id: string): CatalogBuild | undefined => BUILD_CATALOG.find(b => b.id === id);
