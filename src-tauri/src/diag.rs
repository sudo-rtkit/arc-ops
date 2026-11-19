//! 0.28.0: místní deník chyb (diagnostika). Nic se neposílá po síti; soubor si hráč může jen sám prohlédnout
//! a vyexportovat (Nastavení → Diagnostika).
//!
//! - Soubory: `<složka dat>/logs/diag.log` (JSON lines), po překročení MAX_LOG_FILE se přejmenuje na `diag.1.log`
//!   (drží se nejvýš 2 soubory). Značka relace `session.lock` vzniká při startu a mizí při čistém ukončení; když
//!   při dalším startu zůstala, aplikace minule skončila nečekaně (`launch_info.uncleanExit`).
//! - Záznam: čas, verze, okno (štítek volajícího okna z Rustu, nikdy z dat), úroveň (pevný výčet), zpráva
//!   (nejvýš MAX_MESSAGE bajtů) a krátký zásobník (nejvýš MAX_STACK bajtů a MAX_STACK_LINES řádků).
//! - Před zápisem se domovská složka uživatele nahradí `%USERPROFILE%`, e-mailové adresy `<email>` a dlouhé
//!   tokeny `<redacted>`. Žádný obsah stavu, inventáře, profilu, snímky ani klíče se sem nikdy nepíšou: Rust
//!   loguje jen vlastní texty chyb, JS jen zprávu a zásobník chyby.
//! - `diag_log` smí volat každé okno (chyby JS); omezení na okno: token bucket RATE_PER_MIN záznamů za minutu,
//!   pak jeden záznam „suppressed N“. Číst, exportovat a mazat smí jen hlavní okno (`main_label_ok`).
//! - Zápis jde přes vlastní vlákno (kanál), takže volající vlákno (ani hlavní vlákno UI) nikdy nečeká na disk.
//!   Chyby zápisu se tiše zahodí; deník nikdy nesmí shodit aplikaci. Jen hák paniky zapisuje přímo (pak
//!   následuje abort).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Runtime, State, WebviewWindow};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MAX_MESSAGE: usize = 2 * 1024;
pub const MAX_STACK: usize = 4 * 1024;
pub const MAX_STACK_LINES: usize = 16;
pub const MAX_LOG_FILE: u64 = 256 * 1024;
pub const LOG: &str = "diag.log";
pub const LOG_OLD: &str = "diag.1.log";
pub const MARKER: &str = "session.lock";
/* token bucket na okno: nejvýš BURST záznamů naráz, doplňuje se RATE_PER_MIN za minutu */
pub const RATE_PER_MIN: f64 = 20.0;
pub const BURST: f64 = 20.0;
/* kolik posledních záznamů vrací diag_read */
pub const SHOW_LAST: usize = 50;
/* štítek pro záznamy samotného Rustu (panika, úložiště, okna, snímek) */
pub const APP: &str = "app";
/* známé štítky; cokoli jiného se zapíše jako "other" (mapa omezovače tak nemůže růst) */
const LABELS: [&str; 5] = ["main", "buddy", "overlay", "widgets", APP];
/* opt-in funkce, které smí export uvést (jen true/false) */
pub const FEATURES: [&str; 12] = ["buddy", "autoOpen", "hotkey", "widgets", "autoCapture", "gameLinkOff", "passClicks", "lowImpact", "sound", "autoSnapshot", "ai", "updateCheck"];

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Error,
    Warn,
    Info,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub ts: u64,
    pub at: String,
    pub version: String,
    pub window: String,
    pub level: Level,
    pub message: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub stack: String,
}

/* ----- čisté funkce (testy) ----- */

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Čas v UTC jako `2026-11-14T17:49:13Z` (bez knihovny pro datum).
pub fn iso_utc(ms: u64) -> String {
    let secs = ms / 1000;
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    /* H. Hinnant: civil_from_days */
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// Ořízne text na nejvýš `max` bajtů (na hranici znaku); oříznutý text končí „…“.
pub fn clip(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max.saturating_sub('…'.len_utf8());
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// Zpráva na jeden řádek: řídicí znaky (i konce řádků) se nahradí mezerou.
fn one_line(s: &str) -> String {
    s.chars().map(|c| if c.is_control() { ' ' } else { c }).collect()
}

/// Zásobník: řádky zůstanou, ostatní řídicí znaky se nahradí mezerou, nejvýš MAX_STACK_LINES řádků.
fn stack_lines(s: &str) -> String {
    s.replace('\r', "")
        .split('\n')
        .map(|l| l.chars().map(|c| if c.is_control() { ' ' } else { c }).collect::<String>())
        .filter(|l| !l.trim().is_empty())
        .take(MAX_STACK_LINES)
        .collect::<Vec<_>>()
        .join("\n")
}

fn lower(c: char) -> char {
    c.to_lowercase().next().unwrap_or(c)
}

fn match_ci(hay: &[char], at: usize, needle: &[char]) -> bool {
    at + needle.len() <= hay.len() && needle.iter().enumerate().all(|(k, n)| lower(hay[at + k]) == lower(*n))
}

/// Nahradí všechny výskyty `needle` bez ohledu na velikost písmen.
fn replace_ci(hay: &str, needle: &str, with: &str) -> String {
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() {
        return hay.to_string();
    }
    let h: Vec<char> = hay.chars().collect();
    let mut out = String::with_capacity(hay.len());
    let mut i = 0;
    while i < h.len() {
        if match_ci(&h, i, &n) {
            out.push_str(with);
            i += n.len();
        } else {
            out.push(h[i]);
            i += 1;
        }
    }
    out
}

fn is_sep(c: char) -> bool {
    c == '\\' || c == '/'
}

/// `X:\Users\<jméno>` (i s `/` nebo zdvojenými `\\`) → `%USERPROFILE%`, i když se domovská složka nezná.
fn scrub_users_dirs(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let users: Vec<char> = "users".chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < c.len() {
        if i + 1 < c.len() && c[i].is_ascii_alphabetic() && c[i + 1] == ':' && (i == 0 || !c[i - 1].is_alphanumeric()) {
            let mut j = i + 2;
            while j < c.len() && is_sep(c[j]) {
                j += 1;
            }
            if j > i + 2 && match_ci(&c, j, &users) {
                let mut k = j + users.len();
                let s1 = k;
                while k < c.len() && is_sep(c[k]) {
                    k += 1;
                }
                let s2 = k;
                while k < c.len() && !matches!(c[k], '\\' | '/' | '"' | '\'' | '`' | ')' | '(' | '<' | '>' | '|' | '?' | '*' | ':' | ',' | ';') && !c[k].is_control() {
                    k += 1;
                }
                if s2 > s1 && k > s2 {
                    out.push_str("%USERPROFILE%");
                    i = k;
                    continue;
                }
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

fn email_local(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}
fn email_domain(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '-')
}

/// Cokoli, co vypadá jako e-mailová adresa (`a.b@c.cz`), → `<email>`.
fn scrub_emails(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let mut start_ok = 0; /* znaky před tímto indexem už jsou v out */
    while i < c.len() {
        if c[i] == '@' {
            let mut a = i;
            while a > start_ok && email_local(c[a - 1]) {
                a -= 1;
            }
            let mut b = i + 1;
            while b < c.len() && email_domain(c[b]) {
                b += 1;
            }
            let domain: String = c[i + 1..b].iter().collect::<String>();
            let domain = domain.trim_end_matches(['.', '-']);
            let tld = domain.rsplit('.').next().unwrap_or("");
            if a < i && domain.contains('.') && tld.len() >= 2 && tld.chars().all(|x| x.is_ascii_alphabetic()) && !domain.starts_with('.') {
                let end = i + 1 + domain.chars().count();
                /* out už obsahuje c[start_ok..i]; vrátit lokální část zpět */
                for _ in a..i {
                    out.pop();
                }
                out.push_str("<email>");
                i = end;
                start_ok = end;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// Předpony klíčů API (0.30.0: Groq `gsk_`, Google `AIza`, OpenRouter a další `sk-`): token s nimi se vymaže
/// i kratší nebo bez číslice.
const KEY_PREFIXES: [&str; 3] = ["gsk_", "AIza", "sk-"];

/// Dlouhé souvislé tokeny (≥ 32 znaků z písmen, číslic, `_` a `-`, s písmenem i číslicí) a tokeny s předponou klíče
/// API (≥ 16 znaků) → `<redacted>` (klíče API).
fn scrub_tokens(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        let n = run.chars().count();
        let long = n >= 32 && run.chars().any(|c| c.is_ascii_digit()) && run.chars().any(|c| c.is_ascii_alphabetic());
        let key = n >= 16 && KEY_PREFIXES.iter().any(|p| run.starts_with(p));
        out.push_str(if long || key { "<redacted>" } else { run.as_str() });
        run.clear();
    };
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            run.push(c);
        } else {
            flush(&mut run, &mut out);
            out.push(c);
        }
    }
    flush(&mut run, &mut out);
    out
}

/// Očištění textu před zápisem: domovská složka, cesty `X:\Users\<jméno>`, e-maily a dlouhé tokeny.
pub fn scrub(s: &str, home: Option<&str>) -> String {
    let mut t = s.to_string();
    if let Some(h) = home.map(|h| h.trim_end_matches(['\\', '/'])).filter(|h| h.chars().count() >= 3) {
        let fwd = h.replace('\\', "/");
        let dbl = h.replace('\\', "\\\\");
        for v in [dbl.as_str(), h, fwd.as_str()] {
            t = replace_ci(&t, v, "%USERPROFILE%");
        }
    }
    scrub_tokens(&scrub_emails(&scrub_users_dirs(&t)))
}

/// Záznam z neověřených dat: zpráva a zásobník se zkrátí, očistí a omezí; okno doplní volající (Rust).
pub fn make_entry(ts: u64, window: &str, level: Level, message: &str, stack: Option<&str>, home: Option<&str>) -> Entry {
    /* nejdřív hrubé omezení (rychlost u obřího vstupu), pak očištění a teprve pak přesné limity */
    let msg = clip(&scrub(&one_line(&clip(message, MAX_MESSAGE * 4)), home), MAX_MESSAGE);
    let stack = stack.map(|s| clip(&scrub(&stack_lines(&clip(s, MAX_STACK * 4)), home), MAX_STACK)).unwrap_or_default();
    let window = if LABELS.contains(&window) { window } else { "other" };
    Entry { ts, at: iso_utc(ts), version: VERSION.to_string(), window: window.to_string(), level, message: if msg.trim().is_empty() { "(empty)".into() } else { msg }, stack }
}

/// Připíše řádek do `diag.log`; když by soubor přerostl `cap`, dosavadní se přejmenuje na `diag.1.log`
/// (starší `diag.1.log` se tím nahradí), takže se drží nejvýš 2 soubory.
pub fn append(dir: &Path, line: &str, cap: u64) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = dir.join(LOG);
    let len = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if len > 0 && len + line.len() as u64 + 1 > cap {
        let old = dir.join(LOG_OLD);
        let _ = fs::remove_file(&old);
        fs::rename(&path, &old)?;
    }
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&path)?;
    f.write_all(format!("{line}\n").as_bytes())
}

/// Posledních `n` záznamů (od nejstaršího), poškozené řádky se přeskočí.
pub fn read_last(dir: &Path, n: usize) -> Vec<Entry> {
    let mut out: Vec<Entry> = vec![];
    for name in [LOG_OLD, LOG] {
        let Ok(bytes) = fs::read(dir.join(name)) else { continue };
        for line in String::from_utf8_lossy(&bytes).lines() {
            if let Ok(e) = serde_json::from_str::<Entry>(line) {
                out.push(e);
            }
        }
    }
    let skip = out.len().saturating_sub(n);
    out.split_off(skip)
}

/// Text deníku pro export (starší soubor první), znovu očištěný.
pub fn read_raw(dir: &Path, home: Option<&str>) -> String {
    let mut out = String::new();
    for name in [LOG_OLD, LOG] {
        if let Ok(bytes) = fs::read(dir.join(name)) {
            out.push_str(&format!("----- {name} -----\n"));
            out.push_str(&scrub(&String::from_utf8_lossy(&bytes), home));
            if !out.ends_with('\n') {
                out.push('\n');
            }
        }
    }
    if out.is_empty() {
        out.push_str("(log is empty)\n");
    }
    out
}

pub fn clear_files(dir: &Path) {
    for name in [LOG, LOG_OLD] {
        let _ = fs::remove_file(dir.join(name));
    }
}

/// Co zůstalo z minulé relace.
#[derive(Debug, PartialEq, Eq)]
pub enum LastSession {
    Clean,
    /// značka stejné verze: aplikace skončila nečekaně (pád, zabití procesu)
    Unclean,
    /// značka jiné verze: nejspíš ji ukončil instalátor aktualizace (nehlásí se jako pád)
    OtherVersion,
}

/// Značka relace: zjistí, co zůstalo z minula, a zapíše novou (`<pid> <čas> <verze>`).
pub fn start_session(dir: &Path) -> LastSession {
    let m = dir.join(MARKER);
    let last = match fs::read_to_string(&m) {
        Err(_) if !m.exists() => LastSession::Clean,
        Ok(t) if t.split(' ').nth(2).map(str::trim) != Some(VERSION) => LastSession::OtherVersion,
        _ => LastSession::Unclean,
    };
    let _ = fs::create_dir_all(dir);
    let _ = fs::write(&m, format!("{} {} {}", std::process::id(), now_ms(), VERSION));
    last
}

/// Čisté ukončení: značku smaže jen proces, který ji zapsal.
pub fn end_session(dir: &Path) {
    let m = dir.join(MARKER);
    let mine = fs::read_to_string(&m).map(|s| s.split(' ').next() == Some(std::process::id().to_string().as_str())).unwrap_or(false);
    if mine {
        let _ = fs::remove_file(&m);
    }
}

/// Smí okno s tímto štítkem číst, exportovat nebo mazat deník? Jen hlavní okno.
pub fn main_label_ok(label: &str) -> Result<(), String> {
    if label == "main" { Ok(()) } else { Err("diag:denied".into()) }
}

/// Opt-in funkce pro hlavičku exportu: jen klíče z FEATURES a jen true/false, v pevném pořadí.
pub fn feature_line(features: &HashMap<String, bool>) -> String {
    FEATURES.iter().map(|k| format!("{k}={}", features.get(*k).copied().unwrap_or(false))).collect::<Vec<_>>().join(" ")
}

/* ----- omezení počtu záznamů ----- */

struct Bucket {
    tokens: f64,
    last: Instant,
    suppressed: u32,
}

#[derive(Default)]
pub struct Limiter {
    buckets: HashMap<String, Bucket>,
}

impl Limiter {
    /// Pustí záznam? Druhá hodnota je počet záznamů zahozených od posledního puštěného (pro jeden „suppressed N“).
    pub fn admit(&mut self, key: &str, now: Instant) -> (bool, u32) {
        let b = self.buckets.entry(key.to_string()).or_insert(Bucket { tokens: BURST, last: now, suppressed: 0 });
        let el = now.saturating_duration_since(b.last).as_secs_f64();
        b.tokens = (b.tokens + el * RATE_PER_MIN / 60.0).min(BURST);
        b.last = now;
        if b.tokens >= 1.0 {
            b.tokens -= 1.0;
            (true, std::mem::take(&mut b.suppressed))
        } else {
            b.suppressed = b.suppressed.saturating_add(1);
            (false, 0)
        }
    }
    /// Zahozené záznamy, které ještě nikdo nenahlásil (před čtením, exportem a při ukončení).
    pub fn drain(&mut self) -> Vec<(String, u32)> {
        let mut v: Vec<(String, u32)> = self.buckets.iter_mut().filter(|(_, b)| b.suppressed > 0).map(|(k, b)| (k.clone(), std::mem::take(&mut b.suppressed))).collect();
        v.sort();
        v
    }
}

pub fn suppressed_entry(ts: u64, window: &str, n: u32) -> Entry {
    make_entry(ts, window, Level::Warn, &format!("suppressed {n} entries (rate limit)"), None, None)
}

/* ----- deník aplikace ----- */

enum Job {
    Line(String),
    Flush(SyncSender<()>),
    Clear(SyncSender<()>),
}

pub struct Diag {
    pub dir: PathBuf,
    home: Option<String>,
    tx: Mutex<Option<Sender<Job>>>,
    limiter: Mutex<Limiter>,
    pub unclean: bool,
}

/* zámek zápisu: vlákno deníku a hák paniky nepíšou naráz */
static WRITE: Mutex<()> = Mutex::new(());
static GLOBAL: OnceLock<Arc<Diag>> = OnceLock::new();

fn write_line(dir: &Path, line: &str) {
    let _g = WRITE.lock();
    let _ = append(dir, line, MAX_LOG_FILE);
}

fn home_dir() -> Option<String> {
    std::env::var("USERPROFILE").ok().or_else(|| std::env::var("HOME").ok()).filter(|h| !h.trim().is_empty())
}

impl Diag {
    /// Deník ve složce `dir` (logs/) s vlastním vláknem zápisu. Při chybě vlákna se jen nic nezapisuje.
    pub fn new(dir: PathBuf, unclean: bool) -> Arc<Diag> {
        let (tx, rx) = mpsc::channel::<Job>();
        let wdir = dir.clone();
        let spawned = std::thread::Builder::new().name("diag".into()).spawn(move || {
            for job in rx {
                match job {
                    Job::Line(l) => write_line(&wdir, &l),
                    Job::Flush(done) => {
                        let _ = done.send(());
                    }
                    Job::Clear(done) => {
                        let _g = WRITE.lock();
                        clear_files(&wdir);
                        let _ = done.send(());
                    }
                }
            }
        });
        Arc::new(Diag { dir, home: home_dir(), tx: Mutex::new(spawned.ok().map(|_| tx)), limiter: Mutex::new(Limiter::default()), unclean })
    }

    fn send(&self, job: Job) -> bool {
        self.tx.lock().ok().and_then(|t| t.as_ref().map(|t| t.send(job).is_ok())).unwrap_or(false)
    }

    fn push(&self, e: &Entry) {
        if let Ok(line) = serde_json::to_string(e) {
            self.send(Job::Line(line));
        }
    }

    /// Zapíše záznam přes omezovač okna (zahozené se později nahlásí jedním „suppressed N“).
    pub fn log(&self, window: &str, level: Level, message: &str, stack: Option<&str>) {
        let key = if LABELS.contains(&window) { window } else { "other" };
        let (ok, suppressed) = self.limiter.lock().map(|mut l| l.admit(key, Instant::now())).unwrap_or((false, 0));
        if !ok {
            return;
        }
        let ts = now_ms();
        if suppressed > 0 {
            self.push(&suppressed_entry(ts, key, suppressed));
        }
        self.push(&make_entry(ts, key, level, message, stack, self.home.as_deref()));
    }

    /// Nahlásí zahozené záznamy a počká (nejvýš 1 s), až vlákno zapíše vše z fronty.
    pub fn flush(&self) {
        let pending = self.limiter.lock().map(|mut l| l.drain()).unwrap_or_default();
        let ts = now_ms();
        for (w, n) in pending {
            self.push(&suppressed_entry(ts, &w, n));
        }
        let (tx, rx) = mpsc::sync_channel(1);
        if self.send(Job::Flush(tx)) {
            let _ = rx.recv_timeout(Duration::from_secs(1));
        }
    }

    pub fn clear(&self) {
        let _ = self.limiter.lock().map(|mut l| l.drain());
        let (tx, rx) = mpsc::sync_channel(1);
        if self.send(Job::Clear(tx)) {
            let _ = rx.recv_timeout(Duration::from_secs(2));
        }
    }

    pub fn home(&self) -> Option<&str> {
        self.home.as_deref()
    }
}

/// Spuštění deníku (setup): složka logs/, značka relace a globální odkaz pro hák paniky a záznamy z Rustu.
pub fn init(data_dir: &Path) -> Arc<Diag> {
    let dir = data_dir.join("logs");
    let last = start_session(&dir);
    let d = Diag::new(dir, last == LastSession::Unclean);
    let _ = GLOBAL.set(d.clone());
    match last {
        LastSession::Unclean => d.log(APP, Level::Warn, "previous session ended unexpectedly", None),
        LastSession::OtherVersion => d.log(APP, Level::Info, "previous session of another version did not end cleanly (likely an update)", None),
        LastSession::Clean => {}
    }
    d
}

/// Čisté ukončení (RunEvent::Exit): nahlásit zahozené záznamy, dopsat frontu a smazat značku relace.
pub fn shutdown() {
    if let Some(d) = GLOBAL.get() {
        d.flush();
        end_session(&d.dir);
    }
}

/// Záznam samotného Rustu (chyba v úložišti, okně, snímku…). Bez spuštěného deníku nic.
pub fn rust(level: Level, ctx: &str, msg: &str) {
    if let Some(d) = GLOBAL.get() {
        d.log(APP, level, &format!("{ctx}: {msg}"), None);
    }
}

pub fn error(ctx: &str, msg: &str) {
    rust(Level::Error, ctx, msg);
}

/// Chyba jako text a zároveň záznam v deníku (pro `map_err`).
pub fn fail(ctx: &str, e: impl std::fmt::Display) -> String {
    let s = e.to_string();
    error(ctx, &s);
    s
}

/// Projde výsledek a chybu zapíše do deníku (výsledek se nemění).
pub fn logged<T>(ctx: &str, r: Result<T, String>) -> Result<T, String> {
    if let Err(e) = &r {
        error(ctx, e);
    }
    r
}

/// Hák paniky: zpráva a místo se zapíšou přímo (release končí abortem), pak původní hák.
pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let Some(d) = GLOBAL.get() else { return };
            let payload = info.payload();
            let msg = payload.downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| payload.downcast_ref::<String>().cloned()).unwrap_or_else(|| "panic".into());
            let loc = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
            let thread = std::thread::current().name().unwrap_or("?").to_string();
            let e = make_entry(now_ms(), APP, Level::Error, &format!("panic: {msg}"), Some(&format!("at {loc} (thread {thread})")), d.home());
            if let Ok(line) = serde_json::to_string(&e) {
                /* vlákno deníku může zámek právě držet (nebo panikařilo samo): pak se zapíše i bez něj */
                let _g = WRITE.try_lock();
                let _ = append(&d.dir, &line, MAX_LOG_FILE);
            }
        }));
        prev(info);
    }));
}

/* ----- příkazy ----- */

pub struct DiagState(pub Arc<Diag>);

/// Záznam chyby z JS (každé okno). Okno určí Rust podle volajícího okna, úroveň je pevný výčet,
/// zpráva a zásobník se omezí a očistí; cesta ani název souboru z dat nikdy nepochází.
#[tauri::command]
pub async fn diag_log<R: Runtime>(window: WebviewWindow<R>, st: State<'_, DiagState>, level: Level, message: String, stack: Option<String>) -> Result<(), String> {
    log_from(window.label(), &st.0, level, &message, stack.as_deref());
    Ok(())
}

/// Posledních SHOW_LAST záznamů pro Nastavení → Diagnostika (jen hlavní okno).
#[tauri::command]
pub async fn diag_read<R: Runtime>(window: WebviewWindow<R>, st: State<'_, DiagState>) -> Result<Vec<Entry>, String> {
    read_for(window.label(), &st.0)
}

/// Smaže deník (jen hlavní okno). Značka relace zůstane.
#[tauri::command]
pub async fn diag_clear<R: Runtime>(window: WebviewWindow<R>, st: State<'_, DiagState>) -> Result<(), String> {
    clear_for(window.label(), &st.0)
}

/* Jádra příkazů: `label` je vždy štítek volajícího okna z Rustu (window.label()), nikdy hodnota z dat. */
pub fn log_from(label: &str, d: &Diag, level: Level, message: &str, stack: Option<&str>) {
    /* záznam z okna se nikdy nevydává za Rust */
    let label = if label == APP { "other" } else { label };
    d.log(label, level, message, stack);
}

pub fn read_for(label: &str, d: &Diag) -> Result<Vec<Entry>, String> {
    main_label_ok(label)?;
    d.flush();
    Ok(read_last(&d.dir, SHOW_LAST))
}

pub fn clear_for(label: &str, d: &Diag) -> Result<(), String> {
    main_label_ok(label)?;
    d.clear();
    Ok(())
}

/// Text exportu: hlavička (verze, Windows, WebView2, opt-in funkce jako true/false) a deník.
pub fn export_text(d: &Diag, os: &str, webview: &str, features: &HashMap<String, bool>) -> String {
    let ts = now_ms();
    let mut out = String::new();
    out.push_str("ARC Raiders Companion - diagnostics (local file, nothing was sent anywhere)\n");
    out.push_str(&format!("app: {VERSION}\nexported: {}\nos: {}\nwebview2: {}\nfeatures: {}\n", iso_utc(ts), one_line(os), one_line(webview), feature_line(features)));
    out.push_str("note: the home folder is shown as %USERPROFILE%; e-mail addresses and long tokens are removed.\n\n");
    out.push_str(&read_raw(&d.dir, d.home()));
    out
}

/// Název souboru exportu (z Rustu, nikdy z dat okna).
pub fn export_name(ms: u64) -> String {
    let iso = iso_utc(ms);
    format!("arc-companion-diagnostics-{}.txt", iso[..16].replace(['-', ':'], "").replace('T', "-"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("arc-companion-diag-{tag}-{}-{}", std::process::id(), now_ms()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn cas_v_utc() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_utc(1_763_142_553_000), "2025-11-14T17:49:13Z");
        assert_eq!(iso_utc(951_782_400_000), "2000-02-29T00:00:00Z");
        assert_eq!(export_name(1_763_142_553_000), "arc-companion-diagnostics-20251114-1749.txt");
    }

    #[test]
    fn rotace_drzi_dva_soubory() {
        let d = temp_dir("rot");
        let line = "x".repeat(1000);
        for _ in 0..1000 {
            append(&d, &line, 10_000).unwrap();
        }
        let mut names: Vec<String> = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        assert_eq!(names, vec![LOG_OLD.to_string(), LOG.to_string()]);
        for n in [LOG, LOG_OLD] {
            let len = fs::metadata(d.join(n)).unwrap().len();
            assert!(len <= 10_000, "{n}: {len}");
            assert!(len > 0);
        }
        /* skutečný limit: 256 KB na soubor */
        let d = temp_dir("rot256");
        let line = "y".repeat(4000);
        for _ in 0..200 {
            append(&d, &line, MAX_LOG_FILE).unwrap();
        }
        assert!(fs::metadata(d.join(LOG)).unwrap().len() <= MAX_LOG_FILE);
        assert!(fs::metadata(d.join(LOG_OLD)).unwrap().len() <= MAX_LOG_FILE);
        assert_eq!(fs::read_dir(&d).unwrap().count(), 2);
    }

    #[test]
    fn cteni_poslednich_zaznamu_a_poskozene_radky() {
        let d = temp_dir("read");
        for i in 0..70 {
            let e = make_entry(i, "main", Level::Info, &format!("m{i}"), None, None);
            append(&d, &serde_json::to_string(&e).unwrap(), 2_000).unwrap();
            if i == 30 {
                append(&d, "{nesmysl", 2_000).unwrap();
            }
        }
        let last = read_last(&d, SHOW_LAST);
        assert!(last.len() <= SHOW_LAST && !last.is_empty());
        assert_eq!(last.last().unwrap().message, "m69");
        /* pořadí od nejstaršího */
        assert!(last.windows(2).all(|w| w[0].ts < w[1].ts));
        clear_files(&d);
        assert!(read_last(&d, SHOW_LAST).is_empty());
        assert_eq!(read_raw(&d, None), "(log is empty)\n");
    }

    #[test]
    fn ocisteni_domovske_slozky_cest_a_emailu() {
        let home = Some(r"C:\Users\Jaroslav Kopeček");
        let s = r"Chyba v C:\Users\Jaroslav Kopeček\AppData\Roaming\cz.arcops.companion\state.json a c:\users\jaroslav kopeček\x";
        let out = scrub(s, home);
        assert_eq!(out, r"Chyba v %USERPROFILE%\AppData\Roaming\cz.arcops.companion\state.json a %USERPROFILE%\x");
        assert_eq!(scrub("file:///C:/Users/Jaroslav Kopeček/a.js:1:2", home), "file:///%USERPROFILE%/a.js:1:2");
        assert_eq!(scrub(r#"{"p":"C:\\Users\\Jaroslav Kopeček\\a"}"#, home), r#"{"p":"%USERPROFILE%\\a"}"#);
        /* neznámá domovská složka: obecný vzor X:\Users\<jméno> */
        assert_eq!(scrub(r"D:\Users\someone\file.txt", None), r"%USERPROFILE%\file.txt");
        assert_eq!(scrub(r"\\?\C:\Users\bob\x", None), r"\\?\%USERPROFILE%\x");
        assert_eq!(scrub("C:/Users/alice", None), "%USERPROFILE%");
        assert_eq!(scrub(r"C:\Program Files\x", None), r"C:\Program Files\x");
        /* e-maily */
        assert_eq!(scrub("napiš na jaroslav.kopec@comutec.net, díky", None), "napiš na <email>, díky");
        assert_eq!(scrub("a+b_c@sub.example.co.uk. konec", None), "<email>. konec");
        assert_eq!(scrub("x@y oder fn@http://localhost:1420/a.js", None), "x@y oder fn@http://localhost:1420/a.js");
        assert_eq!(scrub("dvě: a@b.cz b@c.org", None), "dvě: <email> <email>");
        /* dlouhé tokeny (klíče) */
        assert_eq!(scrub("key sk-ant-api03-abcdefghijklmnop1234567890QRSTUV end", None), "key <redacted> end");
        /* 0.30.0: klíče poskytovatelů AI asistenta (i bez číslice nebo kratší než 32 znaků) */
        /* zkušební hodnoty jsou záměrně kratší než skutečné klíče (aby je skenery tajemství nebraly za klíč) */
        assert_eq!(scrub("Bearer gsk_FAKEFAKEFAKEFAKEnotakey", None), "Bearer <redacted>");
        assert_eq!(scrub("key=AIzaFAKEFAKEFAKEnotakey;", None), "key=<redacted>;");
        assert_eq!(scrub("sk-or-v1-FAKEFAKEFAKEnotakey", None), "<redacted>");
        assert_eq!(scrub("gsk_shortbutkey16", None), "<redacted>");
        assert_eq!(scrub("ask-me and sk-x", None), "ask-me and sk-x");
        assert_eq!(scrub("at App (http://tauri.localhost/assets/index-BX3k2a9f.js:12:34)", None), "at App (http://tauri.localhost/assets/index-BX3k2a9f.js:12:34)");
    }

    #[test]
    fn limity_delky_a_ridici_znaky() {
        let huge = "é".repeat(100_000);
        let e = make_entry(1, "overlay", Level::Error, &huge, Some(&format!("{huge}\n{huge}")), None);
        assert!(e.message.len() <= MAX_MESSAGE, "{}", e.message.len());
        assert!(e.message.ends_with('…'));
        assert!(e.stack.len() <= MAX_STACK);
        let lines = (0..100).map(|i| format!("at f{i} (a.js:{i}:1)")).collect::<Vec<_>>().join("\r\n");
        let e = make_entry(1, "main", Level::Warn, "a\nb\r\u{1b}[31mc\u{0}", Some(&lines), None);
        assert_eq!(e.message, "a b  [31mc ");
        assert_eq!(e.stack.lines().count(), MAX_STACK_LINES);
        assert!(!e.stack.contains('\r'));
        /* JSON řádek je vždy jeden řádek */
        assert!(!serde_json::to_string(&e).unwrap().contains('\n'));
        assert_eq!(make_entry(1, "main", Level::Info, "   ", None, None).message, "(empty)");
        /* okno jen ze známých štítků */
        assert_eq!(make_entry(1, "../../evil", Level::Info, "x", None, None).window, "other");
        assert_eq!(make_entry(1, "widgets", Level::Info, "x", None, None).window, "widgets");
        /* úroveň jen z pevného výčtu */
        assert!(serde_json::from_str::<Level>("\"fatal\"").is_err());
        assert!(serde_json::from_str::<Level>("\"ERROR\"").is_err());
        assert_eq!(serde_json::from_str::<Level>("\"warn\"").unwrap(), Level::Warn);
    }

    #[test]
    fn omezovac_na_okno() {
        let mut l = Limiter::default();
        let t0 = Instant::now();
        for i in 0..20 {
            assert_eq!(l.admit("buddy", t0), (true, 0), "{i}");
        }
        for _ in 0..30 {
            assert_eq!(l.admit("buddy", t0), (false, 0));
        }
        /* jiné okno má vlastní kbelík */
        assert_eq!(l.admit("main", t0), (true, 0));
        /* po 3 s je zpět jeden token a první puštěný záznam nese počet zahozených */
        assert_eq!(l.admit("buddy", t0 + Duration::from_secs(3)), (true, 30));
        assert_eq!(l.admit("buddy", t0 + Duration::from_secs(3)), (false, 0));
        assert_eq!(l.drain(), vec![("buddy".to_string(), 1)]);
        assert!(l.drain().is_empty());
        /* za minutu se kbelík doplní nejvýš na BURST */
        let t1 = t0 + Duration::from_secs(600);
        let n = (0..100).filter(|_| l.admit("buddy", t1).0).count();
        assert_eq!(n, BURST as usize);
    }

    #[test]
    fn denik_omezi_okno_a_zapise_jeden_suppressed() {
        let d = temp_dir("diag");
        let diag = Diag::new(d.clone(), false);
        for i in 0..100 {
            diag.log("buddy", Level::Error, &format!("e{i}"), None);
        }
        diag.log("main", Level::Info, "hlavni", None);
        diag.flush();
        let all = read_last(&d, 1000);
        assert_eq!(all.iter().filter(|e| e.window == "buddy" && e.message.starts_with('e')).count(), BURST as usize);
        let sup: Vec<_> = all.iter().filter(|e| e.message.starts_with("suppressed")).collect();
        assert_eq!(sup.len(), 1);
        assert_eq!(sup[0].message, "suppressed 80 entries (rate limit)");
        assert_eq!(sup[0].window, "buddy");
        assert!(all.iter().any(|e| e.window == "main" && e.message == "hlavni"));
        diag.clear();
        assert!(read_last(&d, 1000).is_empty());
    }

    #[test]
    fn znacka_relace() {
        let d = temp_dir("marker");
        assert_eq!(start_session(&d), LastSession::Clean);
        /* bez čistého ukončení zůstane */
        assert_eq!(start_session(&d), LastSession::Unclean);
        end_session(&d);
        assert!(!d.join(MARKER).exists());
        assert_eq!(start_session(&d), LastSession::Clean);
        /* cizí proces značku nesmaže */
        fs::write(d.join(MARKER), format!("999999999 1 {VERSION}")).unwrap();
        end_session(&d);
        assert!(d.join(MARKER).exists());
        assert_eq!(start_session(&d), LastSession::Unclean);
        /* značka jiné verze (instalátor aktualizace ukončil starou verzi) se nehlásí jako pád */
        fs::write(d.join(MARKER), "4242 1 0.27.9").unwrap();
        assert_eq!(start_session(&d), LastSession::OtherVersion);
        /* poškozená značka (jen pid) = nečekaný konec jiné verze, ne pád této */
        fs::write(d.join(MARKER), "4242").unwrap();
        assert_eq!(start_session(&d), LastSession::OtherVersion);
    }

    #[test]
    fn hlavicka_exportu_jen_povolene_funkce() {
        let mut f = HashMap::new();
        f.insert("buddy".to_string(), true);
        f.insert("apiKey".to_string(), true);
        f.insert("../x".to_string(), true);
        let line = feature_line(&f);
        assert!(line.starts_with("buddy=true autoOpen=false"));
        assert!(!line.contains("apiKey") && !line.contains("../x"));
        let d = temp_dir("export");
        let diag = Diag::new(d.clone(), false);
        diag.log("main", Level::Error, r"boom C:\Users\x\y", None);
        diag.flush();
        let txt = export_text(&diag, "Windows 11 (25H2, build 26200.1)\n", "142.0", &f);
        assert!(txt.contains(&format!("app: {VERSION}\n")));
        assert!(txt.contains("os: Windows 11 (25H2, build 26200.1) \n"));
        assert!(txt.contains("webview2: 142.0\n"));
        assert!(txt.contains("----- diag.log -----"));
        assert!(txt.contains(r"boom %USERPROFILE%\\y"));
    }

    #[test]
    fn cist_exportovat_a_mazat_smi_jen_hlavni_okno() {
        assert!(main_label_ok("main").is_ok());
        for l in ["buddy", "overlay", "widgets", "app", "", "Main", "main ", "other"] {
            assert!(main_label_ok(l).is_err(), "{l}");
        }
    }

    /* Jádra příkazů s štítkem volajícího okna: okno se určí podle volajícího, cizí okno deník nepřečte ani nesmaže. */
    #[test]
    fn jen_hlavni_okno_cte_a_maze_okno_podle_volajiciho() {
        let d = temp_dir("cmd");
        let diag = Diag::new(d.clone(), false);
        log_from("buddy", &diag, Level::Error, "z buddyho", None);
        log_from("main", &diag, Level::Info, "z hlavního", Some("at x"));
        for l in ["buddy", "overlay", "widgets", "app", "other", ""] {
            assert_eq!(read_for(l, &diag), Err("diag:denied".to_string()), "{l}");
            assert_eq!(clear_for(l, &diag), Err("diag:denied".to_string()), "{l}");
        }
        let list = read_for("main", &diag).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!((list[0].window.as_str(), list[0].message.as_str()), ("buddy", "z buddyho"));
        assert_eq!((list[1].window.as_str(), list[1].stack.as_str()), ("main", "at x"));
        clear_for("main", &diag).unwrap();
        assert!(read_for("main", &diag).unwrap().is_empty());
    }
}
