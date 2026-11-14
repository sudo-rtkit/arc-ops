/* Popisné texty herních dat podle jazyka. Čeština = originál z deníku (data/*.ts), angličtina = data/en.ts.
   Hodnoty, které se ukládají ve stavu (kategorie materiálu, nebezpečnost ARC, místa na mapě, účel loadoutu), zůstávají
   česky; překládá se jen jejich zobrazení. Vlastní text uživatele se vrací beze změny. */
import type { Lang } from '../i18n';
import { tl } from '../i18n';
import type { GameMap, Skill, Station } from './types';
import { CONDITIONS, MAPS } from './data/maps';
import { PATCH_NOTES, TEXTS } from './data/texts';
import { NEXT_STEPS, RAID_CHECK } from './data/checklists';
import { SOURCES } from './data/stations';
import { WEAPON_PHASES } from './data/weaponsDiary';
import { BUILDS, TIER_NAMES } from './data/skills';
import { LOADOUT_PURPOSES } from './loadouts';
import {
  ARC_DANGER_EN, BUILDS_WHO_EN, CONDITIONS_EN, MAPS_EN, MATERIAL_CATEGORY_EN, NEXT_STEPS_EN, PATCH_NOTES_EN, RAID_CHECK_EN,
  SKILL_DESC_EN, SOURCES_EN, STATIONS_EN, TEXTS_EN, TIER_NAMES_EN, WEAPON_CATEGORY_EN, WEAPON_PHASES_EN,
} from './data/en';
import { mapPlaces } from './maps';

export const gameTexts = (lang: Lang): Record<keyof typeof TEXTS, string> => (lang === 'en' ? TEXTS_EN : TEXTS);
export const patchNotes = (lang: Lang): string[] => (lang === 'en' ? PATCH_NOTES_EN : PATCH_NOTES);
export const conditions = (lang: Lang): [string, string][] => (lang === 'en' ? CONDITIONS.map(([k], i) => [k, CONDITIONS_EN[i]]) : CONDITIONS);
export const nextStepsText = (lang: Lang): string[] => (lang === 'en' ? NEXT_STEPS_EN : NEXT_STEPS);
export const raidCheckText = (lang: Lang): string[] => (lang === 'en' ? RAID_CHECK_EN : RAID_CHECK);
export const weaponPhases = (lang: Lang): [string, string, string, string][] => (lang === 'en' ? WEAPON_PHASES_EN : WEAPON_PHASES);
export const tierNames = (lang: Lang): string[] => (lang === 'en' ? TIER_NAMES_EN : TIER_NAMES);
export const skillDesc = (s: Skill, lang: Lang): string => (lang === 'en' ? SKILL_DESC_EN[s.id] || s.d : s.d);
export const buildWho = (i: number, lang: Lang): string => (lang === 'en' ? BUILDS_WHO_EN[i] || BUILDS[i]?.who || '' : BUILDS[i]?.who || '');

/* Mapy */
export const mapBest = (m: GameMap, lang: Lang): string => (lang === 'en' ? MAPS_EN[m.id]?.best || m.best : m.best);
export const mapPlacesText = (m: GameMap, lang: Lang): string => (lang === 'en' ? MAPS_EN[m.id]?.places || m.places : m.places);
/* Popisek místa; klíč (česká podoba z deníku) se pro odškrtnutí návštěvy nemění. */
export function placeLabel(m: GameMap, place: string, lang: Lang): string {
  if (lang !== 'en' || !MAPS_EN[m.id]) return place;
  const i = mapPlaces(m).indexOf(place);
  const en = MAPS_EN[m.id].places.split(', ');
  return i >= 0 && en.length === mapPlaces(m).length ? en[i] : place;
}
export const mapById = (id: string): GameMap | undefined => MAPS.find(m => m.id === id);

/* Stanice */
export const stationRole = (st: Station, lang: Lang): string => (lang === 'en' ? STATIONS_EN[st.id]?.role || st.role : st.role);
export const stationNote = (st: Station, lvl: number, lang: Lang): string | undefined => {
  const cs = st.notes?.[lvl];
  if (!cs) return undefined;
  return lang === 'en' ? STATIONS_EN[st.id]?.notes?.[lvl] || cs : cs;
};

/* Výchozí kategorie materiálu (hodnota ukládaná ve stavu). */
export const OTHER_CATEGORY = 'Ostatní';
/* Materiály: vestavěná kategorie a původ se přeloží, vlastní text uživatele zůstane. */
export const categoryLabel = (c: string, lang: Lang): string => (lang === 'en' ? MATERIAL_CATEGORY_EN[c] || c : c);
export const sourceLabel = (mat: string, src: string, lang: Lang): string =>
  (lang === 'en' && src && SOURCES[mat] === src ? SOURCES_EN[mat] || src : src);

/* ARC a zbraně: vestavěné hodnoty výběrů. */
export const dangerLabel = (v: string, lang: Lang): string => (lang === 'en' ? ARC_DANGER_EN[v] || v : v);
export const weaponCategoryLabel = (v: string, lang: Lang): string => (lang === 'en' ? WEAPON_CATEGORY_EN[v] || v : v);

/* Uložený výchozí obsah (kroky „Dalších 10 kroků“, šablona „Před raidem“): položka s výchozím id a textem, který se
   shoduje s výchozím zněním v kterémkoli jazyce, se zobrazí v aktuálním jazyce. Jen zobrazení; stav se nemění a
   jakýkoli vlastní text (i upravená výchozí položka) se zobrazí přesně, jak je uložený. */
function defaultText(re: RegExp, id: string, value: string, cs: string[], en: string[], lang: Lang): string {
  const m = re.exec(id);
  if (!m) return value;
  const i = Number(m[1]);
  if (value !== cs[i] && value !== en[i]) return value;
  return (lang === 'en' ? en : cs)[i] ?? value;
}
export const stepLabel = (id: string, value: string, lang: Lang): string => defaultText(/^n(\d+)$/, id, value, NEXT_STEPS, NEXT_STEPS_EN, lang);
export const checkLabel = (id: string, value: string, lang: Lang): string => defaultText(/^r(\d+)$/, id, value, RAID_CHECK, RAID_CHECK_EN, lang);
/* 0.25.0: název výchozí šablony v obou jazycích přímo tady (slovníky se načítají po jazycích a výchozí stav vzniká
   ještě před načtením); test hlídá shodu s 'default.raidTemplate' v cs.ts a en.ts. */
export const RAID_TEMPLATE_NAME: Record<Lang, string> = { cs: 'Před raidem', en: 'Before the raid' };
export const RAID_TEMPLATE_NAMES = [RAID_TEMPLATE_NAME.cs, RAID_TEMPLATE_NAME.en];
export const templateLabel = (tpl: { id: string; name: string }, lang: Lang): string =>
  (tpl.id === 'raid' && RAID_TEMPLATE_NAMES.includes(tpl.name) ? tl(lang, 'default.raidTemplate') : tpl.name);

/* Účel loadoutu se ukládá česky (hodnota z LOADOUT_PURPOSES); vlastní hodnota zůstává. */
const PURPOSE_KEYS = {
  'Money run': 'raidType.money', 'Lov ARC': 'raidType.arc', PvP: 'raidType.pvp', Questy: 'raidType.quest',
  Trials: 'raidType.trials', 'Free Loadout': 'purpose.free', Jiné: 'raidType.other',
} as const;
export const purposeLabel = (v: string, lang: Lang): string =>
  (LOADOUT_PURPOSES.includes(v) ? tl(lang, PURPOSE_KEYS[v as keyof typeof PURPOSE_KEYS]) : v);
