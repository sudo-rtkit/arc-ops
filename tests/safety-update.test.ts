/* 0.33.0: bezpečnost volitelné kontroly nové verze (repozitář je veřejný). Síť jen v Rustu (src-tauri/src/update.rs),
   jen z hlavního okna, jen pevná adresa api.github.com, příkaz bez argumentů z okna, hlavičky jen User-Agent
   (název a verze aplikace) a Accept. CSP, trasy busu, události native: ani akce relay se nemění; okna nad hrou nic
   z kontroly nemají. Poznámky k vydání jen jako prostý text a stránka vydání se otevře jen podle pevného pravidla. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKED_ACTIONS, isRelayAction, RELAY_ACTIONS } from '../src/store/relay';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f: string) => readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n');
/* bez komentářů; „//“ za dvojtečkou (adresa v řetězci) zůstane */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const walk = (dir: string, re: RegExp): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p, re) : re.test(n) ? [p] : [];
});
const rel = (f: string) => f.slice(root.length).split('\\').join('/');
const cap = (n: string) => JSON.parse(read(`src-tauri/capabilities/${n}.json`)) as { permissions: string[] };
const UP_RS = 'src-tauri/src/update.rs';
const rsSrc = () => { const r = read(UP_RS); return r.slice(0, r.search(/#\[cfg\(test\)\]\s*mod tests/)); };
const fnBody = (name: string, src = rsSrc()) => {
  const i = src.search(new RegExp(`fn ${name}\\b`));
  if (i < 0) throw new Error(name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(name);
};
/* bez komentářů (jen pro hledání zakázaných slov; adresy v textu se tím ořežou) */
const rsCode = () => rsSrc().replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const implOf =(head: string) => { const s = rsSrc(), i = s.indexOf(head); return fnBody('get', s.slice(i)); };

describe('0.33.0: kontrola nové verze: příkaz a oprávnění', () => {
  it('update_check je v build.rs, v generate_handler! a jen v capability hlavního okna', () => {
    expect(read('src-tauri/build.rs')).toContain('"update_check"');
    expect(read('src-tauri/src/lib.rs')).toContain('update::update_check,');
    expect(read('src-tauri/src/lib.rs')).toMatch(/\nmod update;\n/);
    expect(cap('main').permissions).toContain('allow-update-check');
    for (const w of ['buddy', 'overlay', 'widgets']) for (const p of cap(w).permissions) expect(/update/.test(p), `${w}: ${p}`).toBe(false);
    /* žádná nová capability ani oprávnění Tauri navíc */
    expect(readdirSync(join(root, 'src-tauri', 'capabilities')).sort()).toEqual(['buddy.json', 'main.json', 'overlay.json', 'widgets.json']);
    expect(cap('main').permissions.filter(p => !p.startsWith('allow-'))).toEqual(['core:event:allow-listen', 'core:event:allow-unlisten']);
  });

  it('příkaz ověří hlavní okno v Rustu dřív, než cokoli udělá, a nebere od okna žádný argument', () => {
    const cmd = fnBody('update_check');
    expect(rsSrc()).toContain("pub async fn update_check<R: Runtime>(window: WebviewWindow<R>, st: State<'_, UpdateState>) -> Result<UpdateInfo, String> {");
    expect(cmd.indexOf('crate::bus::only(&window, &[crate::bus::MAIN])')).toBeGreaterThan(0);
    expect(cmd.indexOf('crate::bus::only')).toBeLessThan(cmd.indexOf('st.0'));
    /* verze aplikace z Tauri (package info), hra v popředí z Rustu, běh mimo vlákno UI */
    expect(cmd).toContain('window.app_handle().package_info().version.to_string()');
    expect(cmd).toContain('crate::ops::game_in_front()');
    expect(cmd).toContain('spawn_blocking');
    expect(fnBody('main_label')).toContain('if label == crate::bus::MAIN');
    /* pořadí: okno → verze aplikace → hra v popředí → limit (uložený výsledek) → pevná adresa → síť */
    const chk = fnBody('check_for');
    const order = ['main_label(label)?', 'parse_version(current)', 'if game_front', 'up.last.lock()', 'MIN_INTERVAL', 'url_fixed_ok(URL)', 'up.fetch.get(URL, &user_agent(cur))'];
    for (let i = 1; i < order.length; i++) expect(chk.indexOf(order[i - 1]), order[i]).toBeLessThan(chk.indexOf(order[i]));
    expect(chk.indexOf(order[0])).toBeGreaterThan(0);
    expect([...chk.matchAll(/\.fetch\.get\(/g)].length).toBe(1);
    /* do deníku jen kód chyby */
    expect(cmd).toContain('crate::diag::rust(crate::diag::Level::Warn, "update check", e.code());');
  });

  it('jediná pevná adresa (HTTPS, api.github.com, tento repozitář), stránka vydání jen s pevnou předponou', () => {
    const src = rsSrc();
    expect([...src.matchAll(/"(https?:\/\/[^"]+)"/g)].map(m => m[1]).sort()).toEqual([
      'https://api.github.com/repos/sudo-rtkit/arc-ops/releases/latest',
      'https://github.com/sudo-rtkit/arc-ops/releases/',
    ]);
    expect(src).toContain('pub const URL: &str = "https://api.github.com/repos/sudo-rtkit/arc-ops/releases/latest";');
    expect(src).toContain('pub const RELEASES_PREFIX: &str = "https://github.com/sudo-rtkit/arc-ops/releases/";');
    expect(src).toContain('pub const HOST: &str = "api.github.com";');
    expect(fnBody('url_ok')).toContain('url.strip_prefix(RELEASES_PREFIX).is_some_and(|rest| rest.strip_prefix("tag/") == Some(tag))');
    expect(fnBody('parse_release')).toContain('if !url_ok(&url, &tag)');
    expect(fnBody('parse_release')).toContain('r.draft == Some(true) || r.prerelease == Some(true)');
    /* klient: jen https, bez přesměrování (společný agent z ai.rs) */
    expect(fnBody('production', src.slice(src.indexOf('impl UreqFetch')))).toContain('https_only: true');
    expect(read('src-tauri/src/ai.rs')).toMatch(/pub fn agent\(timeout: Duration, https_only: bool, user_agent: &str\) -> ureq::Agent \{[\s\S]*?\.max_redirects\(0\)[\s\S]*?\.https_only\(https_only\)/);
  });

  it('dotaz nese jen User-Agent s názvem a verzí aplikace a Accept; žádný token, cookies ani údaje o hráči', () => {
    const get = implOf('impl Fetch for UreqFetch');
    expect(get).toContain('crate::ai::agent(self.timeout, self.https_only, user_agent).get(url).header("Accept", ACCEPT).call()');
    expect([...get.matchAll(/\.header\(/g)].length).toBe(1);
    expect(rsSrc()).toContain('pub const ACCEPT: &str = "application/vnd.github+json";');
    expect(rsSrc()).toContain('pub const APP_NAME: &str = "ARC-Raiders-Companion";');
    expect(fnBody('user_agent')).toContain('format!("{APP_NAME}/{}", fmt_ver(current))');
    expect(rsCode()).not.toMatch(/Authorization|Cookie|cookie|token|Bearer|\.query\(|\.send\(|\.header\("(?!Accept")/);
    /* ureq bez funkce cookies (a bez gzip), rustls */
    expect(read('src-tauri/Cargo.toml')).toContain('ureq = { version = "3.5", default-features = false, features = ["rustls"] }');
  });

  it('meze: 10 s, 256 KB, 2 KB poznámek, jeden dotaz za 10 minut', () => {
    const src = rsSrc();
    for (const s of [
      'pub const TIMEOUT: Duration = Duration::from_secs(10);', 'pub const MAX_RESPONSE: usize = 256 * 1024;', 'pub const NOTES_BYTES: usize = 2048;',
      'pub const MIN_INTERVAL: Duration = Duration::from_secs(600);', 'pub const NAME_MAX: usize = 120;',
    ]) expect(src, s).toContain(s);
    expect(fnBody('production', src.slice(src.indexOf('impl UreqFetch')))).toContain('UreqFetch { timeout: TIMEOUT, max_read: MAX_RESPONSE, https_only: true }');
    expect(implOf('impl Fetch for UreqFetch')).toContain('crate::ai::read_body(&mut res, self.max_read)');
    /* z odpovědi se čtou jen vybraná pole */
    const rel = src.slice(src.indexOf('struct Release {'), src.indexOf('}', src.indexOf('struct Release {')));
    expect([...rel.matchAll(/(\w+): Option</g)].map(m => m[1]).sort()).toEqual(['body', 'draft', 'html_url', 'name', 'prerelease', 'published_at', 'tag_name']);
  });

  it('žádná nová trasa busu, událost native:, akce relay ani změna CSP', () => {
    expect(rsSrc()).not.toMatch(/emit_native|\.emit(_to)?\(|bus_send/);
    const bus = read('src-tauri/src/bus.rs');
    expect(bus.slice(bus.indexOf('pub fn route_ok'), bus.indexOf('pub fn kind_ok'))).not.toMatch(/update/i);
    const csp: string = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp;
    expect(csp).not.toMatch(/github|https:/);
    expect(csp).toContain('connect-src ipc: http://ipc.localhost');
    for (const a of ['setUpdateCheck', 'updateResult', 'updateSkip', 'updateNotified']) {
      expect(isRelayAction(a), a).toBe(false);
      expect(Object.hasOwn(BLOCKED_ACTIONS, a), a).toBe(true);
    }
    expect((RELAY_ACTIONS as readonly string[]).filter(a => /^update(?!Build|Raid|Goal|PlannerItem|Poi)/.test(a))).toEqual([]);
    /* odkaz se dál otevírá jen přes open_external, jen https */
    const lib = read('src-tauri/src/lib.rs');
    expect(lib.slice(lib.indexOf('fn open_external'), lib.indexOf('pub fn run()'))).toContain('if !url.starts_with("https://")');
  });
});

describe('0.33.0: kontrola nové verze: WebView', () => {
  it('update_check volá jen src/shell/updateNative.ts a obsluhu má jen hlavní okno', () => {
    const ts = walk(join(root, 'src'), /\.tsx?$/).map(f => [rel(f), code(rel(f))] as const);
    expect(ts.filter(([, s]) => s.includes("'update_check'")).map(([f]) => f)).toEqual(['src/shell/updateNative.ts']);
    expect(ts.filter(([, s]) => s.includes('createUpdateNative(')).map(([f]) => f)).toEqual(['src/ops/mainHub.ts']);
    expect(ts.filter(([, s]) => /=\s*createUpdateController\(\{/.test(s)).map(([f]) => f)).toEqual(['src/ops/mainHub.ts']);
    for (const f of ['src/ops/OverlayApp.tsx', 'src/ops/BuddyApp.tsx', 'src/ops/WidgetsApp.tsx', 'src/ops/overlay-main.tsx', 'src/ops/buddy-main.tsx', 'src/ops/widgets-main.tsx', 'src/shell/Banners.tsx', 'src/ui/updateUi.ts']) {
      expect(/updateNative|updateHub|mainHub|UpdateSettings/.test(code(f)), f).toBe(false);
    }
    /* api.github.com zná jen Rust; frontend nikdy nevolá síť */
    for (const [f, s] of ts) {
      expect(s.includes('api.github.com'), f).toBe(false);
      expect(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(s), f).toBe(false);
    }
    expect(code('src/shell/updateNative.ts')).toContain("invoke<unknown>('update_check')");
    expect(code('src/shell/updateNative.ts')).toContain('isTauri() ? tauriUpdate : browserUpdate');
  });

  it('výchozí stav vypnuto; import nastavení nemění; adresa vydání se vždy počítá z verze', () => {
    const up = code('src/core/update.ts');
    expect(up).toContain("export const emptyUpdate = (): UpdatePrefs => ({ enabled: false, lastCheck: 0, lastResult: null, skippedVersion: '', notifiedVersion: '' });");
    expect(up).toContain("export const RELEASES_PREFIX = 'https://github.com/sudo-rtkit/arc-ops/releases/';");
    expect(up).toContain('url: releaseUrl(latest),');
    expect(up).toContain('d.enabled = r.enabled === true;');
    expect(code('src/store/app.ts')).toContain('n.update = structuredClone(st().update);');
    expect(code('src/core/state.ts')).toContain('out.update = normalizeUpdate(r.update, now);');
    expect(code('src/core/state.ts')).toContain('export const SCHEMA = 19 as const;');
  });

  it('poznámky jen jako prostý text; stránka vydání jen přes ověřenou adresu a open_external', () => {
    for (const f of ['src/modules/UpdateSettings.tsx', 'src/shell/Banners.tsx', 'src/ui/updateUi.ts', 'src/ops/updateHub.ts', 'src/core/update.ts']) {
      expect(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|eval\(|new Function|window\.open/.test(code(f)), f).toBe(false);
    }
    for (const f of ['src/modules/UpdateSettings.tsx', 'src/ui/updateUi.ts']) expect(/<a\s|href=/.test(code(f)), f).toBe(false);
    expect(code('src/ui/updateUi.ts')).toContain('if (releaseUrlOk(r.url, r.latest)) openExternalUrl(r.url);');
    expect(code('src/core/update.ts')).toContain('export const plainNotes = (raw: unknown): string => plainAnswer(');
    /* pruh jen v hlavním okně (Banners vykresluje jen App hlavního okna), žádné okno ani fokus */
    expect(code('src/App.tsx')).toContain('<Banners />');
    for (const f of ['src/ops/updateHub.ts', 'src/modules/UpdateSettings.tsx', 'src/shell/Banners.tsx']) expect(/focus\(|main_focus|mainFocus|setFocus/.test(code(f)), f).toBe(false);
    /* hláška Opse je nevyžádaná (pravidla dialogů platí) */
    expect(code('src/ops/hub.ts')).toContain('const noteSay = (anim: OpsAnim, l: LineRef) => say(anim, l, false);');
    expect(code('src/ops/mainHub.ts')).toContain('say: (anim, l) => hub.noteSay(anim, l)');
  });
});
