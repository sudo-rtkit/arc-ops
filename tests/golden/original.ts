/* Načte <script> z původního deníku a spustí ho v node:vm bez DOM. Vrací konstanty a funkce originálu. */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MATERIAL_RENAMES } from '../../src/core/data/materials';

const file = fileURLToPath(new URL('../../reference/denik-v2-2026-11-08-1707.html', import.meta.url));
const html = readFileSync(file, 'utf8');
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

const NAMES = ['BRANCHES', 'TIER_NAMES', 'SKILLS', 'SKILL', 'PLANS', 'BUILDS', 'STATIONS', 'STATION', 'SOURCES', 'MAPS',
  'CONDITIONS', 'ROUTES', 'SELL', 'ARC', 'TIERS', 'ANTI_ARC', 'WEAPON_PHASES', 'NEXT_STEPS', 'RAID_CHECK', 'DOC_URL',
  'DEFAULT_STATE', 'clampInt', 'normalize', 'pointsIn', 'totalPoints', 'budget', 'choiceTaken', 'endTaken', 'addBlock',
  'invalidNodes', 'planSteps', 'planTarget', 'nextPlanPoint', 'planProgress', 'nextNeeds', 'reqBlock', 'readiness',
  'shopping', 'workshopProgress', 'phases', 'mapStatus', 'runStats', 'isoWeek', 'resetCost'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ctx: Record<string, Any> = {};
runInNewContext(`${src}\n;globalThis.__x = { ${NAMES.join(', ')} };`, ctx);

/* Hodnoty z jiného realm převedeme přes JSON, aby toEqual porovnával jen data. */
export const plain = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
export const O: Record<string, Any> = ctx.__x;

/* 0.13.1: aplikace opravila název materiálu převzatý z deníku na herní název (MATERIAL_RENAMES, „Cable Strippers“ →
   „Cable Stripper“). Originál se porovnává s opraveným názvem; jinak se data i funkce deníku nemění. */
for (const st of O.STATIONS as { levels: Record<string, [string, number][]> }[]) {
  for (const lvl of Object.values(st.levels)) for (const pair of lvl) pair[0] = MATERIAL_RENAMES[pair[0]] ?? pair[0];
}
