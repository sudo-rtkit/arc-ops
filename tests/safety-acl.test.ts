/* 0.16.1: nejmenší oprávnění pro každé okno. Pevné seznamy: každé rozšíření oprávnění musí změnit i tento test.
   - build.rs vyjmenuje všechny příkazy (manifest aplikace), takže Tauri pustí příkaz jen oknu, které má jeho allow-*.
   - Každé okno má vlastní capability bez core:default (žádný tray, menu, obrázky ze souboru, cesty, emit z JS).
   - Citlivé příkazy navíc samy kontrolují štítek volajícího okna (obrana do hloubky).
   - Události, které posílá jen Rust, mají předponu native: a JS je poslat nemůže (žádné okno nemá allow-emit). */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const cap = (name: string) => JSON.parse(read(`src-tauri/capabilities/${name}.json`)) as { identifier: string; windows: string[]; permissions: string[] };
const walk = (dir: string, re: RegExp): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p, re) : re.test(n) ? [p] : [];
});

const MAIN = [
  'core:event:allow-listen', 'core:event:allow-unlisten',
  'allow-storage-load', 'allow-storage-save', 'allow-snapshot-create', 'allow-snapshot-list', 'allow-snapshot-read', 'allow-snapshot-delete',
  'allow-import-save-raw', 'allow-export-backup', 'allow-import-backup', 'allow-data-dir', 'allow-open-data-dir', 'allow-open-external',
  'allow-launch-info', 'allow-bus-send', 'allow-ops-enable', 'allow-ops-hotkey', 'allow-ops-watch', 'allow-buddy-open', 'allow-buddy-close',
  'allow-overlay-open', 'allow-main-focus', 'allow-capture-now', 'allow-capture-take', 'allow-ops-autocapture', 'allow-ops-autostats', 'allow-ops-passthrough',
  'allow-main-mode', 'allow-main-pin', 'allow-main-geometry', 'allow-main-drag', 'allow-main-minimize', 'allow-main-hide', 'allow-main-show',
  'allow-main-ready', 'allow-app-quit', 'allow-tray-sync', 'allow-widgets-open', 'allow-widgets-close', 'allow-widgets-edit',
  /* 0.23.0: zátěž vlastního procesu (jen čtení) */
  'allow-app-load',
];
const BUDDY = [
  'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-available-monitors', 'core:window:allow-primary-monitor',
  'allow-bus-send', 'allow-buddy-reveal', 'allow-overlay-toggle', 'allow-win-place', 'allow-win-drag', 'allow-widgets-edit',
  /* 0.23.0: Skrýt / zobrazit widgety vedle Úprav (jen událost oknu widgetů) */
  'allow-widgets-hide',
];
const OVERLAY = [
  'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-outer-position', 'core:window:allow-inner-size',
  'core:window:allow-available-monitors', 'core:window:allow-current-monitor', 'core:window:allow-primary-monitor',
  'allow-bus-send', 'allow-overlay-close', 'allow-capture-now', 'allow-open-external', 'allow-win-place',
];
/* 0.22.0: okno widgetů nad hrou: jen události, zprávy hlavnímu oknu, Úpravy, vlastní umístění a panel Aplikace */
const WIDGETS = [
  'core:event:allow-listen', 'core:event:allow-unlisten', 'allow-bus-send', 'allow-widgets-edit', 'allow-widgets-fit', 'allow-widgets-app',
];
const WINDOWS = ['main', 'buddy', 'overlay', 'widgets'];

/* příkazy z build.rs (manifest) a z generate_handler! v lib.rs */
const manifest = (() => { const b = read('src-tauri/build.rs'); return [...b.slice(b.indexOf('const COMMANDS'), b.indexOf('];')).matchAll(/"([a-z_]+)"/g)].map(m => m[1]); })();
const handler = (() => {
  const lib = read('src-tauri/src/lib.rs');
  const list = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf(']', lib.indexOf('generate_handler![')));
  return [...list.matchAll(/(?:\w+::)?(\w+),?\s*$/gm)].map(m => m[1]).filter(x => x !== 'generate_handler');
})();
/* tělo funkce příkazu (od `fn name` po další #[tauri::command] nebo konec souboru) */
function body(file: string, fn: string): string {
  const s = read(file);
  const i = s.search(new RegExp(`fn ${fn}\\b`));
  if (i < 0) throw new Error(`${file}: ${fn}`);
  const j = s.indexOf('#[tauri::command]', i);
  return s.slice(i, j < 0 ? undefined : j);
}

describe('0.16.1: nejmenší oprávnění oken', () => {
  it('capability každého okna je přesně daný seznam', () => {
    const files = readdirSync(join(root, 'src-tauri', 'capabilities')).sort();
    expect(files).toEqual(['buddy.json', 'main.json', 'overlay.json', 'widgets.json']);
    expect(cap('main')).toMatchObject({ identifier: 'main', windows: ['main'] });
    expect(cap('buddy')).toMatchObject({ identifier: 'buddy', windows: ['buddy'] });
    expect(cap('overlay')).toMatchObject({ identifier: 'overlay', windows: ['overlay'] });
    expect(cap('widgets')).toMatchObject({ identifier: 'widgets', windows: ['widgets'] });
    expect(cap('main').permissions).toEqual(MAIN);
    expect(cap('buddy').permissions).toEqual(BUDDY);
    expect(cap('overlay').permissions).toEqual(OVERLAY);
    expect(cap('widgets').permissions).toEqual(WIDGETS);
  });

  it('žádné okno nemá core:default, emit z JS, tray, menu, obrázky, cesty ani cizí ovládání oken', () => {
    for (const name of WINDOWS) {
      for (const p of cap(name).permissions) {
        expect(/default|allow-emit|core:tray|core:menu|core:image|core:path|core:app|core:webview|allow-set-|allow-show|allow-hide|allow-close|allow-destroy|allow-start-dragging|allow-set-focus/.test(p), `${name}: ${p}`).toBe(false);
        expect(/^(core:(event|window):allow-[a-z-]+|allow-[a-z-]+)$/.test(p), `${name}: ${p}`).toBe(true);
      }
      /* bez remote URL a bez platformních výjimek */
      expect(Object.keys(cap(name)).sort()).toEqual(['$schema', 'description', 'identifier', 'permissions', 'windows']);
    }
  });

  it('build.rs vyjmenuje každý příkaz z generate_handler! a každý #[tauri::command]', () => {
    expect(manifest.length).toBeGreaterThan(30);
    expect([...manifest].sort()).toEqual([...handler].sort());
    const commands = walk(join(root, 'src-tauri', 'src'), /\.rs$/).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)].map(m => m[1]));
    expect([...commands].sort()).toEqual([...manifest].sort());
    /* každé allow-* v capabilities odpovídá příkazu z manifestu */
    const granted = WINDOWS.flatMap(n => cap(n).permissions).filter(p => p.startsWith('allow-')).map(p => p.slice(6).replace(/-/g, '_'));
    for (const g of granted) expect(manifest, g).toContain(g);
    /* buddy a overlay nesmí číst stav, snímky ani složku dat, ukládat, ovládat zkratku nebo hlavní okno */
    for (const n of ['buddy', 'overlay', 'widgets']) {
      for (const p of cap(n).permissions) expect(/storage|snapshot|import|export|data-dir|launch-info|ops-|buddy-open|buddy-close|capture-take|main-|app-quit|tray-sync|overlay-open|widgets-open|widgets-close/.test(p), `${n}: ${p}`).toBe(false);
    }
    /* 0.22.0: okno widgetů navíc nesnímá, neotevírá odkazy a nemění polohu jiného okna */
    for (const p of cap('widgets').permissions) expect(/capture|open-external|win-|overlay-|buddy-/.test(p), p).toBe(false);
  });

  it('citlivé příkazy kontrolují štítek volajícího okna', () => {
    for (const fn of ['storage_load', 'storage_save', 'snapshot_create', 'snapshot_list', 'snapshot_read', 'snapshot_delete', 'import_save_raw', 'export_backup', 'import_backup', 'data_dir', 'open_data_dir', 'launch_info']) {
      expect(body('src-tauri/src/lib.rs', fn), fn).toContain('main_window(&window)?');
    }
    expect(body('src-tauri/src/lib.rs', 'open_external')).toContain('bus::only(&window, &[bus::MAIN, bus::OVERLAY])?');
    /* 0.20.0: automatické snímání a jeho měření jen z hlavního okna */
    for (const fn of ['ops_enable', 'ops_hotkey', 'ops_watch', 'buddy_open', 'buddy_close', 'overlay_open', 'main_focus', 'capture_take', 'ops_autocapture', 'ops_autostats', 'ops_passthrough']) {
      expect(body('src-tauri/src/ops.rs', fn), fn).toContain('main_only(&window)?');
    }
    expect(body('src-tauri/src/ops.rs', 'buddy_reveal')).toContain('window.label() != BUDDY');
    expect(body('src-tauri/src/ops.rs', 'overlay_close')).toContain('only(&window, &[OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'overlay_toggle')).toContain('only(&window, &[BUDDY])?');
    expect(body('src-tauri/src/ops.rs', 'capture_now')).toContain('only(&window, &[MAIN, OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'win_place')).toContain('only(&window, &[BUDDY, OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'win_drag')).toContain('only(&window, &[BUDDY])?');
    /* 0.22.0: widgety */
    for (const fn of ['widgets_open', 'widgets_close', 'app_load']) expect(body('src-tauri/src/ops.rs', fn), fn).toContain('main_only(&window)?');
    /* 0.23.0: Skrýt / zobrazit widgety smí jen buddy */
    expect(body('src-tauri/src/ops.rs', 'widgets_hide')).toContain('only(&window, &[BUDDY])?');
    expect(body('src-tauri/src/ops.rs', 'widgets_edit')).toContain('only(&window, &[MAIN, BUDDY, WIDGETS])?');
    expect(body('src-tauri/src/ops.rs', 'widgets_fit')).toContain('only(&window, &[WIDGETS])?');
    expect(body('src-tauri/src/ops.rs', 'widgets_app')).toContain('only(&window, &[WIDGETS])?');
    expect(body('src-tauri/src/ops.rs', 'widgets_app')).toContain('app_tab_ok(t)');
    for (const fn of ['main_mode', 'main_pin', 'main_geometry', 'main_drag', 'main_minimize', 'main_hide', 'main_show', 'main_ready', 'app_quit', 'tray_sync']) {
      expect(body('src-tauri/src/mainwin.rs', fn), fn).toContain('main_only(&window)?');
    }
    /* bus_send: odesílatel podle okna, pevné trasy, omezený typ a velikost */
    const send = body('src-tauri/src/bus.rs', 'bus_send');
    for (const s of ['window.label()', 'route_ok(&from, &to)', 'kind_ok(&kind)', 'MAX_FROM_CHILD']) expect(send).toContain(s);
  });

  it('události jen z Rustu mají předponu native: a JS žádnou událost nevysílá', () => {
    const rs = walk(join(root, 'src-tauri', 'src'), /\.rs$/).map(f => readFileSync(f, 'utf8')).join('\n');
    /* Rust posílá události jen přes bus.rs (emit_native a bus_send) */
    const emits = [...rs.matchAll(/\.emit(_to)?\(/g)].length;
    expect(emits).toBe(2);
    expect(rs).not.toMatch(/"ops:(win-tray|win-close|game|game-visible|capture-ready|capture-start|capture-failed|overlay|open|auto-screen)"/);
    for (const kind of ['win-tray', 'win-close', 'game', 'game-visible', 'capture-ready', 'capture-start', 'capture-failed', 'overlay', 'open', 'auto-screen']) {
      expect(rs, kind).toContain(`"${kind}"`);
    }
    const ts = walk(join(root, 'src'), /\.tsx?$/).map(f => [f, readFileSync(f, 'utf8')] as const);
    for (const [f, s] of ts) {
      expect(/\bemitTo\b|\bemit\(|plugin:event\|emit/.test(s), f).toBe(false);
    }
    /* posluchači událostí z Rustu jsou jen přes onNative */
    const all = ts.map(([, s]) => s).join('\n');
    for (const kind of ['win-tray', 'win-close', 'game-visible', 'capture-ready', 'capture-start', 'capture-failed', 'auto-screen']) {
      expect(all, kind).toContain(`onNative('${kind}'`);
      expect(all, kind).not.toContain(`.on('${kind}'`);
    }
  });

  it('buddy a overlay mění polohu a velikost jen přes win_place (žádné setSize/setPosition z JS)', () => {
    for (const f of ['src/ops/BuddyApp.tsx', 'src/ops/ovWindow.ts']) {
      /* bez komentářů */
      const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const word of ['setSize(', 'setPosition(', 'startDragging(', '.show()']) expect(s.includes(word), `${f}: ${word}`).toBe(false);
    }
    expect(read('src/ops/native.ts')).toContain("call('win_place'");
    expect(read('src/ops/ovWindow.ts')).toContain("invoke('win_place'");
  });
});

/* 0.20.1: tiché emoce automatického snímku jedou po existující trase bus_send hlavní → buddy / overlay jako zpráva
   'emote'. Žádný nový příkaz, oprávnění ani událost z Rustu; automatický snímek dál nevysílá capture-start. */
describe('0.20.1: zpráva emote', () => {
  const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /* tělo posluchače bus.on('<typ>' … po jeho konec „}),“ */
  const handler = (f: string, type: string) => {
    const s = code(f), i = s.indexOf(`bus.on('${type}'`);
    if (i < 0) throw new Error(`${f}: ${type}`);
    const j = s.indexOf('}),', i);
    expect(j, f).toBeGreaterThan(i);
    return s.slice(i, j + 3);
  };

  it('posílá ji jen hlavní okno (hub) buddymu a overlayi; přijímají ji jen od hlavního okna', () => {
    const ts = walk(join(root, 'src'), /\.tsx?$/).map(f => [f.slice(root.length).split('\\').join('/'), code(f.slice(root.length))] as const);
    const senders = ts.filter(([, s]) => /send\([^)]*'emote'/.test(s)).map(([f]) => f);
    expect(senders).toEqual(['src/ops/hub.ts']);
    const hub = code('src/ops/hub.ts');
    expect(hub).toContain("bus.send('buddy', 'emote', m)");
    expect(hub).toContain("bus.send('overlay', 'emote', m)");
    const receivers = ts.filter(([, s]) => s.includes("bus.on('emote'")).map(([f]) => f).sort();
    expect(receivers).toEqual(['src/ops/BuddyApp.tsx', 'src/ops/OverlayApp.tsx']);
    for (const f of receivers) {
      const h = handler(f, 'emote');
      expect(h, f).toMatch(/from (!==|===) 'main'/);
      expect(h, f).toContain('emoteMsg(p)');
      /* tiché: žádný zvuk, bublina, probuzení, fokus, okno ani nativní volání */
      for (const word of ['sound', 'Sound', 'showLine', 'setBubble', 'setSaid', 'wake(', 'native.', 'focus', '.show(', 'activity.current']) expect(h.includes(word), `${f}: ${word}`).toBe(false);
    }
    /* hub: emoce jen při běžícím snímání a bez stavu se zvukem */
    const emote = hub.slice(hub.indexOf('const emote = '), hub.indexOf('const emoteStart'));
    expect(emote).toContain('if (!autoActive(st())) return;');
    expect(emote).not.toMatch(/say\(|status\(|SOUND_OF|native\./);
  });

  it('žádná nová událost z Rustu ani příkaz; automatický snímek dál bez capture-start', () => {
    const rs = walk(join(root, 'src-tauri', 'src'), /\.rs$/).map(f => readFileSync(f, 'utf8')).join('\n');
    expect(rs).not.toContain('"emote"');
    expect(manifest).not.toContain('emote');
    const kinds = [...rs.matchAll(/emit_native\([^,]+,[^,]+,\s*"([a-z-]+)"/g)].map(m => m[1]);
    expect([...new Set(kinds)].sort()).toEqual(['auto-screen', 'capture-failed', 'capture-ready', 'capture-start', 'game', 'game-visible', 'open', 'overlay', 'widgets-hide', 'widgets-mode', 'win-close', 'win-tray'].sort());
    expect(body('src-tauri/src/ops.rs', 'start_capture_as')).toMatch(/if auto\.is_none\(\) \{\s*emit_native\(&app, MAIN, "capture-start", \(\)\);/);
  });
});

/* 0.22.0: widgety nad hrou. Trasy zpráv jen hlavní ↔ widgety, okno widgetů smí poslat jen pozdrav a dvě úpravy
   z allow-listu, ve Hře propouští myš a nejde aktivovat, rozložení nejsou ve stavu aplikace ani v záloze. */
describe('0.22.0: okno widgetů', () => {
  const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = () => walk(join(root, 'src'), /\.tsx?$/).map(f => [f.slice(root.length).split('\\').join('/'), code(f.slice(root.length))] as const);

  it('trasy zpráv: jen hlavní ↔ widgety (v Rustu pevně, žádná trasa widgety ↔ buddy či overlay)', () => {
    const route = body('src-tauri/src/bus.rs', 'route_ok');
    expect(route.match(/\((MAIN|BUDDY|OVERLAY|WIDGETS), (MAIN|BUDDY|OVERLAY|WIDGETS)\)/g)!.sort())
      .toEqual(['(BUDDY, MAIN)', '(MAIN, BUDDY)', '(MAIN, OVERLAY)', '(MAIN, WIDGETS)', '(OVERLAY, MAIN)', '(WIDGETS, MAIN)'].sort());
  });

  it('hub přijímá od okna widgetů jen pozdrav a úpravy z allow-listu s mezemi argumentů', () => {
    const hub = code('src/ops/hub.ts');
    expect(hub).toContain("if (from !== 'widgets' || !widgetsOn(st())) return;");
    expect(hub).toContain('applyWidgetAction(app, p)');
    expect(code('src/store/relay.ts')).toContain("export const WIDGET_ACTIONS = ['questObjective', 'setRaidFound'] as const");
    /* okno widgetů posílá hlavnímu oknu jen widgetAction (a pozdrav přes startHello) */
    const sends = sources().filter(([f]) => /src\/ops\/Widget/.test(f)).flatMap(([, s]) => [...s.matchAll(/bus\.send\('(\w+)', '([a-zA-Z-]+)'/g)].map(m => m[1] + ':' + m[2]));
    expect([...new Set(sends)]).toEqual(['main:widgetAction']);
  });

  it('Hra: okno propouští myš a nejde aktivovat; Úpravy jen výslovně; po nich zase propouští', () => {
    const open = body('src-tauri/src/ops.rs', 'widgets_open');
    /* 0.22.1: viditelné od vytvoření (tao: SW_SHOWNOACTIVATE); show() po vytvoření by okno aktivovalo */
    for (const s of ['.focusable(false)', '.focused(false)', '.visible(true)', 'set_ignore_cursor_events(true)', 'exclude_from_capture(&w)']) expect(open, s).toContain(s);
    expect(open.includes('.show()'), 'show').toBe(false);
    const rs = read('src-tauri/src/ops.rs');
    const edit = rs.slice(rs.indexOf('fn set_edit'), rs.indexOf('fn widgets_fit'));
    for (const s of ['set_ignore_cursor_events(false)', 'set_ignore_cursor_events(true)', 'set_focusable(false)']) expect(edit, s).toContain(s);
    expect(edit).toMatch(/if foreground_pid\(\) == Some\(std::process::id\(\)\) \{\s*restore_focus\(prev, pid\);/);
    /* Úpravy zapíná jen příkaz widgets_edit a zkratka; Alt+F4 a zavření okna je jen vypínají */
    const calls = [...rs.slice(0, rs.indexOf('#[cfg(test)]')).matchAll(/set_edit\(((?:[^()]|\([^()]*\))*)\)/g)].map(m => m[1].replace(/\s+/g, ''));
    /* 0.22.1: hlídací smyčka Úpravy jen ukončí (návrat do hry) */
    expect(calls.sort()).toEqual(['&app,Some(false)', '&app,Some(false)', '&app,on', 'app,None', 'w.app_handle(),Some(false)'].sort());
  });

  it('rozložení: jen v místním úložišti okna widgetů, ne ve stavu, záloze ani hubu', () => {
    expect(sources().filter(([, s]) => s.includes('writeWidgetPrefs(')).map(([f]) => f).sort()).toEqual(['src/ops/WidgetsApp.tsx', 'src/ops/widgetPrefs.ts']);
    expect(read('src/core/types.ts')).not.toMatch(/layouts\s*:/);
    expect(code('src/core/backup.ts')).not.toContain('widget');
    expect(code('src/ops/hub.ts')).not.toContain('localStorage');
  });
});

/* 0.22.1: buddy ani widgety nikdy nevezmou hře fokus. Cesty, které běží během hry (hlídací smyčka, propouštění myši,
   automatický snímek, zkratka Skrýt / zobrazit, umístění widgetů, ukázání buddyho), nesmí nic aktivovat; okno buddyho
   nejde aktivovat a při hře v popředí propouští myš; klik z buddyho se při hře v popředí odmítne. Jen okenní API:
   žádný háček myši či klávesnice, žádné vkládání vstupu, žádné čtení kurzoru ani stavu kláves. */
describe('0.22.1: buddy nikdy nevezme hře fokus', () => {
  const rs = () => read('src-tauri/src/ops.rs');
  const src = () => { const r = rs(); return r.slice(0, r.search(/#\[cfg\(test\)\]\s*mod tests/)); };
  /* tělo funkce podle závorek (od `fn name` po párovou `}`) */
  const fnBody = (name: string) => {
    const s = src(), i = s.search(new RegExp(`fn ${name}\\b`));
    if (i < 0) throw new Error(name);
    let depth = 0, j = s.indexOf('{', i);
    for (let k = j; k < s.length; k++) {
      if (s[k] === '{') depth++;
      else if (s[k] === '}' && --depth === 0) return s.slice(i, k + 1);
    }
    throw new Error(name);
  };
  const ACTIVATING = ['set_focus', 'SetForegroundWindow', 'unminimize', 'set_always_on_top', 'show_overlay', 'force_window_active', '.show()', 'set_focusable(true)', 'restore_focus', 'main_focus', 'show_main'];

  it('okno buddyho nejde aktivovat a nové okno se hned nastaví podle okna v popředí', () => {
    const open = fnBody('buddy_open');
    for (const s of ['.focusable(false)', '.focused(false)', '.visible(true)', 'exclude_from_capture(&w)', 'set_ignore_cursor_events(true)', 'buddy_ready.store(false']) expect(open, s).toContain(s);
    for (const s of ACTIVATING) expect(open.includes(s), s).toBe(false);
    /* tao: okno vytvořené skryté a ukázané přes show() dostane SW_SHOW (aktivace); proto se buddy ani widgety po
       vytvoření nikdy neukazují. Reveal jen označí buddyho za umístěného a nastaví propouštění myši. */
    const reveal = fnBody('buddy_reveal');
    for (const s of ACTIVATING) expect(reveal.includes(s), `buddy_reveal: ${s}`).toBe(false);
    expect(reveal).toContain('buddy_ready.store(true');
    expect(reveal).toContain('refresh_buddy_pass(app)');
    expect(src().includes('reveal_no_activate')).toBe(false);
    expect(src().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bSW_SHOW\b|SW_SHOWNORMAL|\bSW_RESTORE\b/);
    /* neumístěný buddy propouští myš vždy */
    expect(fnBody('apply_buddy_pass')).toContain("!st.buddy_ready.load(Ordering::SeqCst) ||");
  });

  it('cesty během hry nic neaktivují', () => {
    for (const fn of ['ops_watch', 'apply_buddy_pass', 'refresh_buddy_pass', 'buddy_click_guard', 'foreground_now', 'fit_widgets', 'widgets_fit', 'start_capture_as', 'ops_passthrough', 'win_place']) {
      const b = fnBody(fn);
      for (const s of ACTIVATING) expect(b.includes(s), `${fn}: ${s}`).toBe(false);
    }
    /* 0.23.0: Skrýt / zobrazit z buddyho a z oznamovací oblasti jen pošle událost oknu widgetů */
    for (const fn of ['widgets_hide', 'toggle_widgets_hidden']) {
      const b = fnBody(fn);
      for (const s of ACTIVATING) expect(b.includes(s), `${fn}: ${s}`).toBe(false);
    }
    expect(fnBody('toggle_widgets_hidden')).toContain('emit_native(app, WIDGETS, "widgets-hide", ())');
    const tray = read('src-tauri/src/mainwin.rs');
    expect(tray).toContain('"widgets" => ops::toggle_widgets_hidden(app),');
    /* 0.23.0: zkratka konzole otevře konzoli s fokusem jen na výslovný stisk (zkratka je ve výchozím stavu prázdná) */
    expect(fnBody('on_hotkey')).toMatch(/if is\(&st\.console_key\) \{[\s\S]*?hide_overlay\(app\);[\s\S]*?show_overlay\(app, None\);[\s\S]*?return;\s*\}/);
    /* zkratka Skrýt / zobrazit widgety jen pošle událost */
    const hk = fnBody('on_hotkey');
    expect(hk).toMatch(/if is\(&st\.hide_key\) \{\s*if app\.get_webview_window\(WIDGETS\)\.is_some\(\) \{\s*emit_native\(app, WIDGETS, "widgets-hide", \(\)\);\s*\}\s*return;/);
    /* widgety: vznik bez aktivace a s propouštěním myši (stráž 0.22.0 výše) */
    expect(fnBody('widgets_open')).toContain('.focusable(false)');
  });

  it('hlídací smyčka přepíná propouštění myši a ukončí Úpravy po návratu do hry', () => {
    const w = fnBody('ops_watch');
    expect(w).toContain('apply_buddy_pass(&app, fg);');
    expect(w).toMatch(/if edit_must_end\(st\.edit\.load\(Ordering::SeqCst\), fg, since, now\) \{\s*let _ = set_edit\(&app, Some\(false\)\);/);
    /* rozhodnutí je čistá funkce: hra v popředí = podle volby, vlastní okno a jiný program = kliknout jde */
    const d = fnBody('buddy_pass_through');
    expect(d).toContain('Foreground::Game => pref_on,');
    expect(d).toContain('Foreground::Own | Foreground::Other => false,');
    expect(fnBody('apply_buddy_pass')).toContain('set_ignore_cursor_events(want)');
  });

  it('klik, tažení a Úpravy z buddyho se při hře v popředí odmítnou dřív, než cokoli otevřou', () => {
    const toggle = fnBody('overlay_toggle');
    expect(toggle.indexOf('buddy_click_guard(&app)?;')).toBeGreaterThan(0);
    expect(toggle.indexOf('buddy_click_guard(&app)?;')).toBeLessThan(toggle.indexOf('show_overlay'));
    const drag = fnBody('win_drag');
    expect(drag.indexOf('buddy_click_guard(window.app_handle())?;')).toBeGreaterThan(0);
    expect(drag.indexOf('buddy_click_guard')).toBeLessThan(drag.indexOf('start_dragging'));
    expect(fnBody('widgets_edit')).toMatch(/if window\.label\(\) == BUDDY \{\s*buddy_click_guard\(&app\)\?;\s*\}\s*set_edit\(&app, on\)/);
    expect(fnBody('buddy_click_ok')).toContain('!(pref_on && fg == Foreground::Game)');
    /* volbu mění jen hlavní okno */
    expect(fnBody('ops_passthrough')).toContain('main_only(&window)?');
  });

  it('jen okenní API: žádný háček, vkládání vstupu, kurzor ani stav kláves', () => {
    const all = walk(join(root, 'src-tauri', 'src'), /\.rs$/).map(f => readFileSync(f, 'utf8')).join('\n');
    for (const api of ['SetWindowsHookEx', 'SendInput', 'mouse_event', 'keybd_event', 'GetCursorPos', 'GetAsyncKeyState', 'GetKeyState', 'GetKeyboardState', 'RegisterRawInputDevices', 'ClipCursor', 'SetCursorPos', 'AttachThreadInput']) {
      expect(all.includes(api), api).toBe(false);
    }
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).not.toMatch(/Win32_UI_Input|KeyboardAndMouse|rdev|enigo|device_query|inputbot/);
  });

  it('0.23.0: Skrýt / zobrazit widgety u Opse jen pošle událost; Úpravy dál přes widgets_edit se stráží kliku', () => {
    const b = read('src/ops/BuddyApp.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const i = b.indexOf('data-testid="buddy-hide"');
    expect(i).toBeGreaterThan(0);
    const btn = b.slice(i, b.indexOf('</button>', i));
    expect(btn).toContain('native.widgetsHide?.().catch(() => undefined)');
    for (const w of ['widgetsEdit', 'overlayToggle', 'focus', '.show(', 'touchAt', 'sound']) expect(btn.includes(w), w).toBe(false);
    expect(b).toContain('paused={view.calm}');
    expect(read('src/ops/native.ts')).toContain("widgetsHide: () => call('widgets_hide')");
  });

  it('buddy v prohlížeči i v Tauri: odmítnutý klik nic nehlásí a okno se samo neukazuje', () => {
    const b = read('src/ops/BuddyApp.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(b).toContain('native.overlayToggle().catch(() => undefined)');
    expect(b.includes('.show()')).toBe(false);
    expect(b.includes('setFocus')).toBe(false);
  });
});
