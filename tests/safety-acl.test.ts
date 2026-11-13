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
  'allow-overlay-open', 'allow-main-focus', 'allow-capture-now', 'allow-capture-take', 'allow-ops-autocapture', 'allow-ops-autostats',
  'allow-main-mode', 'allow-main-pin', 'allow-main-geometry', 'allow-main-drag', 'allow-main-minimize', 'allow-main-hide', 'allow-main-show',
  'allow-main-ready', 'allow-app-quit', 'allow-tray-sync',
];
const BUDDY = [
  'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-available-monitors', 'core:window:allow-primary-monitor',
  'allow-bus-send', 'allow-buddy-reveal', 'allow-overlay-toggle', 'allow-win-place', 'allow-win-drag',
];
const OVERLAY = [
  'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-outer-position', 'core:window:allow-inner-size',
  'core:window:allow-available-monitors', 'core:window:allow-current-monitor', 'core:window:allow-primary-monitor',
  'allow-bus-send', 'allow-overlay-close', 'allow-capture-now', 'allow-open-external', 'allow-win-place',
];

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
    expect(files).toEqual(['buddy.json', 'main.json', 'overlay.json']);
    expect(cap('main')).toMatchObject({ identifier: 'main', windows: ['main'] });
    expect(cap('buddy')).toMatchObject({ identifier: 'buddy', windows: ['buddy'] });
    expect(cap('overlay')).toMatchObject({ identifier: 'overlay', windows: ['overlay'] });
    expect(cap('main').permissions).toEqual(MAIN);
    expect(cap('buddy').permissions).toEqual(BUDDY);
    expect(cap('overlay').permissions).toEqual(OVERLAY);
  });

  it('žádné okno nemá core:default, emit z JS, tray, menu, obrázky, cesty ani cizí ovládání oken', () => {
    for (const name of ['main', 'buddy', 'overlay']) {
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
    const granted = ['main', 'buddy', 'overlay'].flatMap(n => cap(n).permissions).filter(p => p.startsWith('allow-')).map(p => p.slice(6).replace(/-/g, '_'));
    for (const g of granted) expect(manifest, g).toContain(g);
    /* buddy a overlay nesmí číst stav, snímky ani složku dat, ukládat, ovládat zkratku nebo hlavní okno */
    for (const n of ['buddy', 'overlay']) {
      for (const p of cap(n).permissions) expect(/storage|snapshot|import|export|data-dir|launch-info|ops-|buddy-open|buddy-close|capture-take|main-|app-quit|tray-sync|overlay-open/.test(p), `${n}: ${p}`).toBe(false);
    }
  });

  it('citlivé příkazy kontrolují štítek volajícího okna', () => {
    for (const fn of ['storage_load', 'storage_save', 'snapshot_create', 'snapshot_list', 'snapshot_read', 'snapshot_delete', 'import_save_raw', 'export_backup', 'import_backup', 'data_dir', 'open_data_dir', 'launch_info']) {
      expect(body('src-tauri/src/lib.rs', fn), fn).toContain('main_window(&window)?');
    }
    expect(body('src-tauri/src/lib.rs', 'open_external')).toContain('bus::only(&window, &[bus::MAIN, bus::OVERLAY])?');
    /* 0.20.0: automatické snímání a jeho měření jen z hlavního okna */
    for (const fn of ['ops_enable', 'ops_hotkey', 'ops_watch', 'buddy_open', 'buddy_close', 'overlay_open', 'main_focus', 'capture_take', 'ops_autocapture', 'ops_autostats']) {
      expect(body('src-tauri/src/ops.rs', fn), fn).toContain('main_only(&window)?');
    }
    expect(body('src-tauri/src/ops.rs', 'buddy_reveal')).toContain('window.label() != BUDDY');
    expect(body('src-tauri/src/ops.rs', 'overlay_close')).toContain('only(&window, &[OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'overlay_toggle')).toContain('only(&window, &[BUDDY])?');
    expect(body('src-tauri/src/ops.rs', 'capture_now')).toContain('only(&window, &[MAIN, OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'win_place')).toContain('only(&window, &[BUDDY, OVERLAY])?');
    expect(body('src-tauri/src/ops.rs', 'win_drag')).toContain('only(&window, &[BUDDY])?');
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
    expect([...new Set(kinds)].sort()).toEqual(['auto-screen', 'capture-failed', 'capture-ready', 'capture-start', 'game', 'game-visible', 'open', 'overlay', 'win-close', 'win-tray'].sort());
    expect(body('src-tauri/src/ops.rs', 'start_capture_as')).toMatch(/if auto\.is_none\(\) \{\s*emit_native\(&app, MAIN, "capture-start", \(\)\);/);
  });
});
