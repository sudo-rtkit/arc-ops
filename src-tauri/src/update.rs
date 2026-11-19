//! 0.33.0: volitelná kontrola nových verzí (jen upozornění: nic nestahuje ani nespouští). Druhé a poslední místo
//! aplikace, které smí na síť (vedle AI asistenta v src/ai.rs):
//! - Jediná adresa `URL` (konstanta v kódu). Příkaz `update_check` nebere od okna žádný argument.
//! - Volá jen hlavní okno (štítek okna ověřuje Rust; capability jen v capabilities/main.json).
//! - GET přes HTTPS společným klientem z ai.rs (ureq + rustls, bez přesměrování a bez cookies). Hlavičky jen
//!   User-Agent `ARC-Raiders-Companion/<verze aplikace>` a Accept; žádný token, cookies ani údaje o hráči.
//! - Meze: `TIMEOUT` 10 s, nejvýš `MAX_RESPONSE` bajtů; z odpovědi se čte jen tag_name, html_url, name,
//!   published_at, draft, prerelease a prvních `NOTES_BYTES` bajtů body (prostý text bez řídicích znaků).
//! - Ověření: tag `^v\d+\.\d+\.\d+$`, html_url přesně `RELEASES_PREFIX` + `tag/<tag>`; koncept a předběžná verze se
//!   ignorují. Porovnává se s verzí aplikace z Tauri (package info), nikdy s hodnotou z odpovědi.
//! - Nejvýš jeden dotaz na síť za `MIN_INTERVAL` (10 min); volání v tom okně vrátí uložený výsledek (`cached`).
//! - Při hře v popředí se nic neposílá.
//! - Síť je za rozhraním `Fetch`, takže testy nikdy nejdou na síť.

use crate::ai::NetErr;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, Runtime, State, WebviewWindow};

/// Jediná adresa, na kterou se kontrola ptá (nejnovější vydání tohoto repozitáře).
pub const URL: &str = "https://api.github.com/repos/sudo-rtkit/arc-ops/releases/latest";
/// Hostitel adresy (kontrola `url_fixed_ok`).
pub const HOST: &str = "api.github.com";
/// Stránka vydání musí začínat přesně tímto (a pokračovat jen `tag/<tag>`).
pub const RELEASES_PREFIX: &str = "https://github.com/sudo-rtkit/arc-ops/releases/";
pub const ACCEPT: &str = "application/vnd.github+json";
pub const APP_NAME: &str = "ARC-Raiders-Companion";
/// Časový limit celého dotazu.
pub const TIMEOUT: Duration = Duration::from_secs(10);
/// Nejvýš tolik bajtů odpovědi se přečte (zbytek = chybná odpověď).
pub const MAX_RESPONSE: usize = 256 * 1024;
/// Z poznámek k vydání se vezme nejvýš tolik bajtů.
pub const NOTES_BYTES: usize = 2048;
/// Název vydání: nejvýš tolik znaků.
pub const NAME_MAX: usize = 120;
/// Nejvýš jeden dotaz na síť za tuto dobu.
pub const MIN_INTERVAL: Duration = Duration::from_secs(600);

/// Verze major.minor.patch.
pub type Ver = (u32, u32, u32);

/// "1.2.3" → (1, 2, 3): přesně tři čísla z číslic ASCII oddělená tečkou, každé nejvýš 9 číslic.
pub fn parse_version(s: &str) -> Option<Ver> {
    let mut it = s.split('.');
    let mut n = [0u32; 3];
    for slot in n.iter_mut() {
        let p = it.next()?;
        if p.is_empty() || p.len() > 9 || !p.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        *slot = p.parse().ok()?;
    }
    if it.next().is_some() {
        return None;
    }
    Some((n[0], n[1], n[2]))
}

/// Tag vydání `^v\d+\.\d+\.\d+$` → verze.
pub fn parse_tag(tag: &str) -> Option<Ver> {
    parse_version(tag.strip_prefix('v')?)
}

pub fn fmt_ver(v: Ver) -> String {
    format!("{}.{}.{}", v.0, v.1, v.2)
}

/// Je vydání novější než aplikace? (číselně: 0.10.0 > 0.9.9, stejná verze = ne)
pub fn is_newer(latest: Ver, current: Ver) -> bool {
    latest > current
}

/// Stránka vydání: přesně `RELEASES_PREFIX` + `tag/<tag>`, tag platný (jiný hostitel, repozitář, cesta, dotaz nebo
/// kotva neprojde).
pub fn url_ok(url: &str, tag: &str) -> bool {
    parse_tag(tag).is_some() && url.strip_prefix(RELEASES_PREFIX).is_some_and(|rest| rest.strip_prefix("tag/") == Some(tag))
}

/// Pevná adresa dotazu: jen https a jen hostitel `HOST`.
pub fn url_fixed_ok(url: &str) -> bool {
    url.strip_prefix("https://").and_then(|r| r.split('/').next()) == Some(HOST)
}

/// User-Agent: jen název aplikace a verze (z čísel, takže nic jiného se do něj nedostane).
pub fn user_agent(current: Ver) -> String {
    format!("{APP_NAME}/{}", fmt_ver(current))
}

/// Výsledek do okna.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// nejnovější vydání bez `v` (např. 0.34.0)
    pub latest: String,
    /// verze aplikace (z Tauri)
    pub current: String,
    pub newer: bool,
    /// stránka vydání (ověřená)
    pub url: String,
    pub name: String,
    /// čas vydání ISO 8601 (UTC) nebo prázdné
    pub published_at: String,
    /// prostý text, nejvýš NOTES_BYTES bajtů
    pub notes: String,
    /// výsledek z posledního dotazu (bez sítě)
    pub cached: bool,
}

/// Chyby jako pevné kódy (okno je přeloží).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdErr {
    Window,
    Game,
    Offline,
    Timeout,
    Rate,
    Bad,
    /// nejnovější vydání je koncept nebo předběžná verze (ignoruje se)
    NoRelease,
}

impl UpdErr {
    pub fn code(self) -> &'static str {
        match self {
            UpdErr::Window => "update:window",
            UpdErr::Game => "update:game",
            UpdErr::Offline => "update:offline",
            UpdErr::Timeout => "update:timeout",
            UpdErr::Rate => "update:rate",
            UpdErr::Bad => "update:bad",
            UpdErr::NoRelease => "update:none",
        }
    }
}

/// Jen hlavní okno (štítek volajícího okna z Rustu).
pub fn main_label(label: &str) -> Result<(), UpdErr> {
    if label == crate::bus::MAIN { Ok(()) } else { Err(UpdErr::Window) }
}

/// Jen pole, která kontrola potřebuje; všechno ostatní v odpovědi se zahodí.
#[derive(Deserialize)]
struct Release {
    tag_name: Option<String>,
    html_url: Option<String>,
    name: Option<String>,
    published_at: Option<String>,
    draft: Option<bool>,
    prerelease: Option<bool>,
    body: Option<String>,
}

/// Čas ve tvaru `YYYY-MM-DDTHH:MM:SSZ`.
pub fn iso_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 20
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            10 => *c == b'T',
            13 | 16 => *c == b':',
            19 => *c == b'Z',
            _ => c.is_ascii_digit(),
        })
}

fn bad_char(c: char) -> bool {
    c.is_control() || matches!(c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{feff}')
}

/// Prvních nejvýš `max` bajtů textu (na hranici znaku).
fn head(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Poznámky k vydání: prvních NOTES_BYTES bajtů, bez řídicích a neviditelných znaků (konec řádku zůstane).
pub fn clean_notes(s: &str) -> String {
    let s = head(s, NOTES_BYTES).replace("\r\n", "\n");
    let out: String = s.chars().map(|c| if c == '\n' { '\n' } else if bad_char(c) { ' ' } else { c }).collect();
    out.trim().to_string()
}

/// Název vydání: jeden řádek, nejvýš NAME_MAX znaků.
pub fn clean_name(s: &str) -> String {
    let one: String = s.chars().map(|c| if bad_char(c) { ' ' } else { c }).collect();
    one.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(NAME_MAX).collect()
}

/// Odpověď GitHubu → výsledek. 403 a 429 = limit GitHubu; jiný stav než 2xx, vadný JSON, tag nebo adresa = chybná
/// odpověď; koncept a předběžná verze se ignorují.
pub fn parse_release(status: u16, body: &[u8], current: Ver) -> Result<UpdateInfo, UpdErr> {
    if matches!(status, 403 | 429) {
        return Err(UpdErr::Rate);
    }
    if !(200..300).contains(&status) {
        return Err(UpdErr::Bad);
    }
    let r: Release = serde_json::from_slice(body).map_err(|_| UpdErr::Bad)?;
    if r.draft == Some(true) || r.prerelease == Some(true) {
        return Err(UpdErr::NoRelease);
    }
    let tag = r.tag_name.ok_or(UpdErr::Bad)?;
    let latest = parse_tag(&tag).ok_or(UpdErr::Bad)?;
    let url = r.html_url.ok_or(UpdErr::Bad)?;
    if !url_ok(&url, &tag) {
        return Err(UpdErr::Bad);
    }
    let published_at = r.published_at.filter(|p| iso_ok(p)).unwrap_or_default();
    Ok(UpdateInfo {
        latest: fmt_ver(latest),
        current: fmt_ver(current),
        newer: is_newer(latest, current),
        url,
        name: clean_name(r.name.as_deref().unwrap_or("")),
        published_at,
        notes: clean_notes(r.body.as_deref().unwrap_or("")),
        cached: false,
    })
}

/* ----- síť ----- */

/// GET na adresu s User-Agentem. Vrací stav HTTP a nejvýš MAX_RESPONSE bajtů těla.
pub trait Fetch: Send + Sync {
    fn get(&self, url: &str, user_agent: &str) -> Result<(u16, Vec<u8>), NetErr>;
}

/// Skutečná síť: společný klient z ai.rs (rustls, bez přesměrování a cookies), hlavičky jen User-Agent a Accept.
pub struct UreqFetch {
    pub timeout: Duration,
    pub max_read: usize,
    pub https_only: bool,
}

impl UreqFetch {
    pub fn production() -> Self {
        UreqFetch { timeout: TIMEOUT, max_read: MAX_RESPONSE, https_only: true }
    }
}

impl Fetch for UreqFetch {
    fn get(&self, url: &str, user_agent: &str) -> Result<(u16, Vec<u8>), NetErr> {
        let res = crate::ai::agent(self.timeout, self.https_only, user_agent).get(url).header("Accept", ACCEPT).call();
        let mut res = match res {
            Ok(r) => r,
            Err(ureq::Error::Timeout(_)) => return Err(NetErr::Timeout),
            Err(_) => return Err(NetErr::Offline),
        };
        let status = res.status().as_u16();
        crate::ai::read_body(&mut res, self.max_read).map(|b| (status, b))
    }
}

/* ----- stav ----- */

pub struct Updater {
    pub fetch: Box<dyn Fetch>,
    /// poslední dotaz na síť: kdy a s jakým výsledkem (i chybou)
    last: Mutex<Option<(Instant, Result<UpdateInfo, UpdErr>)>>,
}

impl Updater {
    pub fn new(fetch: Box<dyn Fetch>) -> Self {
        Updater { fetch, last: Mutex::new(None) }
    }
    pub fn production() -> Self {
        Updater::new(Box::new(UreqFetch::production()))
    }
}

pub struct UpdateState(pub Arc<Updater>);

/// Jádro příkazu update_check. `label` je štítek volajícího okna z Rustu, `current` verze aplikace z Tauri,
/// `game_front` = hra je v popředí. Pořadí: okno → verze aplikace → hra v popředí → limit (uložený výsledek) → síť.
/// Zámek drží i během dotazu, takže dvě volání naráz udělají nejvýš jeden dotaz.
pub fn check_for(label: &str, up: &Updater, current: &str, game_front: bool, now: Instant) -> Result<UpdateInfo, UpdErr> {
    main_label(label)?;
    let cur = parse_version(current).ok_or(UpdErr::Bad)?;
    if game_front {
        return Err(UpdErr::Game);
    }
    let mut last = up.last.lock().map_err(|_| UpdErr::Bad)?;
    if let Some((at, r)) = last.as_ref() {
        if now.saturating_duration_since(*at) < MIN_INTERVAL {
            return r.clone().map(|i| UpdateInfo { cached: true, ..i });
        }
    }
    if !url_fixed_ok(URL) {
        return Err(UpdErr::Bad);
    }
    let r = match up.fetch.get(URL, &user_agent(cur)) {
        Ok((status, bytes)) => parse_release(status, &bytes, cur),
        Err(NetErr::Timeout) => Err(UpdErr::Timeout),
        Err(NetErr::Offline) => Err(UpdErr::Offline),
        Err(NetErr::TooBig) => Err(UpdErr::Bad),
    };
    *last = Some((now, r.clone()));
    r
}

/// Kontrola nové verze (jen hlavní okno). Běží mimo vlákno UI; vrací výsledek nebo kód chyby `update:<kód>`.
#[tauri::command]
pub async fn update_check<R: Runtime>(window: WebviewWindow<R>, st: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    crate::bus::only(&window, &[crate::bus::MAIN]).map_err(|_| UpdErr::Window.code().to_string())?;
    let label = window.label().to_string();
    let current = window.app_handle().package_info().version.to_string();
    let up = st.0.clone();
    let game_front = crate::ops::game_in_front();
    let r = tauri::async_runtime::spawn_blocking(move || check_for(&label, &up, &current, game_front, Instant::now()))
        .await
        .unwrap_or(Err(UpdErr::Bad));
    r.map_err(|e| {
        /* do deníku jen kód chyby */
        crate::diag::rust(crate::diag::Level::Warn, "update check", e.code());
        e.code().to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const CUR: &str = "0.33.0";

    /// Zkušební síť: pevná odpověď, počítá dotazy a pamatuje si adresu a User-Agent.
    struct Fake {
        reply: Mutex<Result<(u16, Vec<u8>), NetErr>>,
        calls: AtomicUsize,
        seen: Mutex<Vec<(String, String)>>,
    }
    impl Fake {
        fn new(reply: Result<(u16, Vec<u8>), NetErr>) -> Arc<Self> {
            Arc::new(Fake { reply: Mutex::new(reply), calls: AtomicUsize::new(0), seen: Mutex::new(vec![]) })
        }
        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }
    impl Fetch for Arc<Fake> {
        fn get(&self, url: &str, user_agent: &str) -> Result<(u16, Vec<u8>), NetErr> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.seen.lock().unwrap().push((url.to_string(), user_agent.to_string()));
            self.reply.lock().unwrap().clone()
        }
    }
    fn release(tag: &str, url: &str) -> serde_json::Value {
        serde_json::json!({
            "tag_name": tag, "html_url": url, "name": "Ops 0.34.0", "published_at": "2026-12-01T10:00:00Z",
            "draft": false, "prerelease": false, "body": "## Novinky\n- **Ops** umí víc",
            "assets": [{ "browser_download_url": "https://evil.example/x.exe" }], "author": { "login": "x" }
        })
    }
    fn ok(tag: &str) -> Result<(u16, Vec<u8>), NetErr> {
        Ok((200, serde_json::to_vec(&release(tag, &format!("{RELEASES_PREFIX}tag/{tag}"))).unwrap()))
    }
    fn up(fake: &Arc<Fake>) -> Updater {
        Updater::new(Box::new(fake.clone()))
    }

    #[test]
    fn pevna_adresa_jen_https_a_jen_api_github() {
        assert_eq!(URL, "https://api.github.com/repos/sudo-rtkit/arc-ops/releases/latest");
        assert!(url_fixed_ok(URL));
        for bad in ["http://api.github.com/x", "https://api.github.com.evil.com/x", "https://evil.com/api.github.com", "https://api.github.com:8443/x", "api.github.com/x"] {
            assert!(!url_fixed_ok(bad), "{bad}");
        }
        /* dotaz jde vždy na pevnou adresu, s User-Agentem jen z názvu a verze */
        let fake = Fake::new(ok("v0.34.0"));
        check_for("main", &up(&fake), CUR, false, Instant::now()).unwrap();
        let seen = fake.seen.lock().unwrap();
        assert_eq!(seen.as_slice(), &[(URL.to_string(), "ARC-Raiders-Companion/0.33.0".to_string())]);
        let prod = UreqFetch::production();
        assert!(prod.https_only);
        assert_eq!(prod.timeout, Duration::from_secs(10));
        assert_eq!(prod.max_read, 256 * 1024);
    }

    #[test]
    fn jen_hlavni_okno() {
        let fake = Fake::new(ok("v0.34.0"));
        let u = up(&fake);
        for label in ["buddy", "overlay", "widgets", "", "Main", "main ", "evil"] {
            assert_eq!(check_for(label, &u, CUR, false, Instant::now()), Err(UpdErr::Window), "{label}");
        }
        assert_eq!(fake.calls(), 0);
        assert!(check_for("main", &u, CUR, false, Instant::now()).is_ok());
    }

    #[test]
    fn s_hrou_v_popredi_se_nic_neposle() {
        let fake = Fake::new(ok("v0.34.0"));
        let u = up(&fake);
        assert_eq!(check_for("main", &u, CUR, true, Instant::now()), Err(UpdErr::Game));
        assert_eq!(fake.calls(), 0);
        /* hra v popředí nevyčerpá limit */
        assert!(check_for("main", &u, CUR, false, Instant::now()).is_ok());
        assert_eq!(fake.calls(), 1);
    }

    #[test]
    fn porovnani_verzi() {
        let v = |s| parse_version(s).unwrap();
        assert!(is_newer(v("0.10.0"), v("0.9.9")));
        assert!(!is_newer(v("0.9.9"), v("0.10.0")));
        assert!(!is_newer(v("0.33.0"), v("0.33.0")));
        assert!(is_newer(v("0.33.1"), v("0.33.0")));
        assert!(is_newer(v("1.0.0"), v("0.99.99")));
        assert!(!is_newer(v("0.32.9"), v("0.33.0")));
        assert_eq!(parse_version("0.33.0"), Some((0, 33, 0)));
        for bad in ["", "1", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", " 1.2.3", "1.2.3 ", "1..3", "1.2.-3", "1.2.+3", "1.2.3-beta", "１.2.3", "1234567890.0.0"] {
            assert_eq!(parse_version(bad), None, "{bad}");
        }
        /* stejná verze: newer = false; starší vydání na GitHubu (návrat): newer = false */
        let fake = Fake::new(ok("v0.33.0"));
        let r = check_for("main", &up(&fake), CUR, false, Instant::now()).unwrap();
        assert!(!r.newer);
        assert_eq!(r.latest, "0.33.0");
        let fake = Fake::new(ok("v0.9.9"));
        assert!(!check_for("main", &up(&fake), "0.10.0", false, Instant::now()).unwrap().newer);
        let fake = Fake::new(ok("v0.10.0"));
        assert!(check_for("main", &up(&fake), "0.9.9", false, Instant::now()).unwrap().newer);
        /* verze aplikace, která není x.y.z, nic neposílá */
        let fake = Fake::new(ok("v0.34.0"));
        assert_eq!(check_for("main", &up(&fake), "0.33.0-dev", false, Instant::now()), Err(UpdErr::Bad));
        assert_eq!(fake.calls(), 0);
    }

    #[test]
    fn tag_a_adresa_stranky_vydani() {
        for ok in ["v0.34.0", "v1.0.0", "v10.20.30"] {
            assert!(parse_tag(ok).is_some(), "{ok}");
        }
        for bad in ["0.34.0", "V0.34.0", "v0.34", "v0.34.0-beta", "v0.34.0 ", "vv0.34.0", "v0.34.0/x", "", "v"] {
            assert!(parse_tag(bad).is_none(), "{bad}");
        }
        let tag = "v0.34.0";
        assert!(url_ok("https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0", tag));
        for bad in [
            "http://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://github.com.evil.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://evil.com/github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://gitHub.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://github.com:443/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://user@github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "https://github.com/sudo-rtkit/arc-ops-evil/releases/tag/v0.34.0",
            "https://github.com/sudo-rtkit/arc-ops2/releases/tag/v0.34.0",
            "https://github.com/evil/arc-ops/releases/tag/v0.34.0",
            "https://github.com/sudo-rtkit/arc-ops/releasesx/tag/v0.34.0",
            "https://github.com/sudo-rtkit/arc-ops/releases/download/v0.34.0/setup.exe",
            "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0/../../../../evil/x",
            "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0?x=1",
            "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0#x",
            "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.35.0",
            "https://github.com/sudo-rtkit/arc-ops/releases/",
            "https://github.com/sudo-rtkit/arc-ops/releases/tag/",
            " https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
            "javascript:alert(1)//https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0",
        ] {
            assert!(!url_ok(bad, tag), "{bad}");
        }
        /* odpověď s cizí adresou nebo vadným tagem = chybná odpověď */
        for (t, u) in [
            ("v0.34.0", "https://github.com.evil.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0"),
            ("v0.34.0", "https://github.com/sudo-rtkit/arc-ops-evil/releases/tag/v0.34.0"),
            ("0.34.0", "https://github.com/sudo-rtkit/arc-ops/releases/tag/0.34.0"),
            ("v0.34.0-rc1", "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0-rc1"),
        ] {
            let body = serde_json::to_vec(&release(t, u)).unwrap();
            assert_eq!(parse_release(200, &body, (0, 33, 0)), Err(UpdErr::Bad), "{t} {u}");
        }
        assert_eq!(parse_release(200, br#"{"html_url":"https://github.com/sudo-rtkit/arc-ops/releases/tag/v1.0.0"}"#, (0, 33, 0)), Err(UpdErr::Bad));
        assert_eq!(parse_release(200, br#"{"tag_name":"v1.0.0"}"#, (0, 33, 0)), Err(UpdErr::Bad));
        assert_eq!(parse_release(200, br#"{"tag_name":1,"html_url":"x"}"#, (0, 33, 0)), Err(UpdErr::Bad));
    }

    #[test]
    fn koncept_a_predbezna_verze_se_ignoruji() {
        for (draft, pre) in [(true, false), (false, true), (true, true)] {
            let mut v = release("v0.34.0", "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0");
            v["draft"] = serde_json::json!(draft);
            v["prerelease"] = serde_json::json!(pre);
            assert_eq!(parse_release(200, &serde_json::to_vec(&v).unwrap(), (0, 33, 0)), Err(UpdErr::NoRelease), "{draft} {pre}");
        }
        /* chybějící příznaky = běžné vydání */
        let r = parse_release(200, br#"{"tag_name":"v0.34.0","html_url":"https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0"}"#, (0, 33, 0)).unwrap();
        assert!(r.newer);
        assert_eq!(r.notes, "");
        assert_eq!(r.published_at, "");
    }

    #[test]
    fn jen_vybrana_pole_a_meze_poznamek() {
        let r = parse_release(200, &serde_json::to_vec(&release("v0.34.0", "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0")).unwrap(), (0, 33, 0)).unwrap();
        assert_eq!(
            r,
            UpdateInfo {
                latest: "0.34.0".into(),
                current: "0.33.0".into(),
                newer: true,
                url: "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0".into(),
                name: "Ops 0.34.0".into(),
                published_at: "2026-12-01T10:00:00Z".into(),
                notes: "## Novinky\n- **Ops** umí víc".into(),
                cached: false,
            }
        );
        /* do okna jde jen tohle (assets, author ani nic dalšího) */
        let v = serde_json::to_value(&r).unwrap();
        let mut keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["cached", "current", "latest", "name", "newer", "notes", "publishedAt", "url"]);
        assert!(!serde_json::to_string(&r).unwrap().contains("evil.example"));
        /* poznámky: nejvýš NOTES_BYTES bajtů, bez řídicích a neviditelných znaků */
        let long = "č".repeat(NOTES_BYTES);
        assert!(clean_notes(&long).len() <= NOTES_BYTES);
        assert!(clean_notes(&long).chars().all(|c| c == 'č'));
        assert_eq!(clean_notes("a\u{0007}b\r\nc\u{202e}d\u{200b}e\u{0000}"), "a b\nc d e");
        assert_eq!(clean_name("  Ops\n0.34\u{202e}  "), "Ops 0.34");
        assert_eq!(clean_name(&"x".repeat(500)).chars().count(), NAME_MAX);
        /* čas jen ve tvaru ISO 8601 UTC */
        assert!(iso_ok("2026-12-01T10:00:00Z"));
        for bad in ["", "2026-12-01", "2026-12-01T10:00:00+01:00", "2026-12-01T10:00:00.000Z", "<script>alert(1)</scr"] {
            assert!(!iso_ok(bad), "{bad}");
        }
    }

    #[test]
    fn mapovani_chyb() {
        for (status, want) in [(403, UpdErr::Rate), (429, UpdErr::Rate), (404, UpdErr::Bad), (500, UpdErr::Bad), (301, UpdErr::Bad), (401, UpdErr::Bad)] {
            let fake = Fake::new(Ok((status, b"{\"message\":\"API rate limit exceeded\"}".to_vec())));
            assert_eq!(check_for("main", &up(&fake), CUR, false, Instant::now()), Err(want), "{status}");
        }
        for (net, want) in [(NetErr::Timeout, UpdErr::Timeout), (NetErr::Offline, UpdErr::Offline), (NetErr::TooBig, UpdErr::Bad)] {
            let fake = Fake::new(Err(net));
            assert_eq!(check_for("main", &up(&fake), CUR, false, Instant::now()), Err(want));
        }
        assert_eq!(parse_release(200, b"not json", (0, 33, 0)), Err(UpdErr::Bad));
        assert_eq!(parse_release(200, b"[]", (0, 33, 0)), Err(UpdErr::Bad));
        for (e, code) in [
            (UpdErr::Window, "update:window"),
            (UpdErr::Game, "update:game"),
            (UpdErr::Offline, "update:offline"),
            (UpdErr::Timeout, "update:timeout"),
            (UpdErr::Rate, "update:rate"),
            (UpdErr::Bad, "update:bad"),
            (UpdErr::NoRelease, "update:none"),
        ] {
            assert_eq!(e.code(), code);
        }
    }

    #[test]
    fn nejvys_jeden_dotaz_za_deset_minut() {
        assert_eq!(MIN_INTERVAL, Duration::from_secs(600));
        let fake = Fake::new(ok("v0.34.0"));
        let u = up(&fake);
        let t0 = Instant::now();
        let first = check_for("main", &u, CUR, false, t0).unwrap();
        assert!(!first.cached);
        /* v okně 10 minut: uložený výsledek bez sítě */
        for s in [0, 1, 60, 599] {
            let r = check_for("main", &u, CUR, false, t0 + Duration::from_secs(s)).unwrap();
            assert!(r.cached, "{s}");
            assert_eq!(r.latest, first.latest);
        }
        assert_eq!(fake.calls(), 1);
        /* po 10 minutách nový dotaz */
        *fake.reply.lock().unwrap() = ok("v0.35.0");
        let r = check_for("main", &u, CUR, false, t0 + Duration::from_secs(600)).unwrap();
        assert!(!r.cached);
        assert_eq!(r.latest, "0.35.0");
        assert_eq!(fake.calls(), 2);
        /* i chyba se pamatuje (žádné opakované dotazy při výpadku) */
        let fake = Fake::new(Err(NetErr::Offline));
        let u = up(&fake);
        assert_eq!(check_for("main", &u, CUR, false, t0), Err(UpdErr::Offline));
        assert_eq!(check_for("main", &u, CUR, false, t0 + Duration::from_secs(30)), Err(UpdErr::Offline));
        assert_eq!(fake.calls(), 1);
        /* jiné okno ani hra v popředí limit neobejdou ani nespotřebují */
        assert_eq!(check_for("overlay", &u, CUR, false, t0 + Duration::from_secs(700)), Err(UpdErr::Window));
        assert_eq!(fake.calls(), 1);
        /* dvě volání naráz = jeden dotaz */
        let fake = Fake::new(ok("v0.34.0"));
        let u = Arc::new(up(&fake));
        let hs: Vec<_> = (0..4).map(|_| { let u = u.clone(); std::thread::spawn(move || check_for("main", &u, CUR, false, Instant::now())) }).collect();
        for h in hs {
            assert!(h.join().unwrap().is_ok());
        }
        assert_eq!(fake.calls(), 1);
    }

    /// Místní zkušební server HTTP (jen 127.0.0.1, jen v testu): zachytí dotaz a vrátí pevnou odpověď.
    fn serve(reply: Vec<u8>, wait: Duration) -> (String, std::sync::mpsc::Receiver<Vec<u8>>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            if let Ok((mut s, _)) = l.accept() {
                let mut buf = [0u8; 8192];
                let n = s.read(&mut buf).unwrap_or(0);
                let _ = tx.send(buf[..n].to_vec());
                std::thread::sleep(wait);
                let _ = s.write_all(&reply);
                let _ = s.flush();
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        (format!("http://{addr}/repos/sudo-rtkit/arc-ops/releases/latest"), rx)
    }
    fn http(status: &str, body: &[u8]) -> Vec<u8> {
        let mut v = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nSet-Cookie: a=b\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn skutecny_klient_posila_jen_user_agent_a_accept() {
        let t = UreqFetch { timeout: Duration::from_secs(5), max_read: 4096, https_only: false };
        let body = serde_json::to_vec(&release("v0.34.0", "https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.34.0")).unwrap();
        let (url, rx) = serve(http("200 OK", &body), Duration::ZERO);
        let (status, got) = t.get(&url, &user_agent((0, 33, 0))).unwrap();
        assert_eq!(parse_release(status, &got, (0, 33, 0)).unwrap().latest, "0.34.0");
        let req = String::from_utf8(rx.recv().unwrap()).unwrap().to_ascii_lowercase();
        assert!(req.starts_with("get /repos/sudo-rtkit/arc-ops/releases/latest http/1.1\r\n"), "{req}");
        assert!(req.contains("user-agent: arc-raiders-companion/0.33.0\r\n"), "{req}");
        assert!(req.contains("accept: application/vnd.github+json\r\n"), "{req}");
        for h in ["cookie", "authorization", "x-github", "referer", "origin"] {
            assert!(!req.contains(&format!("\n{h}")), "{h}: {req}");
        }
        /* jen hlavičky host, user-agent, accept (a případně accept-encoding / content-length / connection) */
        let names: Vec<&str> = req.split("\r\n").skip(1).filter(|l| !l.is_empty()).map(|l| l.split(':').next().unwrap()).collect();
        for n in &names {
            assert!(["host", "user-agent", "accept", "accept-encoding", "connection", "content-length"].contains(n), "{n}");
        }
        /* odpověď nad mez čtení */
        let (url, _) = serve(http("200 OK", &vec![b'x'; 8192]), Duration::ZERO);
        assert_eq!(t.get(&url, "ua"), Err(NetErr::TooBig));
        /* 403 se vrátí jako stav */
        let (url, _) = serve(http("403 Forbidden", b"{}"), Duration::ZERO);
        assert_eq!(t.get(&url, "ua").map(|r| r.0), Ok(403));
        /* server neodpovídá do časového limitu */
        let slow = UreqFetch { timeout: Duration::from_millis(300), max_read: 4096, https_only: false };
        let (url, _) = serve(http("200 OK", &body), Duration::from_secs(3));
        assert_eq!(slow.get(&url, "ua"), Err(NetErr::Timeout));
        /* nikdo neposlouchá */
        let dead = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap();
        assert_eq!(t.get(&format!("http://{dead}/x"), "ua"), Err(NetErr::Offline));
        /* produkční klient odmítne http:// ještě před sítí */
        let (url, _) = serve(http("200 OK", &body), Duration::ZERO);
        assert!(UreqFetch::production().get(&url, "ua").is_err());
    }
}
