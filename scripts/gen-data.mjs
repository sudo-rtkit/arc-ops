// Jednorázový převod herních dat z původního deníku do TypeScriptu.
// Spuštění: node scripts/gen-data.mjs
// Čte reference/denik-v2-*.html, zapisuje src/core/data/*.ts. Shodu s originálem hlídá tests/golden/data.test.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync('reference/denik-v2-2026-11-08-1707.html', 'utf8');
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const names = ['BRANCHES', 'TIER_NAMES', 'SKILLS', 'PLANS', 'BUILDS', 'STATIONS', 'SOURCES', 'MAPS', 'CONDITIONS',
  'ROUTES', 'SELL', 'ARC', 'TIERS', 'ANTI_ARC', 'WEAPON_PHASES', 'NEXT_STEPS', 'RAID_CHECK', 'DOC_URL'];
const ctx = {};
runInNewContext(`${src}\n;globalThis.__x = { ${names.join(', ')} };`, ctx);
const X = JSON.parse(JSON.stringify(ctx.__x));

const str = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = k => (/^[A-Za-z_$][\w$]*$/.test(k) || /^\d+$/.test(k) ? k : str(k));
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${key(k)}: ${inline(x)}`).join(', ')} }`;
  return typeof v === 'string' ? str(v) : String(v);
}
const rows = (arr, ind = '  ') => `[\n${arr.map(x => ind + inline(x)).join(',\n')},\n]`;
const obj = (o, ind = '  ') => `{\n${Object.entries(o).map(([k, v]) => `${ind}${key(k)}: ${inline(v)}`).join(',\n')},\n}`;
const HEAD = '// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.\n';

mkdirSync('src/core/data', { recursive: true });
const out = (file, body) => { writeFileSync(`src/core/data/${file}`, HEAD + body); console.log('wrote', file); };

out('skills.ts', `import type { Branch, BuildDef, PlanDef, Skill } from '../types';

export const BRANCHES: Branch[] = ${rows(X.BRANCHES)};

export const TIER_NAMES: string[] = ${inline(X.TIER_NAMES)};

/* tier: 0 start, 1 rané, 2 volba (jen jedna), 3 střední, 4 konec (nejvýš 2 ze 3) */
export const SKILLS: Skill[] = ${rows(X.SKILLS)};

export const SKILL: Record<string, Skill> = Object.fromEntries(SKILLS.map(s => [s.id, s]));

/* Plány buildů: kroky v pořadí. reach = doplnit větev na n bodů podle pořadí v prefer. */
export const PLANS: Record<string, PlanDef> = {
${Object.entries(X.PLANS).map(([k, p]) => `  ${key(k)}: { name: ${str(p.name)}, totals: ${str(p.totals)}, steps: ${rows(p.steps, '    ').replace(/\n\]$/, '\n  ]')} },`).join('\n')}
};

export const BUILDS: BuildDef[] = ${rows(X.BUILDS)};
`);

out('stations.ts', `import type { Station } from '../types';

export const STATIONS: Station[] = ${rows(X.STATIONS)};

export const STATION: Record<string, Station> = Object.fromEntries(STATIONS.map(s => [s.id, s]));

/* Odkud se materiál bere (u ARC dílů dropy podle deníku, jinak běžný loot). */
export const SOURCES: Record<string, string> = ${obj(X.SOURCES)};
`);

out('maps.ts', `import type { GameMap } from '../types';

export const MAPS: GameMap[] = ${rows(X.MAPS)};

export const CONDITIONS: [string, string][] = ${rows(X.CONDITIONS)};
`);

out('routes.ts', `import type { Route } from '../types';

export const ROUTES: Route[] = ${rows(X.ROUTES)};

export const SELL: [string, number, string][] = ${rows(X.SELL)};
`);

out('checklists.ts', `export const NEXT_STEPS: string[] = ${rows(X.NEXT_STEPS)};

export const RAID_CHECK: string[] = ${rows(X.RAID_CHECK)};

export const DOC_URL = ${str(X.DOC_URL)};
`);

out('arcDiary.ts', `import type { ArcDiaryEntry } from '../types';

export const ARC_DIARY: ArcDiaryEntry[] = ${rows(X.ARC)};
`);

out('weaponsDiary.ts', `export const TIERS: [string, string[]][] = ${rows(X.TIERS)};

export const ANTI_ARC: string[] = ${inline(X.ANTI_ARC)};

/* fáze, level, na hráče, na ARC */
export const WEAPON_PHASES: [string, string, string, string][] = ${rows(X.WEAPON_PHASES)};
`);
