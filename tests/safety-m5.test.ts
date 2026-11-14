/* Bezpečnost milníku 5 (buddy, overlay a zkratka): aplikace nikdy neposílá vstup do hry, nesahá do cizí paměti ani
   procesů, nemá síťového klienta; snímání, zkratka a seznam procesů žijí jen v src-tauri/src/ops.rs. Výchozí stav je
   vypnuto a snímek se nikam nezapisuje. tests/safety.test.ts zůstává beze změny. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultState, normalize } from '../src/core/state';
import { emptyBuddy } from '../src/core/ops';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string, re: RegExp): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p, re) : re.test(n) ? [p] : [];
});
const rel = (f: string) => f.slice(root.length).split('\\').join('/');
/* obsah souborů se načte jednou (hledá se v nich mnoho slov; opakované čtení velkých datových souborů zdržovalo) */
const cache = new Map<string, string>();
const load = (abs: string) => { let s = cache.get(abs); if (s === undefined) { s = readFileSync(abs, 'utf8'); cache.set(abs, s); } return s; };
const read = (f: string) => load(join(root, f));

const TS = walk(join(root, 'src'), /\.(tsx?)$/);
const RS = walk(join(root, 'src-tauri', 'src'), /\.rs$/);
const ALL = [...TS, ...RS];
const OPS_RS = 'src-tauri/src/ops.rs';

describe('bezpečnost milníku 5', () => {
  it('nikde se neposílá vstup, nevkládá háček ani nesahá do paměti či procesů hry', () => {
    for (const word of [
      'SendInput', 'keybd_event', 'mouse_event', 'SetWindowsHookEx', 'ReadProcessMemory', 'WriteProcessMemory', 'CreateRemoteThread',
      'OpenProcess', 'PROCESS_VM_READ', 'PROCESS_ALL_ACCESS', 'VirtualAllocEx', 'NtReadVirtualMemory', 'PostMessage', 'SendMessage',
      'WM_KEYDOWN', 'WM_MOUSEWHEEL', 'LowLevelKeyboardProc', 'WH_KEYBOARD', 'WH_MOUSE', 'MiniDumpWriteDump', 'DebugActiveProcess',
    ]) expect(ALL.filter(f => load(f).includes(word)).map(rel), word).toEqual([]);
  });

  it('žádný síťový klient v src/ ani src-tauri/src', () => {
    for (const word of ['reqwest', 'ureq', 'hyper::', 'TcpStream', 'UdpSocket', 'std::net', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']) {
      expect(ALL.filter(f => load(f).includes(word)).map(rel), word).toEqual([]);
    }
  });

  it('snímání obrazovky, globální zkratka, seznam procesů a Win32 jsou jen ve vyhrazeném modulu ops.rs', () => {
    for (const word of [
      'BitBlt', 'GetDC', 'CreateDIBSection', 'CreateToolhelp32Snapshot', 'Process32', 'SetWindowDisplayAffinity', 'GetForegroundWindow',
      'SetForegroundWindow', 'windows_sys', 'global_shortcut', 'GlobalShortcutExt', 'RegisterHotKey', 'capture_foreground_monitor',
    ]) expect(RS.map(rel).filter(f => read(f).includes(word) && f !== OPS_RS), word).toEqual([]);
    const ops = read(OPS_RS);
    for (const word of ['BitBlt', 'CreateToolhelp32Snapshot', 'tauri_plugin_global_shortcut', 'WDA_EXCLUDEFROMCAPTURE']) expect(ops, word).toContain(word);
    /* snímek se nikdy nezapisuje na disk */
    for (const word of ['std::fs', 'fs::', 'File::', 'OpenOptions', 'write_all']) expect(ops.includes(word), word).toBe(false);
    /* lib.rs jen zaregistruje modul a jeho příkazy */
    expect(read('src-tauri/src/lib.rs')).toMatch(/mod ops;/);
  });

  it('seznam procesů se čte jen v ops.rs: v hlídací smyčce a jednou při startu (0.8.0), lib.rs jen zavolá ops::game_running_now', () => {
    for (const word of ['process_names', 'ShowWindow', 'SW_SHOW', 'is_game_exe']) {
      expect(RS.map(rel).filter(f => read(f).includes(word) && f !== OPS_RS), word).toEqual([]);
    }
    const ops = read(OPS_RS);
    const code = ops.slice(0, ops.indexOf('#[cfg(test)]'));
    /* volání process_names(): jen any_game ve smyčce ops_watch a v game_running_now (definice ve win modulu a zástupce se nepočítají) */
    const calls = [...code.matchAll(/any_game\(&process_names\(\)\)/g)].length;
    expect(calls).toBe(2);
    expect(code.match(/process_names\(\)/g)!.length).toBe(2 + 2); /* 2 volání + 2 definice (Windows a ostatní) */
    const startFn = code.slice(code.indexOf('pub fn game_running_now'), code.indexOf('}', code.indexOf('pub fn game_running_now')));
    expect(startFn).not.toMatch(/loop|while|thread::spawn|sleep/);
    /* jen minimalizované zobrazení bez aktivace; žádné SetForegroundWindow kvůli startu */
    expect(ops).toContain('SW_SHOWMINNOACTIVE');
    expect(code.match(/ShowWindow\(/g)!.length).toBe(1);

    const lib = read('src-tauri/src/lib.rs');
    expect(lib.match(/ops::game_running_now\(\)/g)!.length).toBe(1);
    const setup = lib.slice(lib.indexOf('.setup(|app|'), lib.indexOf('.invoke_handler('));
    expect(setup).toContain('ops::game_running_now()');
    expect(setup).toMatch(/if game_running \{\s*builder = builder\.focused\(false\)\.visible\(false\);/);
    expect(setup).toContain('ops::show_in_background(&main)');
    expect(lib).not.toMatch(/\bloop\b|\bwhile\b|thread::spawn|windows_sys/);
    /* hlavní okno se vytváří v setup (create: false), aby šlo vytvořit bez fokusu */
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.app.windows.find((w: { label: string }) => w.label === 'main').create).toBe(false);
    /* frontend se jen zeptá, jak se aplikace spustila */
    expect(TS.filter(f => load(f).includes("'launch_info'")).map(rel)).toEqual(['src/ops/native.ts']);
  });

  it('instalátor po dokončení aplikaci sám nespustí (volba je ve výchozím stavu vypnutá) a radí zavřít hru', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    const nsis = conf.bundle.windows.nsis;
    expect(nsis.installerHooks).toBe('nsis/hooks.nsh');
    expect(nsis.customLanguageFiles).toEqual({ Czech: 'nsis/Czech.nsh', English: 'nsis/English.nsh' });
    const hooks = read('src-tauri/nsis/hooks.nsh');
    expect(hooks).toMatch(/^!define MUI_FINISHPAGE_RUN_NOTCHECKED$/m);
    expect(hooks).toMatch(/^!define MUI_FINISHPAGE_TEXT "\$\(gameHint\)"$/m);
    expect(/[^\x00-\x7f]/.test(hooks)).toBe(false);
    /* hook nic nespouští a nesahá na procesy */
    expect(hooks).not.toMatch(/^\s*(Exec|nsis_tauri_utils|!macro|Function)/m);
    for (const [f, lang] of [['Czech.nsh', 'LANG_CZECH'], ['English.nsh', 'LANG_ENGLISH']]) {
      const txt = read('src-tauri/nsis/' + f);
      expect(txt.charCodeAt(0), f + ' bez BOM').not.toBe(0xfeff);
      expect(txt).toMatch(new RegExp(`^LangString gameHint \\$\\{${lang}\\} ".*(borderless|bez okraje).*"$`, 'm'));
      expect(txt.includes('{{'), f).toBe(false);
    }
  });

  it('frontend obrazovku nesnímá ani nemá přístup ke zkratkám; snímek přijde jen z Rustu do paměti', () => {
    for (const word of ['getDisplayMedia', 'getUserMedia', 'globalShortcut', 'global-shortcut', 'desktopCapturer', 'plugin:global']) {
      expect(TS.filter(f => load(f).includes(word)).map(rel), word).toEqual([]);
    }
    expect(TS.filter(f => load(f).includes("'capture_take'")).map(rel)).toEqual(['src/ops/native.ts']);
    /* zpracování snímku nezná úložiště ani převod do souboru */
    for (const f of ['src/ops/hub.ts', 'src/core/opsCapture.ts', 'src/ops/native.ts']) {
      const s = read(f);
      for (const word of ['localStorage', 'toDataURL', 'toBlob', 'createObjectURL', 'storage.save', 'saveImportRaw', 'new Blob']) expect(s.includes(word), `${f}: ${word}`).toBe(false);
    }
  });

  it('Cargo.toml: jen zkratka přes RegisterHotKey a windows-sys, žádné knihovny pro vstup, snímání nebo síť', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).toContain('tauri-plugin-global-shortcut');
    for (const dep of ['enigo', 'rdev', 'inputbot', 'device_query', 'winapi', 'screenshots', 'xcap', 'scrap', 'reqwest', 'tauri-plugin-shell', 'tauri-plugin-http', 'tauri-plugin-updater']) {
      expect(new RegExp(`^\\s*${dep}\\s*=`, 'm').test(cargo), dep).toBe(false);
    }
    expect(cargo).not.toMatch(/Win32_System_Memory|Win32_UI_Input|Win32_System_Diagnostics_Debug/);
  });

  /* 0.23.0: panel „Zátěž aplikace“ měří jen vlastní proces. Win32_System_Threading a Win32_System_ProcessStatus
     smí ops.rs použít jen na pseudo-handle GetCurrentProcess() a jen ke čtení (časy procesu, čítače paměti).
     Žádný jiný proces se neotevírá ani nečte; vlákna, priority ani ukončení procesů se nemění. */
  it('zátěž aplikace: jen vlastní proces, jen čtení (GetCurrentProcess, GetProcessTimes, GetProcessMemoryInfo)', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).toMatch(/"Win32_System_Threading", "Win32_System_ProcessStatus"/);
    const ops = read(OPS_RS);
    /* bez komentářů (dokumentace funkce názvy API zmiňuje) */
    const code = ops.slice(0, ops.indexOf('#[cfg(test)]')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* jediné importy z obou modulů */
    const uses = [...code.matchAll(/use windows_sys::Win32::System::(Threading|ProcessStatus)::\{([^}]*)\};/g)].map(m => m[1] + ':' + m[2].replace(/\s+/g, ''));
    expect(uses.sort()).toEqual(['ProcessStatus:GetProcessMemoryInfo,PROCESS_MEMORY_COUNTERS,PROCESS_MEMORY_COUNTERS_EX', 'Threading:GetCurrentProcess,GetProcessTimes']);
    expect(code.match(/System::(Threading|ProcessStatus)/g)!.length).toBe(2);
    for (const f of RS.map(rel).filter(x => x !== OPS_RS)) expect(read(f), f).not.toMatch(/Threading|ProcessStatus|GetProcessTimes|GetProcessMemoryInfo|GetCurrentProcess/);
    /* oba dotazy jen na vlastní proces (pseudo-handle, nic se neotevírá ani nezavírá) */
    const fn = code.slice(code.indexOf('pub fn own_load()'), code.indexOf('pub fn game_pids()'));
    expect(fn).toContain('let me = GetCurrentProcess();');
    expect(fn).toMatch(/GetProcessTimes\(me, /);
    expect(fn).toMatch(/GetProcessMemoryInfo\(me, /);
    expect(code.match(/GetProcessTimes\(/g)!.length).toBe(1);
    expect(code.match(/GetProcessMemoryInfo\(/g)!.length).toBe(1);
    expect(code.match(/GetCurrentProcess\(\)/g)!.length).toBe(1);
    expect(fn).not.toMatch(/CloseHandle|OpenProcess|DuplicateHandle|th32ProcessID|pids/);
    /* žádné jiné API z Threading (ukončení, vlákna, priority, čekání na cizí procesy) */
    const all = RS.map(f => load(f)).join('\n');
    for (const api of ['TerminateProcess', 'CreateProcess', 'CreateThread', 'OpenThread', 'SuspendThread', 'ResumeThread', 'SetPriorityClass', 'SetProcessAffinityMask', 'SetThreadPriority', 'QueueUserAPC', 'NtQueryInformationProcess', 'EnumProcesses', 'EnumProcessModules', 'GetModuleFileNameEx', 'QueryFullProcessImageName']) {
      expect(all.includes(api), api).toBe(false);
    }
    /* příkaz jen pro hlavní okno */
    const cmd = code.slice(code.indexOf('pub async fn app_load'), code.indexOf('pub fn filetime_us'));
    expect(cmd).toContain('main_only(&window)?');
    expect(cmd).toContain('own_load()');
  });

  it('okna buddy a overlay mají jen základní oprávnění; žádná okna nesmí zkratky ani shell z JS', () => {
    /* 0.16.1: každé okno má vlastní capability bez core:default; poloha, velikost a tažení jdou přes příkazy, které
       mění jen volající okno (úplné seznamy hlídá tests/safety-acl.test.ts) */
    const buddy = JSON.parse(read('src-tauri/capabilities/buddy.json'));
    const overlay = JSON.parse(read('src-tauri/capabilities/overlay.json'));
    expect(buddy.windows).toEqual(['buddy']);
    expect(overlay.windows).toEqual(['overlay']);
    for (const cap of [buddy, overlay]) {
      for (const p of cap.permissions as string[]) expect(/^core:(default|tray|menu|image|path|app|webview)|allow-set-|allow-show|allow-start-dragging|allow-emit|allow-storage|allow-snapshot|allow-capture-take|allow-ops-/.test(p), p).toBe(false);
    }
    for (const f of readdirSync(join(root, 'src-tauri', 'capabilities'))) {
      const txt = read('src-tauri/capabilities/' + f);
      expect(/global-shortcut|shell:|http:|fs:/.test(txt), f).toBe(false);
    }
    /* ukládat smí jen hlavní okno */
    const lib = read('src-tauri/src/lib.rs');
    for (const cmd of ['fn storage_save', 'fn snapshot_create', 'fn snapshot_delete', 'fn import_save_raw']) {
      const body = lib.slice(lib.indexOf(cmd), lib.indexOf('}', lib.indexOf(cmd)));
      expect(body, cmd).toContain('main_window(&window)?');
    }
  });

  it('výchozí stav je vypnuto, i u starší zálohy a nesmyslných dat', () => {
    expect(emptyBuddy().enabled).toBe(false);
    expect(defaultState().buddy.enabled).toBe(false);
    expect(defaultState().buddy.hotkey).toBe('');
    expect(defaultState().buddy.autoOpen).toBe(false);
    expect(normalize({ schema: 5 }).buddy.enabled).toBe(false);
    expect(normalize({ buddy: { enabled: 1, hotkey: 'A', autoOpen: 'true' } }).buddy).toMatchObject({ enabled: false, hotkey: '', autoOpen: false });
  });
});
