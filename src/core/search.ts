/* Hledání všude (0.18.0, Ctrl+K): jeden index nad místními daty aplikace (předměty, úkoly, stanice, skilly a buildy,
   mapy, ARC, moduly, sekce nastavení, tipy rádce) a řazení výsledků. Čisté funkce, žádné React ani úložiště.
   - Hledá se bez ohledu na velikost písmen a diakritiku (fold) v českých i anglických názvech záznamu, takže
     „dilna“ najde „Dílna“ a „workshop“ najde totéž v češtině.
   - Řazení: přesná shoda, začátek názvu, začátek slova, část názvu, písmena v pořadí (zkratka „adv mech“) a slovo
     s jedním překlepem. Všechna slova dotazu musí sedět. Bonus má název před klíčovými slovy.
   - Výsledky jsou ve skupinách podle druhu; skupiny jdou podle nejlepšího výsledku.
   Moduly a sekce nastavení dodá UI (ikony a registr modulů jsou v shell/), tady je jen jejich index. */
import type { AppState, Lang } from './types';
import { catalogItems } from './catalog';
import { ITEM_DATA } from './data/itemdata';
import { QUESTS, PROJECTS, locText, questStatus } from './quests';
import { getArc, getStations } from './gamedata';
import { SKILLS } from './data/skills';
import { BUILD_CATALOG } from './data/builds';
import { MAPS } from './data/maps';
import { skillDesc } from './gametext';
import type { AdvisorTip } from './advisor';
import { LANGS, tl, tlOpt, type Key } from '../i18n';

export type SearchKind = 'item' | 'quest' | 'project' | 'station' | 'skill' | 'build' | 'map' | 'arc' | 'module' | 'setting' | 'tip';
/* Pořadí skupin při shodném skóre. */
export const SEARCH_KINDS: SearchKind[] = ['module', 'item', 'quest', 'station', 'tip', 'map', 'skill', 'build', 'project', 'arc', 'setting'];

/* Cíl výsledku: karta předmětu, cesta v aplikaci (#modul/podsekce) nebo tip rádce (jeho vlastní cíl). */
export type SearchTarget = { kind: 'item'; name: string } | { kind: 'route'; module: string; sub?: string } | { kind: 'tip'; id: string };

export interface SearchEntry {
  /* stálé id (druh:klíč), pod ním se pamatují nedávná hledání */
  id: string;
  kind: SearchKind;
  /* název v jazyce UI */
  title: string;
  /* krátký doplněk (typ, obchodník, stav …) v jazyce UI */
  sub?: string;
  /* všechny hledané názvy (oba jazyky, bez duplicit) */
  names: string[];
  /* další slova, která se hledají se slabší vahou (popis, mapy, obchodník) */
  keywords?: string;
  target: SearchTarget;
}

/* ----- normalizace ----- */
/* Malá písmena bez diakritiky, jen písmena a číslice oddělené mezerou („Příprava na raid“ → „priprava na raid“). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

interface Prepared { e: SearchEntry; names: { full: string; words: string[] }[]; kw: string; kwWords: string[] }
export interface SearchIndex { items: Prepared[] }

export function prepareIndex(entries: SearchEntry[]): SearchIndex {
  return {
    items: entries.map(e => {
      const names = [...new Set(e.names.map(fold).filter(Boolean))].map(full => ({ full, words: full.split(' ') }));
      const kw = fold(e.keywords ?? '');
      return { e, names, kw, kwWords: kw ? kw.split(' ') : [] };
    }),
  };
}

/* Vzdálenost úprav s prohozením sousedních znaků (optimal string alignment), s horní mezí. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/* Písmena dotazu v pořadí v textu; vrací počet mezer mezi nimi (−1 = nesedí). */
function subsequenceGaps(q: string, s: string): number {
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] !== q[i]) continue;
    if (last >= 0 && j > last + 1) gaps++;
    last = j; i++;
  }
  return i === q.length ? gaps : -1;
}

/* Skóre jednoho slova dotazu proti jednomu názvu (0 = nesedí). */
function tokenScore(tok: string, name: { full: string; words: string[] }): number {
  let best = 0;
  name.words.forEach((w, i) => {
    if (w === tok) best = Math.max(best, 100 - i);
    else if (w.startsWith(tok)) best = Math.max(best, 80 - i - (w.length - tok.length) * 0.5);
    else if (tok.length >= 3 && w.includes(tok)) best = Math.max(best, 50 - i);
    /* jeden překlep (u slov od 4 znaků), dva od 7 znaků */
    else if (tok.length >= 4) {
      const max = tok.length >= 7 ? 2 : 1;
      const dist = Math.min(editDistance(tok, w, max), w.length > tok.length ? editDistance(tok, w.slice(0, tok.length), max) : max + 1);
      if (dist <= max) best = Math.max(best, 35 - dist * 8 - i);
    }
  });
  return best;
}

/* Skóre záznamu pro dotaz (0 = nevyhovuje). Exportované kvůli testům řazení. */
export function scoreEntry(query: string, p: Prepared): number {
  const q = fold(query);
  if (!q) return 0;
  const toks = q.split(' ');
  let best = 0;
  for (const n of p.names) {
    let s = 0;
    if (n.full === q) s = 1000;
    else if (n.full.startsWith(q)) s = 800 - Math.min(100, n.full.length - q.length);
    else {
      /* každé slovo dotazu musí sedět na některé slovo názvu */
      let sum = 0, ok = true;
      for (const tk of toks) { const v = tokenScore(tk, n); if (!v) { ok = false; break; } sum += v; }
      if (ok) s = 300 + sum / toks.length + (n.full.includes(q) ? 100 : 0);
      else if (q.length >= 3) {
        /* zkratka: písmena dotazu (bez mezer) v pořadí v názvu */
        const g = subsequenceGaps(q.replace(/ /g, ''), n.full.replace(/ /g, ''));
        if (g >= 0 && g <= Math.max(2, toks.length + 1)) s = 150 - g * 20;
      }
    }
    best = Math.max(best, s);
  }
  if (!best && p.kwWords.length) {
    /* klíčová slova: všechna slova dotazu, jen začátky slov a celá slova (bez překlepů) */
    let sum = 0, ok = true;
    for (const tk of toks) {
      const v = p.kwWords.some(w => w === tk) ? 60 : tk.length >= 2 && p.kwWords.some(w => w.startsWith(tk)) ? 40 : 0;
      if (!v) { ok = false; break; }
      sum += v;
    }
    if (ok) best = 100 + sum / toks.length;
  }
  return best;
}

export interface SearchHit { entry: SearchEntry; score: number }
/* recent = nedávná hledání (prázdný dotaz) */
export interface SearchGroup { kind: SearchKind | 'recent'; hits: SearchHit[] }

/* Výsledky ve skupinách: v každé skupině nejvýš perGroup, celkem nejvýš max. */
export function searchIndex(index: SearchIndex, query: string, opts: { perGroup?: number; max?: number } = {}): SearchGroup[] {
  const perGroup = opts.perGroup ?? 6, max = opts.max ?? 40;
  if (!fold(query)) return [];
  const hits: SearchHit[] = [];
  for (const p of index.items) {
    const score = scoreEntry(query, p);
    if (score > 0) hits.push({ entry: p.e, score });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length || a.entry.title.localeCompare(b.entry.title));
  const groups = new Map<SearchKind, SearchHit[]>();
  for (const h of hits) {
    const g = groups.get(h.entry.kind) ?? [];
    if (g.length < perGroup) g.push(h);
    groups.set(h.entry.kind, g);
  }
  const out: SearchGroup[] = [...groups.entries()].map(([kind, list]) => ({ kind, hits: list }))
    .sort((a, b) => b.hits[0].score - a.hits[0].score || SEARCH_KINDS.indexOf(a.kind as SearchKind) - SEARCH_KINDS.indexOf(b.kind as SearchKind));
  let left = max;
  const capped: SearchGroup[] = [];
  for (const g of out) {
    if (left <= 0) break;
    capped.push({ kind: g.kind, hits: g.hits.slice(0, left) });
    left -= g.hits.length;
  }
  return capped;
}
/* Výsledky za sebou v pořadí zobrazení (pro šipky). */
export const flatHits = (groups: SearchGroup[]): SearchHit[] => groups.flatMap(g => g.hits);

/* ----- index ----- */
const uniq = (xs: (string | undefined)[]): string[] => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))];

/* Názvy předmětů: katalog, čísla předmětů, materiály aplikace a zásoba (bez duplicit podle malých písmen). */
export function itemNames(s: Pick<AppState, 'inventory' | 'items'>, materials: string[]): string[] {
  const out = new Map<string, string>();
  const add = (n: string) => { const k = n.trim().toLowerCase(); if (k && !out.has(k)) out.set(k, n.trim()); };
  catalogItems().forEach(c => add(c.name));
  ITEM_DATA.forEach(r => add(r.n));
  materials.forEach(add);
  Object.keys(s.inventory).forEach(add);
  Object.values(s.items).forEach(i => add(i.key));
  return [...out.values()];
}

export interface IndexInput {
  materials: string[];
  tips: AdvisorTip[];
  /* moduly a sekce nastavení z UI: názvy v obou jazycích */
  modules: { id: string; names: string[] }[];
  settings: { id: string; names: string[] }[];
}

export function buildIndex(s: AppState, lang: Lang, input: IndexInput): SearchEntry[] {
  const out: SearchEntry[] = [];
  const L = (k: Key, p?: Record<string, string | number>) => tl(lang, k, p);
  /* moduly */
  for (const m of input.modules) out.push({ id: 'module:' + m.id, kind: 'module', title: m.names[0], names: m.names, target: { kind: 'route', module: m.id } });
  /* předměty */
  const cat = new Map(catalogItems().map(c => [c.name.toLowerCase(), c]));
  const data = new Map(ITEM_DATA.map(r => [r.n.toLowerCase(), r]));
  for (const n of itemNames(s, input.materials)) {
    const c = cat.get(n.toLowerCase()), r = data.get(n.toLowerCase());
    out.push({ id: 'item:' + n, kind: 'item', title: n, sub: c?.type || r?.ty || undefined, names: [n], keywords: c?.type || r?.ty, target: { kind: 'item', name: n } });
  }
  /* úkoly a projekty */
  for (const q of QUESTS) {
    const st = questStatus(q, s.quests.done);
    out.push({
      id: 'quest:' + q.id, kind: 'quest', title: locText(q.name, lang), sub: `${q.trader} · ${L(`quests.status.${st}` as Key)}`,
      names: uniq([locText(q.name, 'cs'), locText(q.name, 'en')]),
      keywords: [q.trader, ...q.deliver.map(d => d[0]), ...q.questItems.map(d => d[0])].join(' '),
      target: { kind: 'route', module: 'quests', sub: 'q=' + q.id },
    });
  }
  for (const p of PROJECTS) out.push({ id: 'project:' + p.id, kind: 'project', title: locText(p.name, lang), names: uniq([locText(p.name, 'cs'), locText(p.name, 'en')]), target: { kind: 'route', module: 'quests', sub: 'projects' } });
  /* stanice (herní názvy) */
  for (const st of getStations(s.gameData)) {
    out.push({ id: 'station:' + st.id, kind: 'station', title: st.name, sub: L('search.stationLevel', { n: s.stations[st.id] ?? st.min, max: st.max }), names: [st.name], keywords: 'workshop dilna', target: { kind: 'route', module: 'workshop', sub: st.id } });
  }
  /* skilly a buildy */
  for (const sk of SKILLS) out.push({ id: 'skill:' + sk.id, kind: 'skill', title: sk.name, sub: skillDesc(sk, lang), names: [sk.name], keywords: `${skillDesc(sk, 'cs')} ${skillDesc(sk, 'en')}`, target: { kind: 'route', module: 'skills', sub: 'skill=' + sk.id } });
  for (const b of BUILD_CATALOG) out.push({ id: 'build:' + b.id, kind: 'build', title: b.name[lang], sub: L('search.buildCatalog'), names: uniq([b.name.cs, b.name.en]), keywords: b.tags.join(' '), target: { kind: 'route', module: 'skills', sub: 'builds' } });
  for (const b of s.skills.builds) out.push({ id: 'build:own:' + b.id, kind: 'build', title: b.name, sub: L('search.buildOwn'), names: [b.name], keywords: b.note, target: { kind: 'route', module: 'skills', sub: 'builds' } });
  /* mapy a ARC */
  for (const m of MAPS) out.push({ id: 'map:' + m.id, kind: 'map', title: m.name, names: [m.name], keywords: m.places, target: { kind: 'route', module: 'maps', sub: m.id } });
  for (const u of getArc(s.gameData, lang)) out.push({ id: 'arc:' + u.id, kind: 'arc', title: u.name, names: [u.name], target: { kind: 'route', module: 'arc' } });
  /* sekce nastavení */
  for (const x of input.settings) out.push({ id: 'setting:' + x.id, kind: 'setting', title: x.names[0], sub: 'Settings & Backup', names: x.names, target: { kind: 'route', module: 'settings', sub: x.id } });
  /* tipy rádce (název v obou jazycích) */
  for (const tip of input.tips) {
    out.push({
      id: 'tip:' + tip.id, kind: 'tip', title: tl(lang, tip.title.key, tip.title.params), sub: tl(lang, tip.detail.key, tip.detail.params),
      /* 0.25.0: druhý jazyk jen s načteným slovníkem (okno načítá slovník aktivního jazyka) */
      names: uniq([tl(lang, tip.title.key, tip.title.params), ...LANGS.filter(l => l !== lang).map(l => tlOpt(l, tip.title.key, tip.title.params) ?? '')].filter(Boolean)),
      keywords: [tl(lang, tip.detail.key, tip.detail.params), ...LANGS.filter(l => l !== lang).map(l => tlOpt(l, tip.detail.key, tip.detail.params) ?? '')].filter(Boolean).join(' '),
      target: { kind: 'tip', id: tip.id },
    });
  }
  return out;
}

/* ----- nedávná hledání (jen tento počítač: localStorage, ne stav ani záloha) ----- */
export const RECENT_KEY = 'arcops:search:recent';
export const RECENT_MAX = 8;
const ID_RE = /^[a-z]+:.{1,160}$/s;
export function parseRecent(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw || '[]');
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
export const pushRecent = (list: string[], id: string): string[] => (ID_RE.test(id) ? [id, ...list.filter(x => x !== id)].slice(0, RECENT_MAX) : list);
