/* Původ hodnot (0.21.0, schéma 18): u každé získané nebo zadané hodnoty zdroj, čas, jistota a stav ověření hráčem.
   Čisté funkce nad stavem, bez DOM a Reactu.
   - Kompaktně: pro každou oblast (zásoba, vybavení, profil, stanice, skilly, úkoly, cíle úkolů, obsazenost bedny,
     záznamy raidů) mapa klíč → poslední záznam. Starší zdroj si záznam pamatuje jen o jeden krok (prev), a jen když
     se zdroj změnil. Navíc krátký deník posledních zápisů (log, nejvýš PROV_LOG_MAX dávek).
   - Zápis: store po každé akci porovná stav před a po (stampChanges) a změněné klíče označí zdrojem akce. Ruční
     úpravy tak mají původ bez zvláštního zapojení; importy a automatický zápis předají vlastní zdroj a jistotu.
     Čas a zdroj nastavuje vždy hlavní okno (store), nikdy overlay ani vstup akce.
   - Bez záznamu = výchozí hodnota (nikdy nezadaná). Starší stav dostane při načtení záznamy „migration“ s neznámým
     časem (0), kde stav čas nezná; kde ho zná (úkoly, bedna, raidy), použije ho.
   - Velikost: nejvýš PROV_MAX záznamů na oblast (nejstarší odpadnou), jistota na 2 desetinná místa. */
import type { AppState } from './types';
import { STATIONS } from './data/stations';
import { clampInt, isObj, safeEntries } from './util';

export type ProvSource = 'manual' | 'screenshot-hotkey' | 'screenshot-file' | 'auto-capture' | 'backup-import' | 'migration' | 'default';
export const PROV_SOURCES: readonly ProvSource[] = ['manual', 'screenshot-hotkey', 'screenshot-file', 'auto-capture', 'backup-import', 'migration', 'default'];
export const isProvSource = (v: unknown): v is ProvSource => typeof v === 'string' && (PROV_SOURCES as readonly string[]).includes(v);

export type ProvDomain = 'inv' | 'items' | 'profile' | 'stations' | 'skills' | 'quests' | 'objectives' | 'stash' | 'raids';
export const PROV_DOMAINS: readonly ProvDomain[] = ['inv', 'items', 'profile', 'stations', 'skills', 'quests', 'objectives', 'stash', 'raids'];
export const isProvDomain = (v: unknown): v is ProvDomain => typeof v === 'string' && (PROV_DOMAINS as readonly string[]).includes(v);

/* Jeden záznam. at = čas získání (0 = neznámý), conf = jistota 0–1 (chybí = neuvádí se, např. ruční zadání),
   ver = hodnotu potvrdil hráč (ruční zadání, potvrzená revize), prev = předchozí zdroj, pokud byl jiný. */
export interface ProvRec { src: ProvSource; at: number; conf?: number; ver: boolean; prev?: { src: ProvSource; at: number } }
/* Dávka zápisu v deníku: kdy, odkud, kolik hodnot a v jakých oblastech. */
export interface ProvLogEntry { at: number; src: ProvSource; n: number; dom: ProvDomain[] }
export interface ProvenanceState { recs: Record<ProvDomain, Record<string, ProvRec>>; log: ProvLogEntry[] }

export const PROV_MAX = 3000;
export const PROV_LOG_MAX = 50;
/* Ruční zápisy téhož druhu do minuty se v deníku sloučí do jedné dávky (klikání na šipky). */
export const PROV_LOG_MERGE_MS = 60_000;
/* Pole profilu, jejichž původ se sleduje. */
export const PROV_PROFILE_FIELDS = ['level', 'coins', 'xp', 'xpNext', 'rounds', 'expBonus', 'rewardPass', 'amplified'] as const;
const PROFILE_DEFAULT: Record<string, number> = { level: 1 };
const KEY_MAX = 130;

export const emptyProvenance = (): ProvenanceState => ({
  recs: { inv: {}, items: {}, profile: {}, stations: {}, skills: {}, quests: {}, objectives: {}, stash: {}, raids: {} },
  log: [],
});

const conf01 = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) / 100 : undefined;

export function normalizeRec(raw: unknown): ProvRec | null {
  if (!isObj(raw) || !isProvSource(raw.src)) return null;
  const rec: ProvRec = { src: raw.src, at: clampInt(raw.at || 0, 0, 9e15), ver: raw.ver === true };
  const c = conf01(raw.conf);
  if (c !== undefined) rec.conf = c;
  if (isObj(raw.prev) && isProvSource(raw.prev.src)) rec.prev = { src: raw.prev.src, at: clampInt(raw.prev.at || 0, 0, 9e15) };
  return rec;
}

/* Nejvýš PROV_MAX záznamů na oblast: odpadnou nejstarší (podle času). */
function cap(recs: Record<string, ProvRec>): Record<string, ProvRec> {
  const keys = Object.keys(recs);
  if (keys.length <= PROV_MAX) return recs;
  const keep = keys.sort((a, b) => recs[b].at - recs[a].at).slice(0, PROV_MAX);
  return Object.fromEntries(keep.map(k => [k, recs[k]]));
}

export function normalizeProvenance(raw: unknown): ProvenanceState {
  const out = emptyProvenance();
  if (!isObj(raw)) return out;
  const recs = isObj(raw.recs) ? raw.recs : {};
  for (const d of PROV_DOMAINS) {
    const m: Record<string, ProvRec> = {};
    for (const [k, v] of safeEntries(recs[d]).slice(0, PROV_MAX * 2)) {
      if (!k || k.length > KEY_MAX) continue;
      const r = normalizeRec(v);
      if (r) m[k] = r;
    }
    out.recs[d] = cap(m);
  }
  out.log = (Array.isArray(raw.log) ? raw.log : []).filter(isObj).slice(-PROV_LOG_MAX).flatMap((e): ProvLogEntry[] => {
    if (!isProvSource(e.src)) return [];
    const dom = (Array.isArray(e.dom) ? e.dom : []).filter((x): x is ProvDomain => (PROV_DOMAINS as readonly unknown[]).includes(x));
    return [{ at: clampInt(e.at || 0, 0, 9e15), src: e.src, n: clampInt(e.n || 0, 0, 1e6), dom: [...new Set(dom)] }];
  });
  return out;
}

/* ----- hodnoty oblastí (pro porovnání a pro „je hodnota zadaná“) ----- */
type Values = Map<string, string>;
const stationMin = (id: string): number => STATIONS.find(s => s.id === id)?.min ?? 0;

/* Hodnoty oblasti jako text (porovnání před a po). Chybějící klíč = výchozí hodnota. */
export function domainValues(s: AppState, d: ProvDomain): Values {
  const m: Values = new Map();
  switch (d) {
    case 'inv': for (const [k, n] of Object.entries(s.inventory)) if (n > 0) m.set(k, String(n)); break;
    case 'items': for (const [k, it] of Object.entries(s.items)) m.set(k, JSON.stringify(it)); break;
    case 'profile': for (const f of PROV_PROFILE_FIELDS) if (s.profile[f] !== (PROFILE_DEFAULT[f] ?? 0)) m.set(f, String(s.profile[f])); break;
    case 'stations': for (const [k, v] of Object.entries(s.stations)) if (v !== stationMin(k)) m.set(k, String(v)); break;
    case 'skills': for (const [k, v] of Object.entries(s.skills.current)) if (v > 0) m.set(k, String(v)); break;
    case 'quests': for (const [k, v] of Object.entries(s.quests.done)) if (v) m.set(k, '1'); break;
    case 'objectives': for (const [k, list] of Object.entries(s.quests.objectives)) for (const i of list) m.set(`${k}:${i}`, '1'); break;
    case 'stash': if (s.vision.stash) m.set('slots', `${s.vision.stash.used}/${s.vision.stash.max}`); break;
    /* plán raidu (0.15.0) se nepočítá: připojení nebo přesun vyhodnocení nemění získané údaje záznamu */
    case 'raids': for (const r of s.raids) m.set(r.id, JSON.stringify({ ...r, plan: undefined })); break;
  }
  return m;
}

/* Kontext zápisu: zdroj, ověření hráčem a jistota pro klíč (undefined = neuvádí se). */
/* unverified = oblasti, které i s ver = true zůstanou nepotvrzené (automatický zápis: záznam raidu čeká na frontu,
   počet kol je jen jeho důsledek). */
export interface ProvCtx { src: ProvSource; ver: boolean; conf?: (d: ProvDomain, key: string) => number | undefined; unverified?: readonly ProvDomain[] }
export const MANUAL: ProvCtx = { src: 'manual', ver: true };

function makeRec(ctx: ProvCtx, d: ProvDomain, key: string, now: number, old: ProvRec | undefined): ProvRec {
  const rec: ProvRec = { src: ctx.src, at: now, ver: ctx.ver && !ctx.unverified?.includes(d) };
  const c = conf01(ctx.conf?.(d, key));
  if (c !== undefined) rec.conf = c;
  const prev = old && old.src !== ctx.src ? { src: old.src, at: old.at } : old?.prev;
  if (prev) rec.prev = prev;
  return rec;
}

function addLog(p: ProvenanceState, src: ProvSource, n: number, dom: ProvDomain[], now: number) {
  if (!n) return;
  const last = p.log[p.log.length - 1];
  if (last && src === 'manual' && last.src === 'manual' && now - last.at <= PROV_LOG_MERGE_MS) {
    last.at = now; last.n += n; last.dom = [...new Set([...last.dom, ...dom])];
    return;
  }
  p.log = [...p.log, { at: now, src, n, dom }].slice(-PROV_LOG_MAX);
}

/* Po akci store: změněné klíče označí zdrojem kontextu. Odebraný předmět vybavení a smazaný raid záznam ztratí;
   vynulovaná zásoba nebo odškrtnutý cíl záznam dostanou (hráč hodnotu nastavil). Ruční úprava existujícího raidu
   jen potvrdí jeho údaje (zdroj a čas zůstanou), a to až když k němu nic nečeká ve frontě „Ke kontrole“.
   Vrací počet označených hodnot. */
export function stampChanges(before: AppState, after: AppState, ctx: ProvCtx, now: number): number {
  const p = after.provenance;
  let n = 0;
  const doms: ProvDomain[] = [];
  for (const d of PROV_DOMAINS) {
    const a = domainValues(before, d), b = domainValues(after, d);
    const recs = p.recs[d];
    let changed = 0;
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      if (a.get(k) === b.get(k)) continue;
      if (k.length > KEY_MAX) continue;
      const gone = !b.has(k);
      if (gone && (d === 'items' || d === 'raids')) { delete recs[k]; continue; }
      if (d === 'raids' && a.has(k) && ctx.src === 'manual') {
        const r = recs[k];
        if (r && !r.ver && !after.review.some(x => x.raidId === k)) { r.ver = true; changed++; }
        continue;
      }
      recs[k] = makeRec(ctx, d, k, now, recs[k]);
      changed++;
    }
    /* vyřízená fronta „Ke kontrole“ (i jen zahozením) potvrdí automatický záznam, i když se jeho údaje nezměnily */
    if (d === 'raids' && ctx.src === 'manual') {
      for (const x of before.review) {
        const r = x.raidId ? recs[x.raidId] : undefined;
        if (r && !r.ver && b.has(x.raidId!) && !after.review.some(y => y.raidId === x.raidId)) { r.ver = true; changed++; }
      }
    }
    if (changed) { n += changed; doms.push(d); p.recs[d] = cap(recs); }
  }
  addLog(p, ctx.src, n, doms, now);
  return n;
}

/* Starší stav (bez původu): zadané hodnoty dostanou zdroj „migration“. Čas jen tam, kde ho stav zná. */
export function seedMigration(s: AppState): ProvenanceState {
  const p = emptyProvenance();
  /* Čas raidu přes mapu (lineárně), ne hledáním v poli pro každé id: podvržená záloha se statisíci raidy by
     jinak zablokovala okno kvadratickou prací ještě před náhledem importu. */
  const raidTs = new Map<string, number>();
  for (const r of s.raids) if (!raidTs.has(r.id)) raidTs.set(r.id, r.ts);
  const known = (d: ProvDomain, k: string): number => {
    if (d === 'quests') return clampInt(s.quests.done[k] || 0, 0, 9e15);
    if (d === 'stash') return s.vision.stash?.at ?? 0;
    if (d === 'raids') return raidTs.get(k) ?? 0;
    return 0;
  };
  for (const d of PROV_DOMAINS) {
    for (const k of domainValues(s, d).keys()) if (k.length <= KEY_MAX) p.recs[d][k] = { src: 'migration', at: known(d, k), ver: false };
    p.recs[d] = cap(p.recs[d]);
  }
  return p;
}

/* Import zálohy: všechny zadané hodnoty dostanou zdroj „backup-import“ s časem importu. Původní zdroj ze zálohy
   zůstane jako prev, jistota a ověření se převezmou. */
export function stampImport(s: AppState, now: number): void {
  const old = s.provenance;
  const p = emptyProvenance();
  let n = 0;
  const doms: ProvDomain[] = [];
  for (const d of PROV_DOMAINS) {
    let c = 0;
    for (const k of domainValues(s, d).keys()) {
      if (k.length > KEY_MAX) continue;
      const o = old.recs[d][k];
      const rec: ProvRec = { src: 'backup-import', at: now, ver: o?.ver ?? false };
      if (o?.conf !== undefined) rec.conf = o.conf;
      if (o) rec.prev = { src: o.src, at: o.at };
      p.recs[d][k] = rec;
      c++;
    }
    p.recs[d] = cap(p.recs[d]);
    if (c) { n += c; doms.push(d); }
  }
  p.log = old.log.slice(-PROV_LOG_MAX);
  addLog(p, 'backup-import', n, doms, now);
  s.provenance = p;
}

/* Reset modulu: záznamy oblastí se zahodí (hodnoty jsou zase výchozí). */
export function clearDomains(s: AppState, doms: ProvDomain[]): void {
  for (const d of doms) s.provenance.recs[d] = {};
}

/* ----- čtení ----- */
export const provOf = (s: Pick<AppState, 'provenance'>, d: ProvDomain, key: string): ProvRec | null =>
  (Object.hasOwn(s.provenance.recs[d], key) ? s.provenance.recs[d][key] : null);

/* Nejnovější záznam z více klíčů (karta předmětu: materiál i předměty různých tierů). */
export function latestRec(s: Pick<AppState, 'provenance'>, keys: { d: ProvDomain; key: string }[]): ProvRec | null {
  let best: ProvRec | null = null;
  for (const { d, key } of keys) {
    const r = provOf(s, d, key);
    if (r && (!best || r.at > best.at)) best = r;
  }
  return best;
}

/* Nejnovější známý čas v oblastech (0 = žádný známý čas). */
export function latestAt(s: Pick<AppState, 'provenance'>, doms: ProvDomain[]): number {
  let at = 0;
  for (const d of doms) for (const r of Object.values(s.provenance.recs[d])) if (r.at > at) at = r.at;
  return at;
}

/* Přehled oblasti pro podrobný pohled: počty podle zdroje, neověřené a nejnovější čas. */
export interface ProvSummary { d: ProvDomain; total: number; bySrc: Partial<Record<ProvSource, number>>; unverified: number; latest: number }
export function provSummary(s: Pick<AppState, 'provenance'>): ProvSummary[] {
  return PROV_DOMAINS.map(d => {
    const list = Object.values(s.provenance.recs[d]);
    const bySrc: Partial<Record<ProvSource, number>> = {};
    for (const r of list) bySrc[r.src] = (bySrc[r.src] || 0) + 1;
    return { d, total: list.length, bySrc, unverified: list.filter(r => !r.ver).length, latest: list.reduce((a, r) => Math.max(a, r.at), 0) };
  });
}

/* Jistota řádku importu ze snímku STASH: shoda rozpoznání; nejistý počet ji sníží nejvýš na 50 %.
   Neznámý předmět, který hráč pojmenoval sám, jistotu nemá. */
export function visionConf(g: { match: { status: string; score: number }; countSure: boolean }): number | undefined {
  if (g.match.status === 'unknown') return undefined;
  return conf01(Math.min(g.match.score, g.countSure ? 1 : 0.5));
}

/* ----- 0.24.0: potvrzení hráčem ----- */
/* Záznam raidu, ke kterému čeká fronta „Ke kontrole“, se nepotvrzuje (potvrdí ho až vyřízení fronty). */
const waits = (s: Pick<AppState, 'review'>, d: ProvDomain, key: string) => d === 'raids' && s.review.some(x => x.raidId === key);
export const canConfirm = (s: Pick<AppState, 'provenance' | 'review'>, d: ProvDomain, key: string): boolean => {
  const r = provOf(s, d, key);
  return !!r && !r.ver && !waits(s, d, key);
};
/* Potvrdí jednu hodnotu: zdroj, čas a jistota zůstanou, jen ver = true. Vrací, jestli se něco změnilo. */
export function confirmValue(s: Pick<AppState, 'provenance' | 'review'>, d: ProvDomain, key: string): boolean {
  if (!isProvDomain(d) || typeof key !== 'string' || !canConfirm(s, d, key)) return false;
  s.provenance.recs[d][key].ver = true;
  return true;
}
/* Potvrdí všechny nepotvrzené hodnoty oblasti. Vrací počet potvrzených. */
export function confirmDomain(s: Pick<AppState, 'provenance' | 'review'>, d: ProvDomain): number {
  if (!isProvDomain(d)) return 0;
  let n = 0;
  for (const [k, r] of Object.entries(s.provenance.recs[d])) if (!r.ver && !waits(s, d, k)) { r.ver = true; n++; }
  return n;
}
