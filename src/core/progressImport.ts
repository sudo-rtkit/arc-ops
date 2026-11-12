/* Postup ze snímku (0.10.1): přečtená obrazovka (core/vision/progress.ts) se spáruje s daty aplikace a stane se z ní
   návrh ke kontrole. Každé pole má jistotu: 'high' = přečteno a ověřeno, 'medium' = přečteno, ale potřebuje potvrzení
   hráčem, 'unknown' = nepřečteno nebo nesedí s daty (ukáže se jako „?“ a nikdy se nezapíše). Zapisuje se až po
   výslovném potvrzení (applyProgress) a jen to, co hráč vybral:
   - profil: level, XP, XP na další level, mince;
   - dílna: úrovně stanic (přehled i detail stanice); materiály z detailu jsou informace. 0.12.0: název materiálu se
     přečte ze snímku a přiřadí jen ke známému názvu (přibližná shoda s materiály a katalogem, nikdy vymyšlený); každé
     pole má vlastní jistotu. Jistý název i jistý počet „mám“ se nabídne jako volitelný zápis do Zásoby (nikdy
     předvybraný; zápis jde přes stejnou revizi a snímek stavu jako ostatní);
   - skill tree: rank skillu jen z tooltipu skillu; součty větví z přehledu jen pro kontrolu;
   - úkol (0.10.2): zaškrtnuté cíle se navrhnou k zaškrtnutí v aplikaci (jen když počet cílů sedí s daty; jistý úkol
     předvybraný, nejistý po potvrzení). Nezaškrtnutý cíl, který je v aplikaci zaškrtnutý, se nabídne k odškrtnutí,
     nikdy předvybraný. Úkol se nikdy neoznačí jako splněný, ani když jsou zaškrtnuté všechny cíle: obrazovka úkolu
     splnění neukazuje (splněný úkol u obchodníka už není), takže „označit splněný“ se nenabízí vůbec. Jisté je jen to,
     že úkol s nezaškrtnutým cílem splněný není. Čistá logika bez UI. */
import type { AppState, BranchId } from './types';
import type { ProgressRead, Read } from './vision/progress';
import { QUESTS, locText, questById, setObjective } from './quests';
import { SKILLS } from './data/skills';
import { STATIONS } from './data/stations';
import { AT_HIDEOUT, type Loc } from './data/arctracker';
import { branchTotals } from './skills';
import { LIMITS } from './state';
import { nameDistance } from './catalog';
import { getMaterials, getStations } from './gamedata';
import { catalogItems } from './catalog';
import { clampInt } from './util';

export type Conf = 'high' | 'medium' | 'unknown';
export interface PField<T> { value: T | null; conf: Conf; raw: string }
/* Hranice jistoty znaků: od 0,6 je čtení jisté, od 0,45 nejisté (potřebuje potvrzení), níž neznámé. */
export const CONF_HIGH = 0.6;
export const CONF_MEDIUM = 0.45;
export const confOf = (r: Read<unknown>): Conf => (r.value === null ? 'unknown' : r.conf >= CONF_HIGH ? 'high' : r.conf >= CONF_MEDIUM ? 'medium' : 'unknown');
const field = <T>(r: Read<T>, ok: (v: T) => boolean = () => true): PField<T> => {
  const c = confOf(r);
  return c === 'unknown' || r.value === null || !ok(r.value) ? { value: null, conf: 'unknown', raw: r.raw } : { value: r.value, conf: c, raw: r.raw };
};
const lower = (a: Conf, b: Conf): Conf => (a === 'unknown' || b === 'unknown' ? 'unknown' : a === 'medium' || b === 'medium' ? 'medium' : 'high');
const inRange = (lim: readonly [number, number]) => (v: number) => v >= lim[0] && v <= lim[1];

/* Přibližná shoda přečteného textu se seznamem: nejbližší název, jen když je dost blízko a jasně lepší než druhý. */
export function bestMatch<T>(read: string, items: T[], name: (x: T) => string): { item: T; dist: number } | null {
  const len = read.replace(/[^A-Z0-9?]/gi, '').length;
  if (len < 3) return null;
  const scored = items.map(item => ({ item, dist: nameDistance(read, name(item)) })).sort((a, b) => a.dist - b.dist);
  const [a, b] = scored;
  if (!a || a.dist > Math.max(1, len * 0.25)) return null;
  if (b && b.dist - a.dist < 1.5) return null;
  return a;
}
const en = (v: Loc) => (typeof v === 'string' ? v : v.en);

/* ----- návrhy ----- */
export interface ProfileProposal {
  kind: 'profile';
  level: PField<number>; xp: PField<number>; xpNext: PField<number>; coins: PField<number>;
  /* hodnoty v aplikaci */
  now: { level: number; xp: number; xpNext: number; coins: number };
}
export interface StationRow { id: string; name: string; value: number | null; conf: Conf; now: number; min: number; max: number }
/* Materiál na další úroveň z detailu stanice: název (přečtený a přiřazený ke známému názvu, nebo z dat úrovně), počty
   ze hry s jistotou každého pole a zásoba v aplikaci. source: 'read' = název ze snímku, 'data' = jen z dat úrovně
   (počty sedí, název nepřečten), null = neznámý. stockOffer = jistý název materiálu i jistý počet „mám“: jde nabídnout
   zápis do Zásoby. */
export interface ResourceRow {
  name: string | null; nameConf: Conf; nameRaw: string; source: 'read' | 'data' | null;
  have: number | null; haveConf: Conf; need: number | null; needConf: Conf;
  stock: number; stockOffer: boolean;
}
export interface StationsProposal {
  kind: 'stations'; source: 'overview' | 'detail';
  rows: StationRow[];
  /* detail: přečtený název stanice (když neodpovídá žádné sledované stanici) */
  title?: string;
  resources?: ResourceRow[];
  /* materiály na obrazovce odpovídají datům pro další úroveň */
  recipeMatch?: boolean;
}
export interface QuestProposal {
  kind: 'quest';
  questId: string | null; conf: Conf; title: string; trader: string | null;
  /* cíle ze snímku v pořadí; text z dat, když počet sedí */
  /* stored = cíl je zaškrtnutý v aplikaci (jen když počet sedí, jinak false) */
  objectives: { text: string | null; checked: boolean | null; stored: boolean }[];
  countMatch: boolean;
  /* stav v aplikaci */
  done: boolean; pinned: boolean;
  /* obrazovka ukazuje nezaškrtnutý cíl: úkol jistě není splněný */
  open: boolean;
}
export interface SkillsProposal {
  kind: 'skills';
  totals: Record<BranchId, { read: number | null; conf: Conf; now: number }>;
  skill: { id: string | null; name: string; current: PField<number>; next: number | null; max: number; now: number; conf: Conf } | null;
}
export type ProgressProposal = ProfileProposal | StationsProposal | QuestProposal | SkillsProposal;

/* Pořadí dlaždic v přehledu dílny (slot 0 = Scrappy, 1–7 = stanice). Workbench aplikace nesleduje.
   Pořadí ověřené detailem stanice (Gear Bench = 2., Gunsmith = 4.) je jisté; ostatní stanice podle ikon v pořadí
   a hráč je potvrzuje. */
export const WORKSHOP_SLOTS: (string | null)[] = ['scrappy', null, 'gear', 'utility', 'gunsmith', 'medical', 'refiner', 'explosives'];
const SLOT_SURE = new Set(['scrappy', 'gear', 'gunsmith']);
/* Názvy stanic aplikace a jejich protějšky v datech dílny (pro materiály). */
const AT_ID: Record<string, string> = { gear: 'equipment_bench', gunsmith: 'weapon_bench', medical: 'med_station', refiner: 'refiner', utility: 'utility_bench', explosives: 'explosives_bench', scrappy: 'scrappy', research: 'research_station' };
const TRADERS = [...new Set(QUESTS.map(q => q.trader))];

export function proposeProgress(read: ProgressRead, s: AppState, lang: 'cs' | 'en' = 'cs'): ProgressProposal {
  const stations = getStations(s.gameData);
  const stationRow = (id: string, r: Read<number>, sure: boolean): StationRow => {
    const st = stations.find(x => x.id === id) ?? STATIONS.find(x => x.id === id)!;
    const f = field(r, v => v >= st.min && v <= st.max);
    return { id, name: st.name, value: f.value, conf: f.conf === 'high' && !sure ? 'medium' : f.conf, now: s.stations[id] ?? st.min, min: st.min, max: st.max };
  };
  switch (read.screen) {
    case 'profile': {
      const p = s.profile;
      /* XP a XP na další level jsou z jednoho údaje „a/b“: platí obě, nebo žádná */
      const xpOk = read.xp.value !== null && read.xpNext.value !== null && read.xp.value <= read.xpNext.value;
      const fx = field(read.xp, inRange(LIMITS.xp)), fn = field(read.xpNext, inRange(LIMITS.xpNext));
      const both = xpOk && fx.conf !== 'unknown' && fn.conf !== 'unknown';
      const xc = both ? lower(fx.conf, fn.conf) : 'unknown';
      return {
        kind: 'profile',
        level: field(read.level, inRange(LIMITS.level)),
        xp: both ? { ...fx, conf: xc } : { value: null, conf: 'unknown', raw: read.xp.raw },
        xpNext: both ? { ...fn, conf: xc } : { value: null, conf: 'unknown', raw: read.xpNext.raw },
        coins: field(read.coins, inRange(LIMITS.coins)),
        now: { level: p.level, xp: p.xp, xpNext: p.xpNext, coins: p.coins },
      };
    }
    case 'workshop': {
      const rows = read.tiles.flatMap(t => {
        const id = WORKSHOP_SLOTS[t.slot];
        return id ? [stationRow(id, t.level, SLOT_SURE.has(id))] : [];
      });
      return { kind: 'stations', source: 'overview', rows };
    }
    case 'station': {
      const m = read.title.value ? bestMatch(read.title.value, stations, x => x.name) : null;
      const out: StationsProposal = { kind: 'stations', source: 'detail', rows: [], title: read.title.value ?? '' };
      if (!m) return out;
      const st = m.item;
      /* úroveň z hlavičky a z názvu v panelu; obě musí sedět, jedna stačí jen s potvrzením */
      const a = field(read.level), b = field(read.panelLevel);
      let lvl: PField<number>;
      if (a.value !== null && b.value !== null) lvl = a.value === b.value ? { value: a.value, conf: lower(a.conf, b.conf), raw: a.raw } : { value: null, conf: 'unknown', raw: `${a.raw}/${b.raw}` };
      else lvl = a.value !== null ? { ...a, conf: 'medium' } : b.value !== null ? { ...b, conf: 'medium' } : a;
      /* materiály na další úroveň: porovnání s daty (názvy podle dat, jen když počty potřeby sedí) */
      const want = lvl.value !== null ? AT_HIDEOUT.find(x => x.id === AT_ID[st.id])?.levels.find(x => x.level === lvl.value! + 1)?.req ?? null : null;
      const needs = read.resources.map(r => r.need.value);
      const recipeMatch = !!want && want.length === needs.length && want.every(([, n], i) => n === needs[i]);
      if (recipeMatch && lvl.conf === 'medium' && m.dist <= 1) lvl = { ...lvl, conf: 'high' };
      const mats = new Set(getMaterials(s).map(x => x.name));
      const known = [...new Set([...mats, ...catalogItems().map(x => x.name)])];
      const resources: ResourceRow[] = read.resources.map((r, i) => {
        const fromData = recipeMatch ? want![i][0] : null;
        const h = field(r.have), n = field(r.need);
        const m = r.name.value ? bestMatch(r.name.value, known, x => x) : null;
        let name: string | null = null, nameConf: Conf = 'unknown', source: ResourceRow['source'] = null;
        if (m) {
          name = m.item; source = 'read';
          /* jisté: shoda s daty úrovně, nebo skoro přesně přečtený název, kterému data neodporují */
          nameConf = m.item === fromData ? 'high' : m.dist <= 1 && !fromData && confOf(r.name) !== 'unknown' ? 'high' : 'medium';
        } else if (fromData) { name = fromData; nameConf = 'medium'; source = 'data'; }
        const stockOffer = !!name && nameConf === 'high' && mats.has(name) && h.conf === 'high' && h.value !== null && inRange(LIMITS.inventory)(h.value);
        return {
          name, nameConf, nameRaw: r.name.raw, source, have: h.value, haveConf: h.conf, need: n.value, needConf: n.conf,
          stock: name ? s.inventory[name] || 0 : 0, stockOffer,
        };
      });
      const f = lvl.value !== null && (lvl.value < st.min || lvl.value > st.max) ? { value: null, conf: 'unknown' as Conf } : lvl;
      out.rows = [{ id: st.id, name: st.name, value: f.value, conf: m.dist <= 1 ? f.conf : lower(f.conf, 'medium'), now: s.stations[st.id] ?? st.min, min: st.min, max: st.max }];
      out.resources = resources;
      out.recipeMatch = recipeMatch;
      return out;
    }
    case 'quest': {
      const tr = read.trader.value ? bestMatch(read.trader.value, TRADERS, x => x) : null;
      const pool = tr ? QUESTS.filter(q => q.trader === tr.item) : QUESTS;
      const m = read.title.value ? bestMatch(read.title.value, pool, q => en(q.name)) : null;
      const q = m?.item ?? null;
      const countMatch = !!q && q.objectives.length === read.objectives.length;
      const conf: Conf = !q ? 'unknown' : m!.dist <= 1 && confOf(read.title) !== 'unknown' ? 'high' : 'medium';
      return {
        kind: 'quest', questId: q?.id ?? null, conf, title: q ? locText(q.name, lang) : read.title.value ?? '', trader: tr?.item ?? null,
        objectives: read.objectives.map((checked, i) => ({
          text: countMatch ? locText(q!.objectives[i], lang) : null, checked,
          stored: countMatch && (s.quests.objectives[q!.id] ?? []).includes(i),
        })),
        countMatch, done: !!q && !!s.quests.done[q.id], pinned: !!q && s.quests.pinned.includes(q.id),
        open: read.objectives.some(x => x === false),
      };
    }
    case 'skills': {
      const now = branchTotals(s.skills.current);
      const tot = (b: BranchId) => { const f = field(read.totals[b], v => v >= 0 && v <= 99); return { read: f.value, conf: f.conf, now: now[b] }; };
      let skill: SkillsProposal['skill'] = null;
      const tip = read.tooltip;
      if (tip) {
        const m = tip.name.value ? bestMatch(tip.name.value, SKILLS, x => x.name) : null;
        const sk = m?.item ?? null;
        const cur = field(tip.current, v => !!sk && v >= 1 && v <= sk.max);
        /* další rank za šipkou musí být o jeden vyšší, jinak tooltipu nevěříme */
        const nextOk = tip.next.value === null || (cur.value !== null && tip.next.value === cur.value + 1);
        const current: PField<number> = nextOk ? cur : { value: null, conf: 'unknown', raw: cur.raw };
        skill = {
          id: sk?.id ?? null, name: sk?.name ?? tip.name.value ?? '', current, next: nextOk ? tip.next.value : null, max: sk?.max ?? 0,
          now: sk ? s.skills.current[sk.id] || 0 : 0, conf: !sk ? 'unknown' : m!.dist <= 1 ? 'high' : 'medium',
        };
      }
      return { kind: 'skills', totals: { c: tot('c'), m: tot('m'), s: tot('s') }, skill };
    }
  }
}

/* ----- zápis po potvrzení ----- */
export interface ProgressApply {
  profile?: Partial<Record<'level' | 'xp' | 'xpNext' | 'coins', number>>;
  stations?: Record<string, number>;
  skills?: Record<string, number>;
  /* úkol: zrušit chybné „splněno“ (jen když obrazovka ukazuje nesplněný cíl) a připnout */
  questUndone?: string[];
  questPin?: string[];
  /* 0.10.2: zaškrtnutí (on) nebo odškrtnutí cíle úkolu podle indexu v datech */
  questTicks?: QuestTick[];
  /* 0.12.0: počet materiálu v Zásobě (jen známý materiál, jen na výslovné přání z detailu stanice) */
  inventory?: Record<string, number>;
}
export interface QuestTick { id: string; index: number; on: boolean }
export interface ProgressSummary { fields: number }

/* Kontrola a zápis vybraných hodnot. Neznámé id, hodnota mimo rozsah nebo rank nad maximum se zahodí. */
export function applyProgress(s: AppState, input: ProgressApply, pinMax = 5): ProgressSummary {
  let fields = 0;
  const lim: Record<string, readonly [number, number]> = { level: LIMITS.level, xp: LIMITS.xp, xpNext: LIMITS.xpNext, coins: LIMITS.coins };
  for (const [k, v] of Object.entries(input.profile ?? {})) {
    if (!(k in lim) || !Number.isFinite(v)) continue;
    const n = clampInt(v, lim[k][0], lim[k][1]);
    if (n !== v) continue;
    const key = k as 'level' | 'xp' | 'xpNext' | 'coins';
    if (s.profile[key] !== n) { s.profile[key] = n; fields++; }
  }
  const stations = getStations(s.gameData);
  for (const [id, v] of Object.entries(input.stations ?? {})) {
    const st = stations.find(x => x.id === id);
    if (!st || !Number.isInteger(v) || v < st.min || v > st.max) continue;
    if (s.stations[id] !== v) { s.stations[id] = v; fields++; }
  }
  for (const [id, v] of Object.entries(input.skills ?? {})) {
    const sk = SKILLS.find(x => x.id === id);
    if (!sk || !Number.isInteger(v) || v < 0 || v > sk.max) continue;
    if ((s.skills.current[id] || 0) !== v) { if (v) s.skills.current[id] = v; else delete s.skills.current[id]; fields++; }
  }
  for (const id of input.questUndone ?? []) {
    if (!questById(id) || !s.quests.done[id]) continue;
    const next = { ...s.quests.done }; delete next[id]; s.quests.done = next; fields++;
  }
  for (const x of input.questTicks ?? []) {
    const next = setObjective(s.quests.objectives, x.id, x.index, x.on);
    if (next !== s.quests.objectives) { s.quests.objectives = next; fields++; }
  }
  const mats = input.inventory && Object.keys(input.inventory).length ? new Set(getMaterials(s).map(x => x.name)) : null;
  for (const [name, v] of Object.entries(input.inventory ?? {})) {
    if (!mats?.has(name) || !Number.isInteger(v) || v < LIMITS.inventory[0] || v > LIMITS.inventory[1]) continue;
    if ((s.inventory[name] || 0) === v) continue;
    if (v) s.inventory[name] = v; else delete s.inventory[name];
    fields++;
  }
  for (const id of input.questPin ?? []) {
    if (!questById(id) || s.quests.pinned.includes(id)) continue;
    s.quests.pinned = [...s.quests.pinned, id].slice(-pinMax); fields++;
  }
  return { fields };
}

/* Výchozí výběr v revizi: jen jisté hodnoty, které se liší od aplikace. */
export function defaultApply(p: ProgressProposal): ProgressApply {
  switch (p.kind) {
    case 'profile': {
      const out: ProgressApply['profile'] = {};
      for (const k of ['level', 'xp', 'xpNext', 'coins'] as const) { const f = p[k]; if (f.conf === 'high' && f.value !== null && f.value !== p.now[k]) out[k] = f.value; }
      return { profile: out };
    }
    case 'stations': return { stations: Object.fromEntries(p.rows.filter(r => r.conf === 'high' && r.value !== null && r.value !== r.now).map(r => [r.id, r.value!])) };
    case 'skills': return p.skill && p.skill.id && p.skill.conf === 'high' && p.skill.current.conf === 'high' && p.skill.current.value !== p.skill.now ? { skills: { [p.skill.id]: p.skill.current.value! } } : {};
    case 'quest': {
      if (!p.questId || p.conf !== 'high') return {};
      const out: ProgressApply = {};
      if (p.done && p.open) out.questUndone = [p.questId];
      /* jen zaškrtnutí; odškrtnutí nikdy předem */
      const ticks = questTickChanges(p).filter(x => x.on);
      if (ticks.length) out.questTicks = ticks;
      return out;
    }
  }
}

/* Počet změn, které návrh vůbec může nabídnout (pro hlášku Opse). */
export function proposalChanges(p: ProgressProposal): number {
  switch (p.kind) {
    case 'profile': return (['level', 'xp', 'xpNext', 'coins'] as const).filter(k => p[k].value !== null && p[k].value !== p.now[k]).length;
    case 'stations': return p.rows.filter(r => r.value !== null && r.value !== r.now).length + stockChanges(p).length;
    case 'skills': return p.skill?.id && p.skill.current.value !== null && p.skill.current.value !== p.skill.now ? 1 : 0;
    case 'quest': return p.questId ? ((p.done && p.open) || !p.pinned ? 1 : 0) + questTickChanges(p).length : 0;
  }
}

/* Volitelné zápisy do Zásoby z detailu stanice: jistý materiál s jistým počtem, který se liší od aplikace. */
export const stockChanges = (p: StationsProposal): ResourceRow[] => (p.resources ?? []).filter(r => r.stockOffer && r.have !== r.stock);

/* Rozdíly cílů mezi snímkem a aplikací: zaškrtnuté na snímku a ne v aplikaci (on) a naopak (off). Nepřečtený cíl
   (null) ani úkol s jiným počtem cílů nic nenabízí. */
export function questTickChanges(p: QuestProposal): QuestTick[] {
  if (!p.questId || !p.countMatch) return [];
  const out: QuestTick[] = [];
  p.objectives.forEach((o, index) => {
    if (o.checked === true && !o.stored) out.push({ id: p.questId!, index, on: true });
    else if (o.checked === false && o.stored) out.push({ id: p.questId!, index, on: false });
  });
  return out;
}

/* Vstup z jiného okna (overlay): jen očekávané tvary. */
export function normalizeProgressApply(raw: unknown): ProgressApply | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nums = (x: unknown, keys?: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
    for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, 64)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || k.length > 80) continue;
      if (keys && !keys.includes(k)) continue;
      out[k] = v;
    }
    return out;
  };
  const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length <= 80).slice(0, 16) : []);
  return {
    profile: nums(o.profile, ['level', 'xp', 'xpNext', 'coins']),
    stations: nums(o.stations), skills: nums(o.skills), inventory: nums(o.inventory),
    questUndone: ids(o.questUndone), questPin: ids(o.questPin),
    questTicks: (Array.isArray(o.questTicks) ? o.questTicks : []).slice(0, 64).flatMap((x): QuestTick[] => {
      if (!x || typeof x !== 'object') return [];
      const v = x as Record<string, unknown>;
      return typeof v.id === 'string' && v.id.length <= 80 && Number.isInteger(v.index) && typeof v.on === 'boolean'
        ? [{ id: v.id, index: Number(v.index), on: v.on }] : [];
    }),
  };
}
