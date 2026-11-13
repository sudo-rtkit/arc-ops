/* 0.18.0: hledání všude. Normalizace bez diakritiky, řazení (přesná shoda, začátek, slova, zkratka, překlep),
   české i anglické názvy (moduly, buildy, sekce nastavení), skupiny a nedávná hledání (jen localStorage, ne záloha). */
import { describe, expect, it } from 'vitest';
import { defaultState } from '../../src/core/state';
import { makeBackup } from '../../src/core/backup';
import {
  RECENT_KEY, RECENT_MAX, buildIndex, editDistance, flatHits, fold, itemNames, parseRecent, prepareIndex, pushRecent, searchIndex, type IndexInput,
} from '../../src/core/search';
import { tl } from '../../src/i18n';
import { setQuestDone } from '../../src/core/quests';

const NOW = new Date(2026, 10, 13, 12, 0).getTime();
const both = (k: Parameters<typeof tl>[1]) => [tl('cs', k), tl('en', k)];
const input = (): IndexInput => ({
  materials: ['Metal Parts', 'Wires'],
  tips: [],
  modules: [
    { id: 'workshop', names: ['Workshop', ...both('search.alias.workshop')] },
    { id: 'raid', names: [...both('nav.raidPrep'), 'Raid Prep', ...both('search.alias.raid')] },
    { id: 'inventory', names: ['Inventory', ...both('search.alias.inventory')] },
  ],
  settings: [{ id: 'backup', names: both('settings.exportImport') }, { id: 'lang', names: both('settings.lang') }],
});
function index(lang: 'cs' | 'en' = 'cs') {
  const s = defaultState(NOW, lang);
  s.quests.done = setQuestDone({}, 'ss10s', true, NOW);
  return prepareIndex(buildIndex(s, lang, input()));
}
const first = (lang: 'cs' | 'en', q: string) => flatHits(searchIndex(index(lang), q))[0]?.entry;

describe('normalizace', () => {
  it('fold odstraní diakritiku, velikost písmen a interpunkci', () => {
    expect(fold('Příprava na raid')).toBe('priprava na raid');
    expect(fold('  Žluťoučký kůň — ÚPĚL! ')).toBe('zlutoucky kun upel');
    expect(fold("Vault 'n' Carry")).toBe('vault n carry');
  });
  it('editDistance počítá i prohození sousedních písmen', () => {
    expect(editDistance('wires', 'wires')).toBe(0);
    expect(editDistance('wirse', 'wires')).toBe(1);
    expect(editDistance('wres', 'wires')).toBe(1);
    expect(editDistance('abcdef', 'xyz', 2)).toBeGreaterThan(2);
  });
});

describe('řazení výsledků', () => {
  it('přesný název předmětu je první (CS i EN)', () => {
    for (const lang of ['cs', 'en'] as const) {
      expect(first(lang, 'wires')).toMatchObject({ kind: 'item', title: 'Wires', target: { kind: 'item', name: 'Wires' } });
      expect(first(lang, 'BATTERY')?.title).toBe('Battery');
    }
  });
  it('začátek názvu má přednost před částí uprostřed', () => {
    const hits = flatHits(searchIndex(index(), 'metal')).filter(h => h.entry.kind === 'item').map(h => h.entry.title);
    expect(hits[0]).toBe('Metal Parts');
  });
  it('zkratka po slovech a písmena v pořadí', () => {
    expect(first('en', 'adv mech')?.title).toBe('Advanced Mechanical Components');
    expect(flatHits(searchIndex(index(), 'advmech')).some(h => h.entry.title === 'Advanced Mechanical Components')).toBe(true);
  });
  it('jeden překlep najde předmět', () => {
    expect(first('cs', 'wirse')?.title).toBe('Wires');
    expect(first('en', 'baterry')?.title).toBe('Battery');
  });
  it('bez diakritiky najde český název modulu i sekce nastavení', () => {
    expect(first('cs', 'priprava')).toMatchObject({ kind: 'module', target: { kind: 'route', module: 'raid' } });
    expect(first('cs', 'dilna')).toMatchObject({ kind: 'module', target: { kind: 'route', module: 'workshop' } });
    const set = flatHits(searchIndex(index('cs'), 'export a import')).find(h => h.entry.kind === 'setting');
    expect(set?.entry.target).toEqual({ kind: 'route', module: 'settings', sub: 'backup' });
  });
  it('český i anglický název buildu v obou jazycích, titulek v jazyce UI', () => {
    const cs = flatHits(searchIndex(index('cs'), 'tichy zlodej')).find(h => h.entry.kind === 'build');
    expect(cs?.entry.title).toBe('Tichý zloděj');
    const en = flatHits(searchIndex(index('en'), 'tichy zlodej')).find(h => h.entry.kind === 'build');
    expect(en?.entry.title).toBe('Silent Thief');
    expect(flatHits(searchIndex(index('cs'), 'silent thief')).find(h => h.entry.kind === 'build')?.entry.title).toBe('Tichý zloděj');
    expect(flatHits(searchIndex(index('en'), 'Agresivni PvP')).find(h => h.entry.kind === 'build')?.entry.title).toBe('Aggressive PvP');
  });
  it('úkol vede na detail úkolu, stanice a mapa na svůj modul', () => {
    expect(first('en', 'after rain comes')).toMatchObject({ kind: 'quest', target: { kind: 'route', module: 'quests', sub: 'q=ss10y' } });
    expect(first('cs', 'gunsmith')).toMatchObject({ kind: 'station', target: { kind: 'route', module: 'workshop', sub: 'gunsmith' } });
    expect(first('en', 'buried city')).toMatchObject({ kind: 'map', target: { kind: 'route', module: 'maps', sub: 'buried' } });
  });
  it('předmět z úkolu (klíčová slova) najde i úkol, ale až po předmětu', () => {
    const groups = searchIndex(index('en'), 'wires');
    expect(groups[0].kind).toBe('item');
    expect(groups.some(g => g.kind === 'quest' && g.hits.some(h => h.entry.id === 'quest:ss10y'))).toBe(true);
  });
  it('všechna slova dotazu musí sedět; nesmysl nic nenajde', () => {
    expect(searchIndex(index(), 'zzqx wires')).toEqual([]);
    expect(searchIndex(index(), '   ')).toEqual([]);
  });
  it('skupiny podle druhu s limitem, seřazené podle nejlepšího výsledku', () => {
    const groups = searchIndex(index(), 'a', { perGroup: 3, max: 10 });
    expect(groups.every(g => g.hits.length <= 3)).toBe(true);
    expect(flatHits(groups).length).toBeLessThanOrEqual(10);
    for (let i = 1; i < groups.length; i++) expect(groups[i - 1].hits[0].score).toBeGreaterThanOrEqual(groups[i].hits[0].score);
  });
});

describe('index', () => {
  it('názvy předmětů bez duplicit, i z vlastní zásoby', () => {
    const s = defaultState(NOW);
    s.inventory['My Custom Thing'] = 3;
    const names = itemNames(s, ['Wires', 'wires']);
    expect(names.filter(n => n.toLowerCase() === 'wires')).toHaveLength(1);
    expect(names).toContain('My Custom Thing');
  });
});

describe('nedávná hledání', () => {
  it('jen platná id, bez opakování, nejvýš RECENT_MAX', () => {
    expect(parseRecent('nonsense')).toEqual([]);
    expect(parseRecent(JSON.stringify(['item:Wires', 'item:Wires', 5, 'bad', 'quest:ss10y']))).toEqual(['item:Wires', 'quest:ss10y']);
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, 'item:X' + i);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe('item:X11');
    expect(pushRecent(list, 'item:X5')[0]).toBe('item:X5');
    expect(pushRecent(list, 'not an id')).toBe(list);
  });
  it('nejsou ve stavu ani v záloze (klíč localStorage mimo stav)', () => {
    const backup = makeBackup(defaultState(NOW));
    expect(backup).not.toContain(RECENT_KEY);
    expect(RECENT_KEY.startsWith('arcops:')).toBe(true);
  });
});
