/* 0.30.0: bezpečnost AI asistenta (repozitář je veřejný). Síť jen v Rustu (src-tauri/src/ai.rs), jen z hlavního okna,
   jen pevní hostitelé HTTPS; CSP WebView zůstává bez sítě. Klíč jen ve Windows Credential Manageru: do WebView se
   vrací nejvýš ano / ne, nikdy není ve stavu, záloze ani v deníku. Overlay smí poslat jen jednu akci (aiAsk) s mezemi.
   Odpověď modelu se vykresluje jen jako text a model nic nespouští. Buddy dál nejde aktivovat. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const walk = (dir: string, re: RegExp): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p, re) : re.test(n) ? [p] : [];
});
const rel = (f: string) => f.slice(root.length).split('\\').join('/');
const cap = (n: string) => JSON.parse(read(`src-tauri/capabilities/${n}.json`)) as { permissions: string[] };
const AI_RS = 'src-tauri/src/ai.rs';
const rsSrc = () => { const r = read(AI_RS); return r.slice(0, r.search(/#\[cfg\(test\)\]\s*mod tests/)); };
const fnBody = (name: string) => {
  const s = rsSrc(), i = s.search(new RegExp(`fn ${name}\\b`));
  if (i < 0) throw new Error(name);
  let depth = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return s.slice(i, k + 1);
  }
  throw new Error(name);
};
/* skutečný klient (impl Transport for UreqTransport) */
const ureqImpl = () => { const s = rsSrc(); return s.slice(s.indexOf('impl Transport for UreqTransport'), s.indexOf('/* ----- klíče')); };
const CMDS = ['ai_ask', 'ai_key_set', 'ai_key_clear', 'ai_key_status'];
const HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai'];

describe('0.30.0: AI asistent: příkazy a oprávnění', () => {
  it('nové příkazy jsou v build.rs, v generate_handler! a jen v capability hlavního okna', () => {
    const build = read('src-tauri/build.rs');
    const lib = read('src-tauri/src/lib.rs');
    for (const c of CMDS) {
      expect(build, c).toContain(`"${c}"`);
      expect(lib, c).toContain(`ai::${c},`);
    }
    const perms = CMDS.map(c => 'allow-' + c.replace(/_/g, '-'));
    for (const p of perms) expect(cap('main').permissions, p).toContain(p);
    for (const w of ['buddy', 'overlay', 'widgets']) for (const p of cap(w).permissions) expect(/ai-/.test(p), `${w}: ${p}`).toBe(false);
  });

  it('každý příkaz ověří hlavní okno v Rustu (štítek volajícího okna) dřív, než cokoli udělá', () => {
    for (const c of CMDS) {
      const b = fnBody(c);
      expect(b.indexOf('crate::bus::only(&window, &[crate::bus::MAIN])'), c).toBeGreaterThan(0);
      expect(b.indexOf('crate::bus::only'), c).toBeLessThan(b.indexOf('st.0'));
    }
    for (const f of ['ask_for', 'key_set_for', 'key_clear_for', 'key_status_for']) expect(fnBody(f).indexOf('main_label(label)?;'), f).toBeGreaterThan(0);
    expect(fnBody('main_label')).toContain('if label == crate::bus::MAIN');
    /* dotaz běží mimo vlákno UI */
    expect(rsSrc()).toMatch(/pub async fn ai_ask</);
    expect(fnBody('ai_ask')).toContain('spawn_blocking');
  });

  it('pevní hostitelé, jen HTTPS, bez přesměrování; adresa je konstanta (nikdy z okna)', () => {
    const src = rsSrc();
    expect(src).toContain('pub const ALLOWED_HOSTS: &[&str] = &["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai"];');
    expect([...src.matchAll(/"(https:\/\/[^"]+)"/g)].map(m => m[1]).sort()).toEqual([
      'https://api.groq.com/openai/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://openrouter.ai/api/v1/chat/completions',
    ]);
    expect(src).not.toMatch(/"http:\/\//);
    const ask = fnBody('ask_for');
    expect(ask).toContain('let url = p.endpoint();');
    expect(ask).toContain('if !endpoint_ok(url)');
    expect(ureqImpl()).toContain('.max_redirects(0)');
    expect(ureqImpl()).toContain('.https_only(self.https_only)');
    expect(fnBody('production')).toContain('https_only: true');
    /* argumenty příkazu: žádná adresa ani hostitel z okna */
    const sig = fnBody('ai_ask');
    expect(sig.slice(sig.indexOf('>('), sig.indexOf(') -> Result')).match(/(\w+): /g)!.sort()).toEqual(['messages: ', 'model: ', 'provider: ', 'st: ', 'window: '].sort());
  });

  it('meze: velikost dotazu a odpovědi, tokeny, čas, jeden dotaz, limit za minutu a den, hra v popředí', () => {
    const src = rsSrc();
    for (const s of [
      'pub const MAX_REQUEST: usize = 24 * 1024;', 'pub const MAX_RESPONSE: usize = 64 * 1024;', 'pub const MAX_TOKENS: u32 = 600;',
      'pub const TIMEOUT: Duration = Duration::from_secs(30);', 'pub const RATE_PER_MIN: usize = 6;', 'pub const DAILY_MAX: u32 = 200;',
    ]) expect(src, s).toContain(s);
    const ask = fnBody('ask_for');
    const order = ['main_label(label)?', 'messages_ok(msgs)?', 'if game_front', 'ai.keys.get(p)?', 'BusyGuard::take', '.admit(now, day)?', 'ai.transport.post('];
    for (let i = 1; i < order.length; i++) expect(ask.indexOf(order[i - 1]), order[i]).toBeLessThan(ask.indexOf(order[i]));
    expect(fnBody('ai_ask')).toContain('crate::ops::game_in_front()');
    expect(ureqImpl()).toContain('.limit(self.max_read as u64)');
    /* 0.32.0: post_within jen zkracuje (opakování po prázdné odpovědi ve zbytku TIMEOUT), nikdy neprodlouží */
    expect(ureqImpl()).toContain('let timeout = limit.min(self.timeout);');
    expect(ureqImpl()).toContain('.timeout_global(Some(timeout))');
    expect(ureqImpl()).toContain('self.post_within(url, key, body, self.timeout)');
    /* opakování: jen po prázdné odpovědi u modelu s reasoning_effort, ve zbytku času, přes limit za minutu a den */
    expect(ask).toContain('Err(AiErr::Empty) if reasoning_for(p, model) => match retry_budget(started.elapsed())');
    expect(ask).toContain('l.admit(now, day)');
    expect(ask).toContain('request_body_opts(model, msgs, false)');
    expect([...ask.matchAll(/ai\.transport\.post(_within)?\(/g)].length).toBe(2);
    expect(src).toContain('pub const RETRY_MIN_LEFT: Duration = Duration::from_secs(8);');
    expect(src).toMatch(/pub fn retry_budget\(elapsed: Duration\) -> Option<Duration> \{\s*TIMEOUT\.checked_sub\(elapsed\)/);
  });

  it('klíč: jen Credential Manager; stav jen bool; do okna ani do deníku se nedostane', () => {
    expect(fnBody('ai_key_status')).toMatch(/-> Result<bool, String>/);
    expect(fnBody('key_status_for')).toMatch(/-> Result<bool, AiErr>/);
    /* get (vrací klíč) volá jen ask_for; nikdy příkaz */
    const src = rsSrc();
    const gets = [...src.matchAll(/\.keys\.get\(/g)].length;
    expect(gets).toBe(1);
    for (const c of CMDS) expect(fnBody(c).includes('.get('), c).toBe(false);
    /* 0.32.0: navíc jen příznak opakování (bool) */
    expect(src).toMatch(/pub struct AiReply \{\s*pub text: String,\s*pub today: u32,\s*\/\/\/[^\n]*\n\s*pub retried: bool,\s*\}/);
    /* do deníku jen kód chyby */
    expect(fnBody('logged')).toContain('crate::diag::rust(crate::diag::Level::Warn, ctx, e.code());');
    expect(src).not.toMatch(/diag::(rust|error|fail)\([^;]*(key|content|messages|body)/);
    /* Win32: jen Credential Manager s obecným pověřením tohoto uživatele */
    expect(src).toContain('CRED_TYPE_GENERIC');
    expect(src).toContain('CRED_PERSIST_LOCAL_MACHINE');
    /* deník chyb vymaže klíče poskytovatelů i bez číslice */
    expect(read('src-tauri/src/diag.rs')).toContain('const KEY_PREFIXES: [&str; 3] = ["gsk_", "AIza", "sk-"];');
  });

  it('klient HTTP: ureq s rustls, bez native-tls/OpenSSL; jen v ai.rs', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).toContain('ureq = { version = "3.5", default-features = false, features = ["rustls"] }');
    const lock = read('src-tauri/Cargo.lock');
    for (const bad of ['name = "openssl"', 'name = "openssl-sys"', 'name = "native-tls"', 'name = "aws-lc-sys"']) expect(lock.includes(bad), bad).toBe(false);
    const rs = walk(join(root, 'src-tauri', 'src'), /\.rs$/).map(rel).filter(f => read(f).includes('ureq'));
    expect(rs).toEqual([AI_RS]);
  });
});

describe('0.30.0: AI asistent: WebView', () => {
  it('CSP bez sítě a bez hostitelů poskytovatelů; fetch ani XHR nikde ve frontendu', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    const csp: string = conf.app.security.csp;
    for (const h of HOSTS) expect(csp.includes(h), h).toBe(false);
    expect(csp).toContain('connect-src ipc: http://ipc.localhost');
    expect(csp).not.toMatch(/https:/);
    const ts = walk(join(root, 'src'), /\.tsx?$/).map(f => [rel(f), read(rel(f))] as const);
    for (const [f, s] of ts) {
      expect(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(s), f).toBe(false);
      /* adresy rozhraní jsou jen v Rustu (frontend zná jen stránky s klíči pro odkaz v Nastavení) */
      for (const h of ['api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai/api', 'chat/completions']) expect(s.includes(h), `${f}: ${h}`).toBe(false);
    }
  });

  it('příkazy AI volá jen src/shell/aiNative.ts a jen hlavní okno (obsluha v mainHub)', () => {
    const ts = walk(join(root, 'src'), /\.tsx?$/).map(f => [rel(f), code(rel(f))] as const);
    for (const c of CMDS) expect(ts.filter(([, s]) => s.includes(`'${c}'`)).map(([f]) => f), c).toEqual(['src/shell/aiNative.ts']);
    expect(ts.filter(([, s]) => s.includes('createAiNative(')).map(([f]) => f)).toEqual(['src/ops/mainHub.ts']);
    /* okna nad hrou obsluhu AI nemají */
    for (const f of ['src/ops/OverlayApp.tsx', 'src/ops/BuddyApp.tsx', 'src/ops/WidgetsApp.tsx', 'src/ops/overlay-main.tsx', 'src/ops/buddy-main.tsx', 'src/ops/widgets-main.tsx']) {
      expect(/aiNative|aiHub|mainHub/.test(code(f)), f).toBe(false);
    }
    /* zkušební náhrada jen mimo Tauri */
    expect(code('src/shell/aiNative.ts')).toContain('isTauri() ? tauriAi : browserAi');
  });

  it('klíč nikdy ve stavu, typech stavu, záloze ani ve sdíleném pohledu', () => {
    const types = code('src/core/types.ts'), ai = code('src/core/ai.ts');
    const prefs = ai.slice(ai.indexOf('export interface AiPrefs'), ai.indexOf('}', ai.indexOf('export interface AiPrefs')));
    expect(prefs).not.toMatch(/key|secret|token/i);
    expect(types).toContain('ai: AiPrefs;');
    expect(code('src/store/aiView.ts')).not.toMatch(/\bkey\s*:/);
    expect(code('src/core/backup.ts')).not.toMatch(/apiKey|aiKey/);
    /* pole klíče v Nastavení: heslo, bez automatického vyplnění, vyprázdní se hned */
    const set = code('src/modules/AiSettings.tsx');
    expect(set).toContain('type="password"');
    expect(set).toContain('autoComplete="off"');
    expect(set.indexOf("setKey('');")).toBeLessThan(set.indexOf('await ai.setKey('));
    expect(set).not.toMatch(/localStorage|sessionStorage|console\./);
  });

  it('relay: jediná nová akce aiAsk s mezemi; nová trasa busu ani událost native: není', () => {
    const relay = code('src/store/relay.ts');
    expect(relay).toContain("'aiAsk',");
    expect(relay).toContain("if (m.name === 'aiAsk' && !aiAskArgsOk(args)) return { ack, applied: false };");
    expect(relay).toContain('q.length > AI_Q_MAX');
    /* 0.31.0: druh z pevného výčtu a mez odkazu podle druhu (volná otázka, raid a shrnutí po raidu bez odkazu) */
    expect(relay).toContain("if (typeof kind !== 'string' || !isAiKind(kind)) return false;");
    expect(relay).toContain('ref.length <= Math.min(AI_REF_LIMIT[kind], 121)');
    expect(relay).toContain('setAi: none, aiConsent: none, aiCount: none,');
    expect(code('src/core/ai.ts')).toContain('export const AI_Q_MAX = 500;');
    /* 0.32.0: druh stats (analytika z deníku), odkaz map:<id> do 44 znaků */
    expect(code('src/core/ai.ts')).toContain("export const AI_KINDS: readonly AiKind[] = ['free', 'item', 'advisor', 'quests', 'raid', 'postRaid', 'stats'];");
    expect(code('src/core/ai.ts')).toContain('export const AI_REF_LIMIT: Readonly<Record<AiKind, number>> = { free: 0, item: AI_REF_MAX, advisor: 121, quests: 88, raid: 0, postRaid: 0, stats: 44 };');
    expect(code('src/core/ai.ts')).toContain('export const STATS_REF_RE = /^map:[a-z0-9_-]{1,40}$/;');
    const bus = read('src-tauri/src/bus.rs');
    expect(bus.slice(bus.indexOf('pub fn route_ok'), bus.indexOf('pub fn kind_ok'))).not.toMatch(/\bAI\b|"ai/);
    expect(read(AI_RS)).not.toMatch(/emit_native|\.emit(_to)?\(/);
  });

  it('odpověď jen jako text: žádné innerHTML, odkazy ani akce z textu modelu', () => {
    for (const f of ['src/ui/AskOps.tsx', 'src/ops/aiHub.ts', 'src/modules/AskOps.tsx', 'src/modules/AiSettings.tsx', 'src/ops/OverlayApp.tsx']) {
      const s = code(f);
      expect(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|eval\(|new Function/.test(s), f).toBe(false);
    }
    const ui = code('src/ui/AskOps.tsx');
    expect(ui).toContain('<p className="ask-answer" data-testid="ask-answer">{v.answer}</p>');
    /* tlačítka pod odpovědí jen z druhu a odkazu otázky (počítá aplikace), nikdy z textu odpovědi */
    expect(ui).not.toMatch(/v\.answer\.(match|split|includes|indexOf)|JSON\.parse\(v\.answer/);
    const hub = code('src/ops/aiHub.ts');
    expect(hub).toContain('const answer = plainAnswer(r?.text);');
    expect(hub).not.toMatch(/app\.actions\.(?!aiCount)\w+\(/);
  });

  it('bez spěchu: dotaz jen na výslovnou akci hráče (obsluha nikdy neptá sama), buddy nejde aktivovat', () => {
    const hub = code('src/ops/aiHub.ts');
    expect([...hub.matchAll(/native\.ask\(/g)].length).toBe(1);
    expect(hub).not.toMatch(/setInterval|subscribe\([^)]*ask\(/);
    const main = code('src/ops/mainHub.ts');
    expect(main).toContain('setAiHook((a, origin) => { void ai.ask(a, origin); });');
    /* askOps volají jen tlačítka (onClick / onSubmit) */
    const ts = walk(join(root, 'src'), /\.tsx$/).map(f => [rel(f), code(rel(f))] as const);
    /* 0.31.0: i nová tlačítka (Úkoly, Workshop, Příprava na raid, Shrnout raid) */
    /* 0.32.0: i tlačítka ve Statistics (askStats, askStatsMap) */
    for (const [f, s] of ts) for (const m of s.matchAll(/\b(askOps|askWhy|askItem|askAndOpen|askQuest|askStation|askRaid|askPostRaid|askStats|askStatsMap)\(/g)) {
      const before = s.slice(Math.max(0, m.index! - 160), m.index);
      const lineStart = s.lastIndexOf('\n', m.index!) + 1;
      if (f === 'src/ui/AskOps.tsx' && s.slice(lineStart, m.index).startsWith('export const ask')) continue;
      expect(/on(Click|Submit)=\{|const send = /.test(before), `${f}: ${m[0]}`).toBe(true);
    }
    expect(read('src-tauri/src/ops.rs')).toContain('.focusable(false)');
  });
});
