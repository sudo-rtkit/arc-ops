/* 0.22.0: widgety nad hrou. Uložení rozložení, kotvy a změna rozlišení, přichycení, šablony, krytí s hranicí pro text
   a stavový automat režimů (čisté funkce v src/core/widgets.ts). */
import { describe, expect, it } from 'vitest';
import {
  GRID, LAYOUTS_MAX, OPACITY_DEFAULT, PRESET_IDS, SAFE, TEXT_FLOOR, WIDGETS, WIDGET_IDS, activeLayout, addWidget, anchorOf, clampOpacity,
  clampSize, defaultWidgetPrefs, deleteLayout, emptyHistory, followDecision, followTarget, initialMode, modeStep, nameError, normalizeWidgetPrefs,
  placeRect, presetWidgets, record, redo, removeWidget, rename, resetActive, resizeRect, restack, saveAs, selectLayout, setDensity, setFollow,
  setPlace, snapMove, textSurface, undo, withRect, type ModeState, type WidgetPlace,
} from '../../src/core/widgets';

const HD = { w: 1920, h: 1080 };
const QHD = { w: 2560, h: 1440 };
const UW = { w: 3440, h: 1440 };

describe('katalog widgetů', () => {
  it('deset widgetů z návrhu, žádná mapa, poloha ani minimapa', () => {
    expect(WIDGET_IDS).toHaveLength(10);
    expect(WIDGET_IDS.some(id => /map|pos|compass|radar/i.test(id))).toBe(false);
    for (const id of WIDGET_IDS) {
      const s = WIDGETS[id];
      for (const d of [s.compact, s.expanded]) {
        expect(d.w).toBeGreaterThanOrEqual(s.min.w); expect(d.w).toBeLessThanOrEqual(s.max.w);
        expect(d.h).toBeGreaterThanOrEqual(s.min.h); expect(d.h).toBeLessThanOrEqual(s.max.h);
      }
    }
    expect(WIDGETS.toFind).toMatchObject({ compact: { w: 344, h: 248 }, min: { w: 280, h: 200 }, max: { w: 480, h: 560 } });
  });
});

describe('šablony Raid a Lobby', () => {
  it('Raid: seznam a úkoly kompaktně vlevo nahoře; Lobby: Co dál? a nákupy vlevo, úkoly a skrýš vpravo', () => {
    const raid = presetWidgets('raid').map(w => placeRect(w, HD));
    expect(raid).toEqual([{ x: 24, y: 24, w: 344, h: 248 }, { x: 24, y: 300, w: 344, h: 128 }]);
    const lobby = presetWidgets('lobby');
    expect(lobby.map(w => w.id)).toEqual(['next', 'shopping', 'quests', 'stash']);
    expect(lobby.every(w => w.density === 'expanded' && w.opacity === OPACITY_DEFAULT)).toBe(true);
    expect(placeRect(lobby[2], HD)).toEqual({ x: 1920 - 24 - 344, y: 24, w: 344, h: 176 });
    expect(placeRect(lobby[3], HD)).toEqual({ x: 1920 - 24 - 280, y: 268, w: 280, h: 192 });
  });

  it('výchozí stav: obě šablony, aktivní Raid, automatika vypnutá', () => {
    const p = defaultWidgetPrefs();
    expect(p.layouts.map(l => l.id)).toEqual([...PRESET_IDS]);
    expect(p.active).toBe('raid');
    expect(p.follow).toBe(false);
  });

  it('přepnutí jedním výběrem a obnovení jen aktivního rozložení', () => {
    let p = defaultWidgetPrefs();
    p = removeWidget(p, 'quests');
    expect(activeLayout(p).widgets.map(w => w.id)).toEqual(['toFind']);
    p = selectLayout(p, 'lobby');
    expect(activeLayout(p).widgets).toHaveLength(4);
    p = selectLayout(p, 'raid');
    p = resetActive(p);
    expect(activeLayout(p).widgets.map(w => w.id)).toEqual(['toFind', 'quests']);
    expect(p.layouts.find(l => l.id === 'lobby')!.widgets).toHaveLength(4);
  });

  it('Uložit jako, přejmenovat (jen vlastní) a jedinečný název 1–40 znaků', () => {
    let p = defaultWidgetPrefs();
    expect(nameError('', p)).toBe(true);
    expect(nameError('raid', p)).toBe(true);
    expect(nameError('x'.repeat(41), p)).toBe(false); /* ořízne se na 40 */
    const q = saveAs(p, 'Moje', 'labc')!;
    expect(q.active).toBe('labc');
    expect(activeLayout(q).name).toBe('Moje');
    expect(saveAs(q, 'moje', 'ldef')).toBeNull();
    expect(rename(q, 'raid', 'Jiné')).toBeNull();
    expect(rename(q, 'labc', 'Lobby')).toBeNull();
    p = rename(q, 'labc', 'Večer')!;
    expect(activeLayout(p).name).toBe('Večer');
    p = deleteLayout(p, 'labc');
    expect(p.active).toBe('raid');
    expect(deleteLayout(p, 'raid').layouts).toHaveLength(2);
  });
});

describe('uložení rozložení (místní, ověřené)', () => {
  it('projde JSON beze změny', () => {
    let p = saveAs(addWidget(defaultWidgetPrefs(), 'stash', HD), 'Večer', 'l1')!;
    p = setFollow(p, true);
    expect(normalizeWidgetPrefs(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('nesmysl, cizí verze, neznámé id a vadná čísla se zahodí; šablony se doplní', () => {
    expect(normalizeWidgetPrefs(null)).toEqual(defaultWidgetPrefs());
    expect(normalizeWidgetPrefs({ version: 2, active: 'lobby' })).toEqual(defaultWidgetPrefs());
    const raw = {
      version: 1, active: 'nope', follow: 'yes',
      layouts: [
        { id: 'raid', name: 'Hacked', widgets: [{ id: 'map', dx: 1, dy: 1, w: 300, h: 300 }, { id: 'toFind', ax: 'left', ay: 'top', dx: 'x', dy: 0, w: 300, h: 300 }, { id: 'quests', ax: 'weird', ay: 'bottom', dx: 10, dy: 20, w: 99999, h: 1, opacity: 5, z: -4 }, { id: 'quests', dx: 0, dy: 0, w: 300, h: 120 }] },
        { id: '__proto__', name: 'x', widgets: [] },
        { id: 'l1', name: '  ', widgets: [] },
      ],
    };
    const p = normalizeWidgetPrefs(raw);
    expect(p.layouts.map(l => l.id)).toEqual(['raid', 'lobby']);
    expect(p.active).toBe('raid');
    expect(p.follow).toBe(false);
    const raid = p.layouts[0];
    expect(raid.name).toBe('Raid');
    expect(raid.widgets).toEqual([{ id: 'quests', ax: 'left', ay: 'bottom', dx: 10, dy: 20, w: 480, h: 112, opacity: 30, density: 'compact', locked: false, z: 0 }]);
  });

  it('nejvýš 12 rozložení', () => {
    const layouts = Array.from({ length: 30 }, (_, i) => ({ id: 'l' + i, name: 'N' + i, widgets: [] }));
    expect(normalizeWidgetPrefs({ version: 1, layouts }).layouts).toHaveLength(LAYOUTS_MAX);
  });
});

describe('kotvy a změna rozlišení', () => {
  it('kotva podle nejbližšího okraje nebo středu', () => {
    expect(anchorOf({ x: 24, y: 24, w: 300, h: 100 }, HD)).toEqual({ ax: 'left', ay: 'top', dx: 24, dy: 24 });
    expect(anchorOf({ x: 1920 - 300 - 40, y: 1080 - 100 - 16, w: 300, h: 100 }, HD)).toEqual({ ax: 'right', ay: 'bottom', dx: 40, dy: 16 });
    expect(anchorOf({ x: 800, y: 500, w: 320, h: 80 }, HD)).toEqual({ ax: 'center', ay: 'center', dx: 0, dy: 0 });
    expect(anchorOf({ x: 850, y: 500, w: 320, h: 80 }, HD).dx).toBe(50);
  });

  it('při shodě vzdáleností zůstane předchozí kotva', () => {
    const r = { x: 810, y: 0, w: 300, h: 100 }; /* vlevo 810, vpravo 810, střed 0 → střed */
    expect(anchorOf(r, HD).ax).toBe('center');
    const tie = { x: 405, y: 0, w: 300, h: 100 }; /* vlevo 405, od středu 405 */
    expect(anchorOf(tie, HD).ax).toBe('left');
    expect(anchorOf(tie, HD, { ax: 'center', ay: 'top' })).toMatchObject({ ax: 'center', dx: -405 });
    expect(anchorOf(tie, HD, { ax: 'left', ay: 'top' }).ax).toBe('left');
  });

  it('1080p → 1440p → ultrawide: velikost a odstup od okraje zůstanou, pravý widget zůstane vpravo', () => {
    const lobby = presetWidgets('lobby');
    for (const vp of [HD, QHD, UW]) {
      const stash = placeRect(lobby[3], vp);
      expect(stash.w).toBe(280);
      expect(vp.w - stash.x - stash.w).toBe(24);
      expect(placeRect(lobby[0], vp)).toMatchObject({ x: 24, y: 24, w: 344 });
    }
  });

  it('menší monitor: oříznutí do monitoru, nic mimo dosah; DPI 150 % (1280×720 logicky)', () => {
    const big: WidgetPlace = { id: 'toFind', ax: 'right', ay: 'bottom', dx: 2000, dy: 900, w: 480, h: 560, opacity: 85, density: 'expanded', locked: false, z: 0 };
    const r = placeRect(big, { w: 1280, h: 720 });
    expect(r).toEqual({ x: 0, y: 0, w: 480, h: 560 });
    const tiny = placeRect(big, { w: 300, h: 150 });
    expect(tiny.w).toBeLessThanOrEqual(300); expect(tiny.h).toBeLessThanOrEqual(150);
    expect(clampSize('toFind', 100, 100, HD)).toEqual({ w: 280, h: 200 });
  });

  it('withRect uloží kotvu a odstup, které po přepočtu vrátí stejný obdélník', () => {
    const p = presetWidgets('raid')[0];
    const moved = withRect(p, { x: 1500, y: 900, w: 344, h: 160 }, HD);
    expect(moved).toMatchObject({ ax: 'right', ay: 'bottom', dx: 1920 - 1500 - 344, dy: 0, h: 200 });
    expect(placeRect(moved, HD)).toEqual({ x: 1500, y: 880, w: 344, h: 200 });
  });
});

describe('přichycení', () => {
  it('k okraji, bezpečnému odstupu a mřížce 8 px; nejbližší vyhraje', () => {
    expect(snapMove({ x: 3, y: 5, w: 300, h: 100 }, HD, []).rect).toMatchObject({ x: 0, y: 0 });
    const s = snapMove({ x: 27, y: 22, w: 300, h: 100 }, HD, []);
    expect(s.rect).toMatchObject({ x: 24, y: 24 });
    expect(s.guides).toMatchObject({ x: SAFE, y: SAFE, kindX: 'edge', kindY: 'edge' });
    const g = snapMove({ x: 403, y: 597, w: 300, h: 100 }, HD, []);
    expect(g.rect.x % GRID).toBe(0); expect(g.rect.y % GRID).toBe(0);
    expect(g.guides.x).toBeNull();
    expect(snapMove({ x: 1920 - 300 - 2, y: 400, w: 300, h: 100 }, HD, []).rect.x).toBe(1620);
  });

  it('k okrajům a středům jiných widgetů; při shodě okraj monitoru před widgetem', () => {
    const other = { x: 500, y: 200, w: 300, h: 200 };
    const s = snapMove({ x: 805, y: 203, w: 200, h: 100 }, HD, [other]);
    expect(s.rect).toMatchObject({ x: 800, y: 200 });
    expect(s.guides.kindX).toBe('widget');
    /* widget přesně na SAFE: obojí stejně daleko, vyhraje okraj */
    const tie = snapMove({ x: 26, y: 300, w: 100, h: 100 }, HD, [{ x: 24, y: 600, w: 50, h: 50 }]);
    expect(tie.rect.x).toBe(24);
    expect(tie.guides.kindX).toBe('edge');
  });

  it('Alt přichycení vypne, oříznutí do monitoru zůstane', () => {
    const s = snapMove({ x: 27, y: -50, w: 300, h: 100 }, HD, [], true);
    expect(s.rect).toMatchObject({ x: 27, y: 0 });
    expect(s.guides).toEqual({ x: null, y: null, kindX: null, kindY: null });
  });

  it('změna velikosti po 8 px v mezích widgetu; protější okraj stojí', () => {
    const start = { x: 100, y: 100, w: 344, h: 248 };
    expect(resizeRect(start, 'se', 13, 30, 'toFind', HD)).toEqual({ x: 100, y: 100, w: 360, h: 280 });
    expect(resizeRect(start, 'se', 999, 999, 'toFind', HD)).toMatchObject({ w: 480, h: 560 });
    expect(resizeRect(start, 'nw', 300, 300, 'toFind', HD)).toEqual({ x: 164, y: 148, w: 280, h: 200 });
    expect(resizeRect(start, 'w', -1000, 0, 'toFind', HD)).toMatchObject({ x: 0, w: 444 });
    expect(resizeRect(start, 'e', 13, 0, 'toFind', HD, true).w).toBe(357);
  });
});

describe('krytí a čitelnost', () => {
  it('30–100 %, výchozí 85 %, text má vždy aspoň 90 %', () => {
    expect(clampOpacity(5)).toBe(30);
    expect(clampOpacity(150)).toBe(100);
    expect(clampOpacity('x')).toBe(OPACITY_DEFAULT);
    expect(textSurface(30)).toBe(TEXT_FLOOR);
    expect(textSurface(85)).toBe(90);
    expect(textSurface(95)).toBe(95);
    expect(textSurface(100)).toBe(100);
  });
});

describe('úpravy rozložení a Zpět / Znovu', () => {
  it('přidání z katalogu na volné místo, každý widget nejvýš jednou; hustota, vrstvení', () => {
    let p = addWidget(defaultWidgetPrefs(), 'stash', HD);
    const ws = activeLayout(p).widgets;
    expect(ws.map(w => w.id)).toEqual(['toFind', 'quests', 'stash']);
    const r = placeRect(ws[2], HD), others = ws.slice(0, 2).map(w => placeRect(w, HD));
    expect(others.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)).toBe(false);
    expect(addWidget(p, 'stash', HD)).toBe(p);
    p = setDensity(p, 'stash', 'expanded', HD);
    expect(activeLayout(p).widgets[2]).toMatchObject({ density: 'expanded', h: 192 });
    p = restack(p, 'stash', -1);
    const z = Object.fromEntries(activeLayout(p).widgets.map(w => [w.id, w.z]));
    expect(z.stash).toBeLessThan(z.quests);
  });

  it('Zpět a Znovu vrací celé rozložení', () => {
    const a = defaultWidgetPrefs();
    let h = record(emptyHistory(), a);
    const b = removeWidget(a, 'quests');
    const u = undo(h, b)!;
    expect(u.prefs).toBe(a);
    h = u.h;
    const r = redo(h, u.prefs)!;
    expect(r.prefs).toBe(b);
    expect(undo(emptyHistory(), a)).toBeNull();
    expect(redo(emptyHistory(), a)).toBeNull();
  });

  it('zamčený widget se pozná, místo se mění jen přes setPlace', () => {
    const p = defaultWidgetPrefs();
    const w = { ...activeLayout(p).widgets[0], locked: true };
    expect(activeLayout(setPlace(p, w)).widgets[0].locked).toBe(true);
  });
});

describe('stavový automat režimů', () => {
  const run = (events: Parameters<typeof modeStep>[1][]) => {
    let s: ModeState = initialMode();
    const effects: string[] = [];
    for (const e of events) { const r = modeStep(s, e); s = r.state; if (r.effect) effects.push(r.effect); }
    return { s, effects };
  };

  it('Hra → Úpravy → Esc požádá o návrat do Hry', () => {
    const { s, effects } = run([{ type: 'enter' }, { type: 'esc' }]);
    expect(s.mode).toBe('edit');
    expect(effects).toEqual(['requestPlay']);
    expect(modeStep(s, { type: 'exit' }).state.mode).toBe('play');
  });

  it('Esc nejdřív zruší tažení, pak zavře dialog, teprve potom ukončí Úpravy', () => {
    const { s, effects } = run([{ type: 'enter' }, { type: 'open', popup: 'catalog' }, { type: 'esc' }, { type: 'dragStart' }, { type: 'esc' }]);
    expect(effects).toEqual(['cancelDrag']);
    expect(s).toMatchObject({ mode: 'edit', popup: null, dragging: false });
  });

  it('Hotovo vrátí do Hry vždy, i s otevřeným dialogem; ve Hře nic nedělá', () => {
    const { s, effects } = run([{ type: 'enter' }, { type: 'open', popup: 'layouts' }, { type: 'done' }]);
    expect(effects).toEqual(['requestPlay']);
    expect(s.popup).toBeNull();
    expect(run([{ type: 'done' }]).effects).toEqual([]);
  });

  it('Skrýt vše v Úpravách skryje a vrátí do Hry; Úpravy widgety zase ukážou', () => {
    const a = run([{ type: 'enter' }, { type: 'hideAll' }]);
    expect(a.s.hidden).toBe(true);
    expect(a.effects).toEqual(['requestPlay']);
    const b = modeStep(modeStep(a.s, { type: 'exit' }).state, { type: 'enter' }).state;
    expect(b.hidden).toBe(false);
  });

  it('zkratka Skrýt / zobrazit ve Hře přepíná; v Hře nejdou otevřít dialogy ani tažení', () => {
    const { s } = run([{ type: 'toggleHidden' }]);
    expect(s).toMatchObject({ mode: 'play', hidden: true });
    expect(modeStep(s, { type: 'toggleHidden' }).state.hidden).toBe(false);
    expect(run([{ type: 'open', popup: 'catalog' }, { type: 'dragStart' }]).s).toEqual(initialMode());
    expect(run([{ type: 'esc' }]).effects).toEqual([]);
  });
});

describe('automatika Lobby / Raid', () => {
  it('jen přechod: první stav nic nepřepne, do raidu Raid, z raidu Lobby', () => {
    expect(followTarget(null, 'inRaid')).toBeNull();
    expect(followTarget('idle', 'idle')).toBeNull();
    expect(followTarget('loadout', 'inRaid')).toBe('raid');
    expect(followTarget('inRaid', 'idle')).toBe('lobby');
    expect(followTarget('idle', 'loadout')).toBe('lobby');
  });

  it('výchozí vypnuto, odklad během Úprav, ruční výběr pozastaví, nové zapnutí obnoví', () => {
    const off = defaultWidgetPrefs();
    expect(followDecision(off, 'lobby', true, false)).toBeNull();
    const on = setFollow(off, true);
    expect(followDecision(on, 'lobby', false, false)).toBeNull();
    expect(followDecision(on, 'lobby', true, true)).toBe('defer');
    expect(followDecision(on, 'lobby', true, false)).toBe('switch');
    expect(followDecision(on, 'raid', true, false)).toBeNull();
    const manual = selectLayout(on, 'lobby');
    expect(manual.followPaused).toBe(true);
    expect(followDecision(manual, 'raid', true, false)).toBeNull();
    expect(setFollow(manual, true).followPaused).toBe(false);
    expect(selectLayout(on, 'lobby', false).followPaused).toBe(false);
  });
});
