//! 0.30.0: AI asistent Ops (fáze 1, docs/superpowers/specs/2026-11-14-ai-asistent-design.md). Jediné místo aplikace,
//! které smí na síť, a jen sem:
//! - Pevný seznam poskytovatelů (Groq, Google Gemini, OpenRouter), všichni s rozhraním chat completions kompatibilním
//!   s OpenAI. Adresa je konstanta v kódu, nikdy z dat okna; jen HTTPS a jen hostitelé z `ALLOWED_HOSTS`, bez
//!   přesměrování.
//! - Volá jen hlavní okno (štítek okna ověřuje Rust; overlay posílá otázku hlavnímu oknu přes relay).
//! - Meze: nejvýš `MAX_REQUEST` bajtů zpráv, `MAX_RESPONSE` bajtů odpovědi, `MAX_TOKENS` tokenů, časový limit
//!   `TIMEOUT`, nejvýš jeden dotaz současně, `RATE_PER_MIN` dotazů za minutu a `DAILY_MAX` za den (pojistka v paměti).
//! - Při hře v popředí se nic neposílá.
//! - Klíč (BYOK) je ve Windows Credential Manageru. Do WebView se nikdy nevrátí (stav klíče je jen ano/ne), nejde do
//!   úložiště, zálohy ani do deníku chyb; z JS přijde jen jednou při zadání. Do deníku jde jen kód chyby.
//! - Odpověď poskytovatele se do okna nikdy nepředá celá: jen text odpovědi (bez řídicích znaků, zkrácený). Text
//!   chyby od poskytovatele se zahodí, okno dostane jen kód (`ai:<kód>`).
//! - Síť i úložiště klíčů jsou za rozhraními (`Transport`, `KeyStore`), takže testy nikdy nejdou na síť.
//! - 0.32.0: prázdná odpověď modelu s `reasoning_effort` se jednou zopakuje bez něj, jen ve zbytku `TIMEOUT` a jen
//!   v mezích limitů (`AiReply.retried`); chybová odpověď „model nenalezen“ (podle stavu i těla chyby) = `ai:model`.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Runtime, State, WebviewWindow};

/// Nejvýš tolik bajtů obsahu všech zpráv jednoho dotazu (otázka + data aplikace + pokyny).
pub const MAX_REQUEST: usize = 24 * 1024;
/// Nejvýš tolik bajtů odpovědi poskytovatele se přečte (zbytek = chyba).
pub const MAX_RESPONSE: usize = 64 * 1024;
/// Nejvýš tolik znaků textu odpovědi jde do okna.
pub const MAX_ANSWER: usize = 2000;
/// Nejvýš tolik tokenů smí model vygenerovat.
pub const MAX_TOKENS: u32 = 600;
/// Časový limit celého dotazu.
pub const TIMEOUT: Duration = Duration::from_secs(30);
/// Dotazů za minutu (vlastní limit, aby hráč omylem nevyčerpal bezplatnou kvótu).
pub const RATE_PER_MIN: usize = 6;
/// Pojistka: nejvýš tolik dotazů za den (UTC) za běhu aplikace.
pub const DAILY_MAX: u32 = 200;
/// Nejvýš tolik zpráv v jednom dotazu.
pub const MAX_MESSAGES: usize = 6;
pub const MODEL_MAX: usize = 100;
pub const KEY_MIN: usize = 16;
pub const KEY_MAX: usize = 256;

/// Jediní povolení hostitelé (HTTPS, bez portu a přihlašovacích údajů v adrese).
pub const ALLOWED_HOSTS: &[&str] = &["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    Groq,
    Gemini,
    OpenRouter,
}

impl Provider {
    #[cfg(test)]
    pub const ALL: [Provider; 3] = [Provider::Groq, Provider::Gemini, Provider::OpenRouter];

    pub fn parse(s: &str) -> Option<Provider> {
        match s {
            "groq" => Some(Provider::Groq),
            "gemini" => Some(Provider::Gemini),
            "openrouter" => Some(Provider::OpenRouter),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Provider::Groq => "groq",
            Provider::Gemini => "gemini",
            Provider::OpenRouter => "openrouter",
        }
    }

    /// Pevná adresa rozhraní chat completions (nikdy z dat okna).
    pub fn endpoint(self) -> &'static str {
        match self {
            Provider::Groq => "https://api.groq.com/openai/v1/chat/completions",
            Provider::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            Provider::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
        }
    }

    /// Název položky ve Windows Credential Manageru (jeden klíč na poskytovatele).
    pub fn credential(self) -> String {
        format!("cz.arcops.companion/ai/{}", self.id())
    }
}

/// Je adresa povolená? Jen `https://`, hostitel přesně ze seznamu, bez portu, uživatele a hesla.
pub fn endpoint_ok(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains(['@', ':', '\\']) || authority.is_empty() {
        return false;
    }
    ALLOWED_HOSTS.contains(&authority)
}

/// Id modelu: 1–100 znaků z `[A-Za-z0-9._:/-]`.
pub fn model_ok(m: &str) -> bool {
    !m.is_empty() && m.len() <= MODEL_MAX && m.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b':' | b'/' | b'-'))
}

/// Klíč: 16–256 viditelných znaků ASCII bez mezer a uvozovek (klíče všech tří poskytovatelů tak vypadají).
pub fn key_ok(k: &str) -> bool {
    (KEY_MIN..=KEY_MAX).contains(&k.len()) && k.bytes().all(|c| c.is_ascii_graphic() && !matches!(c, b'"' | b'\'' | b'\\' | b'`'))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Msg {
    pub role: String,
    pub content: String,
}

/// Odpověď do okna: jen text a dnešní počet dotazů v Rustu.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiReply {
    pub text: String,
    pub today: u32,
    /// 0.32.0: první odpověď byla prázdná a dotaz se jednou zopakoval bez reasoning_effort
    pub retried: bool,
}

/// Chyby jako pevné kódy (okno je přeloží); text od poskytovatele se nikdy nepředává.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AiErr {
    Window,
    Input,
    TooBig,
    NoKey,
    BadKey,
    Quota,
    Offline,
    Timeout,
    Server,
    Request,
    Model,
    Reply,
    Empty,
    Busy,
    Rate,
    Daily,
    Game,
    KeyStore,
}

impl AiErr {
    pub fn code(self) -> &'static str {
        match self {
            AiErr::Window => "ai:window",
            AiErr::Input => "ai:input",
            AiErr::TooBig => "ai:tooBig",
            AiErr::NoKey => "ai:noKey",
            AiErr::BadKey => "ai:badKey",
            AiErr::Quota => "ai:quota",
            AiErr::Offline => "ai:offline",
            AiErr::Timeout => "ai:timeout",
            AiErr::Server => "ai:server",
            AiErr::Request => "ai:request",
            AiErr::Model => "ai:model",
            AiErr::Reply => "ai:reply",
            AiErr::Empty => "ai:empty",
            AiErr::Busy => "ai:busy",
            AiErr::Rate => "ai:rate",
            AiErr::Daily => "ai:daily",
            AiErr::Game => "ai:game",
            AiErr::KeyStore => "ai:keyStore",
        }
    }
}

/// Jen hlavní okno (štítek volajícího okna z Rustu, nikdy hodnota z dat).
pub fn main_label(label: &str) -> Result<(), AiErr> {
    if label == crate::bus::MAIN { Ok(()) } else { Err(AiErr::Window) }
}

/// Zprávy z okna: 2–MAX_MESSAGES zpráv, první je pokyn (system), role jen system / user / assistant, bez NUL,
/// obsah dohromady nejvýš MAX_REQUEST bajtů a poslední zpráva je otázka hráče (user).
pub fn messages_ok(msgs: &[Msg]) -> Result<(), AiErr> {
    if msgs.len() < 2 || msgs.len() > MAX_MESSAGES {
        return Err(AiErr::Input);
    }
    if msgs[0].role != "system" || msgs[msgs.len() - 1].role != "user" {
        return Err(AiErr::Input);
    }
    let mut total = 0usize;
    for m in msgs {
        if !matches!(m.role.as_str(), "system" | "user" | "assistant") || m.content.contains('\0') || m.content.trim().is_empty() {
            return Err(AiErr::Input);
        }
        total += m.content.len();
    }
    if total > MAX_REQUEST {
        return Err(AiErr::TooBig);
    }
    Ok(())
}

/// Posílá se modelu `reasoning_effort`? Pevně podle poskytovatele a modelu (nikdy z okna).
pub fn reasoning_for(p: Provider, model: &str) -> bool {
    match p {
        Provider::Groq => model.starts_with("openai/gpt-oss"),
        Provider::Gemini => model.starts_with("gemini-3") || model.starts_with("gemini-4"),
        Provider::OpenRouter => false,
    }
}

/// Tělo dotazu. Parametry navíc jsou pevné podle poskytovatele a modelu (nikdy z okna): u modelů s uvažováním
/// nízká úroveň, aby se do MAX_TOKENS vešla odpověď.
pub fn request_body(p: Provider, model: &str, msgs: &[Msg]) -> Vec<u8> {
    request_body_opts(model, msgs, reasoning_for(p, model))
}

/// 0.32.0: tělo dotazu s `reasoning_effort` nebo bez něj (opakování po prázdné odpovědi). Meze jsou stejné.
pub fn request_body_opts(model: &str, msgs: &[Msg], reasoning: bool) -> Vec<u8> {
    let mut body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "max_tokens": MAX_TOKENS,
        "temperature": 0.3,
        "stream": false,
    });
    if reasoning {
        body["reasoning_effort"] = serde_json::json!("low");
    }
    serde_json::to_vec(&body).unwrap_or_default()
}

/// 0.32.0: opakování po prázdné odpovědi musí skončit v rámci celkového TIMEOUT (okno čeká 35 s). Vrací čas, který
/// na opakování zbývá, nebo None, když je ho méně než RETRY_MIN_LEFT.
pub const RETRY_MIN_LEFT: Duration = Duration::from_secs(8);
pub fn retry_budget(elapsed: Duration) -> Option<Duration> {
    TIMEOUT.checked_sub(elapsed).filter(|left| *left >= RETRY_MIN_LEFT)
}

/// 0.32.0: je chybová odpověď „model nenalezen“? (Groq: 404 model_not_found, OpenRouter: 400 „is not a valid model
/// ID“, jiní 404/422 s textem o neexistujícím modelu.) Text chyby se jen přečte, nikdy nepředá do okna.
pub fn model_missing(status: u16, body: &[u8]) -> bool {
    if !matches!(status, 400 | 404 | 422) {
        return false;
    }
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(body) else { return false };
    /* Gemini někdy vrací pole s jedním objektem chyby */
    let v = v.as_array().and_then(|a| a.first()).cloned().unwrap_or(v);
    let e = v.get("error").unwrap_or(&v);
    let code = e.get("code").and_then(|c| c.as_str()).unwrap_or("").to_ascii_lowercase();
    if matches!(code.as_str(), "model_not_found" | "model_not_available" | "invalid_model") {
        return true;
    }
    let msg: String = e.get("message").and_then(|m| m.as_str()).unwrap_or("").chars().take(500).collect::<String>().to_ascii_lowercase();
    msg.contains("model")
        && ["not found", "does not exist", "not a valid model", "decommissioned", "no endpoints found", "is not supported", "unknown model"]
            .iter()
            .any(|p| msg.contains(p))
}

/// Stav HTTP → kód chyby (2xx řeší parse_reply).
pub fn map_status(status: u16) -> AiErr {
    match status {
        401 | 403 => AiErr::BadKey,
        429 => AiErr::Quota,
        404 => AiErr::Model,
        413 => AiErr::TooBig,
        400 | 422 => AiErr::Request,
        _ => AiErr::Server,
    }
}

/// Bloky uvažování, které některé modely vrací přímo v textu (`<think>…</think>`), se vynechají.
fn strip_think(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("<think>") {
        out.push_str(&rest[..i]);
        match rest[i..].find("</think>") {
            Some(j) => rest = &rest[i + j + "</think>".len()..],
            None => {
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Text odpovědi pro okno: bez řídicích znaků (kromě konce řádku), oříznutý a nejvýš MAX_ANSWER znaků.
pub fn clean_answer(s: &str) -> String {
    let s = strip_think(s);
    let cleaned: String = s
        .chars()
        .map(|c| if c == '\n' { '\n' } else if c.is_control() || matches!(c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}') { ' ' } else { c })
        .collect();
    cleaned.trim().chars().take(MAX_ANSWER).collect::<String>().trim_end().to_string()
}

/// Odpověď poskytovatele → text. Čte se jen choices[0].message.content; všechno ostatní se zahodí.
pub fn parse_reply(status: u16, body: &[u8]) -> Result<String, AiErr> {
    if !(200..300).contains(&status) {
        return Err(if model_missing(status, body) { AiErr::Model } else { map_status(status) });
    }
    let v: serde_json::Value = serde_json::from_slice(body).map_err(|_| AiErr::Reply)?;
    let content = v.pointer("/choices/0/message/content").ok_or(AiErr::Reply)?;
    let text = match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        _ => return Err(AiErr::Reply),
    };
    let text = clean_answer(&text);
    if text.is_empty() { Err(AiErr::Empty) } else { Ok(text) }
}

/* ----- síť ----- */

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetErr {
    Timeout,
    Offline,
    TooBig,
}

/// Odeslání dotazu. Vrací stav HTTP a nejvýš MAX_RESPONSE bajtů těla.
pub trait Transport: Send + Sync {
    fn post(&self, url: &str, key: &str, body: &[u8]) -> Result<(u16, Vec<u8>), NetErr>;
    /// 0.32.0: totéž s kratším časovým limitem (opakování po prázdné odpovědi ve zbytku TIMEOUT).
    fn post_within(&self, url: &str, key: &str, body: &[u8], _limit: Duration) -> Result<(u16, Vec<u8>), NetErr> {
        self.post(url, key, body)
    }
}

/// Skutečná síť: ureq s rustls (bez OpenSSL a native-tls), bez přesměrování, s časovým limitem a mezí čtení.
pub struct UreqTransport {
    pub timeout: Duration,
    pub max_read: usize,
    pub https_only: bool,
}

impl UreqTransport {
    pub fn production() -> Self {
        UreqTransport { timeout: TIMEOUT, max_read: MAX_RESPONSE, https_only: true }
    }
}

impl Transport for UreqTransport {
    fn post(&self, url: &str, key: &str, body: &[u8]) -> Result<(u16, Vec<u8>), NetErr> {
        self.post_within(url, key, body, self.timeout)
    }

    fn post_within(&self, url: &str, key: &str, body: &[u8], limit: Duration) -> Result<(u16, Vec<u8>), NetErr> {
        /* nikdy déle než self.timeout */
        let timeout = limit.min(self.timeout);
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .max_redirects(0)
            .https_only(self.https_only)
            .user_agent("arc-raiders-companion")
            .build()
            .into();
        let res = agent
            .post(url)
            .header("Authorization", &format!("Bearer {key}"))
            .header("Content-Type", "application/json")
            .send(body);
        let mut res = match res {
            Ok(r) => r,
            Err(ureq::Error::Timeout(_)) => return Err(NetErr::Timeout),
            Err(_) => return Err(NetErr::Offline),
        };
        let status = res.status().as_u16();
        match res.body_mut().with_config().limit(self.max_read as u64).read_to_vec() {
            Ok(b) => Ok((status, b)),
            Err(ureq::Error::BodyExceedsLimit(_)) => Err(NetErr::TooBig),
            Err(ureq::Error::Timeout(_)) => Err(NetErr::Timeout),
            Err(_) => Err(NetErr::Offline),
        }
    }
}

/* ----- klíče ----- */

/// Úložiště klíčů. `get` je jen pro Rust (dotaz); do okna jde nejvýš `has` (ano / ne).
pub trait KeyStore: Send + Sync {
    fn set(&self, p: Provider, key: &str) -> Result<(), AiErr>;
    fn get(&self, p: Provider) -> Result<Option<String>, AiErr>;
    fn clear(&self, p: Provider) -> Result<(), AiErr>;
    fn has(&self, p: Provider) -> bool {
        matches!(self.get(p), Ok(Some(_)))
    }
}

/// Klíče v paměti (testy a jiné systémy než Windows; nic se nikam neukládá).
#[cfg_attr(windows, allow(dead_code))]
#[derive(Default)]
pub struct MemKeys(Mutex<std::collections::HashMap<&'static str, String>>);

impl KeyStore for MemKeys {
    fn set(&self, p: Provider, key: &str) -> Result<(), AiErr> {
        self.0.lock().map_err(|_| AiErr::KeyStore)?.insert(p.id(), key.to_string());
        Ok(())
    }
    fn get(&self, p: Provider) -> Result<Option<String>, AiErr> {
        Ok(self.0.lock().map_err(|_| AiErr::KeyStore)?.get(p.id()).cloned())
    }
    fn clear(&self, p: Provider) -> Result<(), AiErr> {
        self.0.lock().map_err(|_| AiErr::KeyStore)?.remove(p.id());
        Ok(())
    }
}

/// Windows Credential Manager (obecné pověření, jen pro tohoto uživatele a tento počítač).
#[cfg(windows)]
pub struct CredKeys;

#[cfg(windows)]
mod cred {
    use super::{AiErr, Provider};
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND, FILETIME};
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn write(p: Provider, key: &str) -> Result<(), AiErr> {
        let mut target = wide(&p.credential());
        let mut user = wide("api-key");
        let mut blob = key.as_bytes().to_vec();
        let cred = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            Comment: std::ptr::null_mut(),
            LastWritten: FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: user.as_mut_ptr(),
        };
        // SAFETY: všechny ukazatele míří do živých bufferů výše po dobu volání; Windows data jen kopíruje.
        let ok = unsafe { CredWriteW(&cred, 0) };
        blob.fill(0);
        if ok != 0 { Ok(()) } else { Err(AiErr::KeyStore) }
    }

    pub fn read(p: Provider) -> Result<Option<String>, AiErr> {
        let target = wide(&p.credential());
        let mut out: *mut CREDENTIALW = std::ptr::null_mut();
        // SAFETY: target je ukončený nulou; out vyplní Windows a uvolní se přes CredFree.
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut out) };
        if ok == 0 {
            // SAFETY: jen čtení kódu poslední chyby vlákna.
            let err = unsafe { GetLastError() };
            return if err == ERROR_NOT_FOUND { Ok(None) } else { Err(AiErr::KeyStore) };
        }
        // SAFETY: při úspěchu out ukazuje na platné CREDENTIALW, blob má CredentialBlobSize bajtů.
        let key = unsafe {
            let c = &*out;
            let bytes = if c.CredentialBlob.is_null() { &[][..] } else { std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize) };
            let s = String::from_utf8(bytes.to_vec()).ok();
            CredFree(out as *const core::ffi::c_void);
            s
        };
        Ok(key.filter(|k| super::key_ok(k)))
    }

    pub fn delete(p: Provider) -> Result<(), AiErr> {
        let target = wide(&p.credential());
        // SAFETY: target je ukončený nulou.
        let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok != 0 {
            return Ok(());
        }
        // SAFETY: jen čtení kódu poslední chyby vlákna.
        if unsafe { GetLastError() } == ERROR_NOT_FOUND { Ok(()) } else { Err(AiErr::KeyStore) }
    }
}

#[cfg(windows)]
impl KeyStore for CredKeys {
    fn set(&self, p: Provider, key: &str) -> Result<(), AiErr> {
        cred::write(p, key)
    }
    fn get(&self, p: Provider) -> Result<Option<String>, AiErr> {
        cred::read(p)
    }
    fn clear(&self, p: Provider) -> Result<(), AiErr> {
        cred::delete(p)
    }
}

/* ----- limity ----- */

/// Nejvýš RATE_PER_MIN dotazů za posledních 60 s a DAILY_MAX za den.
#[derive(Default)]
pub struct Limiter {
    recent: VecDeque<Instant>,
    day: u64,
    today: u32,
}

impl Limiter {
    pub fn admit(&mut self, now: Instant, day: u64) -> Result<u32, AiErr> {
        while self.recent.front().is_some_and(|t| now.duration_since(*t) >= Duration::from_secs(60)) {
            self.recent.pop_front();
        }
        if self.day != day {
            self.day = day;
            self.today = 0;
        }
        if self.recent.len() >= RATE_PER_MIN {
            return Err(AiErr::Rate);
        }
        if self.today >= DAILY_MAX {
            return Err(AiErr::Daily);
        }
        self.recent.push_back(now);
        self.today += 1;
        Ok(self.today)
    }
}

/// Nejvýš jeden dotaz současně: zámek se uvolní při konci dotazu (i při chybě).
struct BusyGuard<'a>(&'a AtomicBool);

impl<'a> BusyGuard<'a> {
    fn take(flag: &'a AtomicBool) -> Option<Self> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| BusyGuard(flag))
    }
}

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub struct Ai {
    pub transport: Box<dyn Transport>,
    pub keys: Box<dyn KeyStore>,
    busy: AtomicBool,
    limiter: Mutex<Limiter>,
}

impl Ai {
    pub fn new(transport: Box<dyn Transport>, keys: Box<dyn KeyStore>) -> Self {
        Ai { transport, keys, busy: AtomicBool::new(false), limiter: Mutex::new(Limiter::default()) }
    }

    pub fn production() -> Self {
        #[cfg(windows)]
        let keys: Box<dyn KeyStore> = Box::new(CredKeys);
        #[cfg(not(windows))]
        let keys: Box<dyn KeyStore> = Box::new(MemKeys::default());
        Ai::new(Box::new(UreqTransport::production()), keys)
    }
}

pub struct AiState(pub Arc<Ai>);

/// Den podle UTC (pojistka počtu dotazů; počítadlo pro hráče vede aplikace podle místního dne).
pub fn day_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0)
}

/// Jádro příkazu ai_ask. `label` je štítek volajícího okna z Rustu, `game_front` = hra je v popředí.
/// Pořadí: okno → vstup → hra v popředí → klíč → jeden dotaz současně → limity → síť.
pub fn ask_for(label: &str, ai: &Ai, provider: &str, model: &str, msgs: &[Msg], game_front: bool, now: Instant, day: u64) -> Result<AiReply, AiErr> {
    main_label(label)?;
    let p = Provider::parse(provider).ok_or(AiErr::Input)?;
    if !model_ok(model) {
        return Err(AiErr::Input);
    }
    messages_ok(msgs)?;
    if game_front {
        return Err(AiErr::Game);
    }
    let url = p.endpoint();
    if !endpoint_ok(url) {
        return Err(AiErr::Input);
    }
    let mut key = ai.keys.get(p)?.ok_or(AiErr::NoKey)?;
    let _busy = BusyGuard::take(&ai.busy).ok_or(AiErr::Busy)?;
    let today = ai.limiter.lock().map_err(|_| AiErr::Busy)?.admit(now, day)?;
    let body = request_body(p, model, msgs);
    let started = Instant::now();
    let first = reply_of(ai.transport.post(url, &key, &body));
    /* 0.32.0: prázdná odpověď modelu s uvažováním (vyčerpal limit tokenů přemýšlením): jednou znovu bez
       reasoning_effort, jen ve zbytku celkového TIMEOUT a jen když to dovolí limity (počítá se jako další dotaz). */
    let out = match first {
        Err(AiErr::Empty) if reasoning_for(p, model) => match retry_budget(started.elapsed()) {
            Some(limit) => match ai.limiter.lock().map_err(|_| AiErr::Busy).and_then(|mut l| l.admit(now, day)) {
                Ok(today2) => reply_of(ai.transport.post_within(url, &key, &request_body_opts(model, msgs, false), limit))
                    .map(|text| AiReply { text, today: today2, retried: true }),
                Err(_) => Err(AiErr::Empty),
            },
            None => Err(AiErr::Empty),
        },
        r => r.map(|text| AiReply { text, today, retried: false }),
    };
    wipe(&mut key);
    out
}

/// Výsledek sítě → text odpovědi nebo kód chyby.
fn reply_of(res: Result<(u16, Vec<u8>), NetErr>) -> Result<String, AiErr> {
    match res {
        Ok((status, bytes)) => parse_reply(status, &bytes),
        Err(NetErr::Timeout) => Err(AiErr::Timeout),
        Err(NetErr::Offline) => Err(AiErr::Offline),
        Err(NetErr::TooBig) => Err(AiErr::Reply),
    }
}

/// Přepíše klíč v paměti nulami (nejlepší snaha; String se pak zahodí).
fn wipe(s: &mut String) {
    let mut v = std::mem::take(s).into_bytes();
    v.fill(0);
}

pub fn key_set_for(label: &str, ai: &Ai, provider: &str, key: &str) -> Result<(), AiErr> {
    main_label(label)?;
    let p = Provider::parse(provider).ok_or(AiErr::Input)?;
    let k = key.trim();
    if !key_ok(k) {
        return Err(AiErr::Input);
    }
    ai.keys.set(p, k)
}

pub fn key_clear_for(label: &str, ai: &Ai, provider: &str) -> Result<(), AiErr> {
    main_label(label)?;
    let p = Provider::parse(provider).ok_or(AiErr::Input)?;
    ai.keys.clear(p)
}

/// Je klíč uložený? Jen ano / ne, nikdy klíč.
pub fn key_status_for(label: &str, ai: &Ai, provider: &str) -> Result<bool, AiErr> {
    main_label(label)?;
    let p = Provider::parse(provider).ok_or(AiErr::Input)?;
    Ok(ai.keys.has(p))
}

fn logged<T>(ctx: &str, r: Result<T, AiErr>) -> Result<T, String> {
    r.map_err(|e| {
        /* do deníku jen kód chyby */
        crate::diag::rust(crate::diag::Level::Warn, ctx, e.code());
        e.code().to_string()
    })
}

/// Dotaz na model (jen hlavní okno). Běží mimo vlákno UI; vrací text odpovědi nebo kód chyby `ai:<kód>`.
#[tauri::command]
pub async fn ai_ask<R: Runtime>(window: WebviewWindow<R>, st: State<'_, AiState>, provider: String, model: String, messages: Vec<Msg>) -> Result<AiReply, String> {
    crate::bus::only(&window, &[crate::bus::MAIN]).map_err(|_| AiErr::Window.code().to_string())?;
    let label = window.label().to_string();
    let ai = st.0.clone();
    let game_front = crate::ops::game_in_front();
    let day = day_now();
    let r = tauri::async_runtime::spawn_blocking(move || ask_for(&label, &ai, &provider, &model, &messages, game_front, Instant::now(), day))
        .await
        .unwrap_or(Err(AiErr::Server));
    logged("ai ask", r)
}

/// Uloží klíč poskytovatele do Windows Credential Manageru (jen hlavní okno). Klíč se nikam jinam nezapíše.
#[tauri::command]
pub async fn ai_key_set<R: Runtime>(window: WebviewWindow<R>, st: State<'_, AiState>, provider: String, key: String) -> Result<(), String> {
    crate::bus::only(&window, &[crate::bus::MAIN]).map_err(|_| AiErr::Window.code().to_string())?;
    let mut key = key;
    let r = key_set_for(window.label(), &st.0, &provider, &key);
    wipe(&mut key);
    logged("ai key", r)
}

/// Smaže klíč poskytovatele (jen hlavní okno).
#[tauri::command]
pub async fn ai_key_clear<R: Runtime>(window: WebviewWindow<R>, st: State<'_, AiState>, provider: String) -> Result<(), String> {
    crate::bus::only(&window, &[crate::bus::MAIN]).map_err(|_| AiErr::Window.code().to_string())?;
    logged("ai key", key_clear_for(window.label(), &st.0, &provider))
}

/// Je klíč poskytovatele uložený? Vrací jen true / false (jen hlavní okno).
#[tauri::command]
pub async fn ai_key_status<R: Runtime>(window: WebviewWindow<R>, st: State<'_, AiState>, provider: String) -> Result<bool, String> {
    crate::bus::only(&window, &[crate::bus::MAIN]).map_err(|_| AiErr::Window.code().to_string())?;
    logged("ai key", key_status_for(window.label(), &st.0, &provider))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::AtomicUsize;

    const KEY: &str = "gsk_FAKE_TEST_KEY_not_real_0123";

    /// Zkušební síť: vrací pevnou odpověď a pamatuje si, co dostala.
    struct Fake {
        reply: Result<(u16, Vec<u8>), NetErr>,
        calls: AtomicUsize,
        seen: Mutex<Vec<(String, String, Vec<u8>)>>,
        delay: Duration,
        /// 0.32.0: odpovědi postupně (první dotaz první prvek); po vyčerpání `reply`
        queue: Mutex<VecDeque<Result<(u16, Vec<u8>), NetErr>>>,
        limits: Mutex<Vec<Option<Duration>>>,
    }
    fn content(text: Option<&str>) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"choices":[{"message":{"role":"assistant","content":text}}]})).unwrap()
    }
    impl Fake {
        fn ok(text: &str) -> Self {
            Fake::raw(Ok((200, content(Some(text)))))
        }
        fn raw(reply: Result<(u16, Vec<u8>), NetErr>) -> Self {
            Fake { reply, calls: AtomicUsize::new(0), seen: Mutex::new(vec![]), delay: Duration::ZERO, queue: Mutex::new(VecDeque::new()), limits: Mutex::new(vec![]) }
        }
        fn seq(replies: Vec<Result<(u16, Vec<u8>), NetErr>>, then: Result<(u16, Vec<u8>), NetErr>) -> Self {
            let f = Fake::raw(then);
            *f.queue.lock().unwrap() = replies.into();
            f
        }
        fn bodies(&self) -> Vec<serde_json::Value> {
            self.seen.lock().unwrap().iter().map(|(_, _, b)| serde_json::from_slice(b).unwrap()).collect()
        }
        fn answer(&self, url: &str, key: &str, body: &[u8], limit: Option<Duration>) -> Result<(u16, Vec<u8>), NetErr> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.seen.lock().unwrap().push((url.to_string(), key.to_string(), body.to_vec()));
            self.limits.lock().unwrap().push(limit);
            if !self.delay.is_zero() {
                std::thread::sleep(self.delay);
            }
            self.queue.lock().unwrap().pop_front().unwrap_or_else(|| self.reply.clone())
        }
    }
    impl Transport for Fake {
        fn post(&self, url: &str, key: &str, body: &[u8]) -> Result<(u16, Vec<u8>), NetErr> {
            self.answer(url, key, body, None)
        }
        fn post_within(&self, url: &str, key: &str, body: &[u8], limit: Duration) -> Result<(u16, Vec<u8>), NetErr> {
            self.answer(url, key, body, Some(limit))
        }
    }
    impl Transport for Arc<Fake> {
        fn post(&self, url: &str, key: &str, body: &[u8]) -> Result<(u16, Vec<u8>), NetErr> {
            (**self).post(url, key, body)
        }
        fn post_within(&self, url: &str, key: &str, body: &[u8], limit: Duration) -> Result<(u16, Vec<u8>), NetErr> {
            (**self).post_within(url, key, body, limit)
        }
    }

    fn msgs() -> Vec<Msg> {
        vec![Msg { role: "system".into(), content: "Jsi Ops.".into() }, Msg { role: "user".into(), content: "Proč si nechat Wires?".into() }]
    }
    fn ai_with(fake: Arc<Fake>, key: bool) -> Ai {
        let keys = MemKeys::default();
        if key {
            keys.set(Provider::Groq, KEY).unwrap();
        }
        Ai::new(Box::new(fake), Box::new(keys))
    }
    fn ask(ai: &Ai) -> Result<AiReply, AiErr> {
        ask_for("main", ai, "groq", "openai/gpt-oss-120b", &msgs(), false, Instant::now(), 1)
    }

    #[test]
    fn jen_povoleni_hostitele_a_jen_https() {
        for p in Provider::ALL {
            assert!(endpoint_ok(p.endpoint()), "{}", p.endpoint());
            assert!(p.endpoint().starts_with("https://"));
        }
        assert_eq!(ALLOWED_HOSTS.len(), 3);
        for bad in [
            "http://api.groq.com/openai/v1/chat/completions",
            "https://api.groq.com.evil.com/x",
            "https://evil.com/api.groq.com",
            "https://api.groq.com:8443/x",
            "https://user@api.groq.com/x",
            "https://user:pw@openrouter.ai/x",
            "https://API.GROQ.COM/x",
            "ftp://openrouter.ai/x",
            "https:///x",
            "https://",
            "https://127.0.0.1/x",
            "https://localhost/x",
            "openrouter.ai/api",
        ] {
            assert!(!endpoint_ok(bad), "{bad}");
        }
        assert!(endpoint_ok("https://openrouter.ai"));
        assert!(endpoint_ok("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?x=1"));
    }

    #[test]
    fn poskytovatele_jen_z_pevneho_seznamu() {
        assert_eq!(Provider::parse("groq"), Some(Provider::Groq));
        assert_eq!(Provider::parse("gemini"), Some(Provider::Gemini));
        assert_eq!(Provider::parse("openrouter"), Some(Provider::OpenRouter));
        for bad in ["", "Groq", "openai", "https://api.groq.com", "groq "] {
            assert_eq!(Provider::parse(bad), None, "{bad}");
        }
        let ai = ai_with(Arc::new(Fake::ok("x")), true);
        assert_eq!(ask_for("main", &ai, "openai", "m", &msgs(), false, Instant::now(), 1), Err(AiErr::Input));
    }

    #[test]
    fn model_a_klic_maji_meze() {
        for ok in ["openai/gpt-oss-120b", "gemini-3.5-flash-lite", "openrouter/free", "meta-llama/llama-3.3-70b-instruct:free", "a"] {
            assert!(model_ok(ok), "{ok}");
        }
        for bad in ["", "a b", "m\"", "m?x", "m#", "ž", "m
", &"x".repeat(101)] {
            assert!(!model_ok(bad), "{bad}");
        }
        assert!(model_ok(&"x".repeat(100)));
        assert!(key_ok(KEY));
        for bad in ["short", "with space 0123456789abcdef", "quote\"0123456789abcdef", &"k".repeat(257), "ključ0123456789abcdef"] {
            assert!(!key_ok(bad), "{bad}");
        }
    }

    #[test]
    fn model_jde_jen_do_tela_dotazu() {
        let fake = Arc::new(Fake::ok("Ahoj."));
        let ai = ai_with(fake.clone(), true);
        ask_for("main", &ai, "groq", "evil/../x", &msgs(), false, Instant::now(), 1).unwrap();
        let seen = fake.seen.lock().unwrap();
        assert_eq!(seen[0].0, Provider::Groq.endpoint());
    }

    #[test]
    fn jen_hlavni_okno() {
        let fake = Arc::new(Fake::ok("Ahoj."));
        let ai = ai_with(fake.clone(), true);
        for label in ["buddy", "overlay", "widgets", "", "Main", "evil"] {
            assert_eq!(ask_for(label, &ai, "groq", "m", &msgs(), false, Instant::now(), 1), Err(AiErr::Window), "{label}");
            assert_eq!(key_set_for(label, &ai, "groq", KEY), Err(AiErr::Window));
            assert_eq!(key_clear_for(label, &ai, "groq"), Err(AiErr::Window));
            assert_eq!(key_status_for(label, &ai, "groq"), Err(AiErr::Window));
        }
        assert_eq!(fake.calls.load(Ordering::SeqCst), 0);
        assert!(key_status_for("main", &ai, "groq").unwrap());
    }

    #[test]
    fn klic_se_nikdy_nevraci() {
        let ai = ai_with(Arc::new(Fake::ok("x")), false);
        assert_eq!(key_status_for("main", &ai, "groq"), Ok(false));
        key_set_for("main", &ai, "groq", &format!("  {KEY}\n")).unwrap();
        let st: Result<bool, AiErr> = key_status_for("main", &ai, "groq");
        assert_eq!(st, Ok(true));
        /* stav klíče se serializuje jen jako true / false */
        assert_eq!(serde_json::to_string(&st.unwrap()).unwrap(), "true");
        assert_eq!(key_status_for("main", &ai, "gemini"), Ok(false));
        /* odpověď dotazu nese jen text, počet a (0.32.0) příznak opakování */
        let fake = Arc::new(Fake::ok("Ahoj."));
        let ai2 = ai_with(fake, true);
        let r = ask(&ai2).unwrap();
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains(KEY));
        assert_eq!(json, r#"{"text":"Ahoj.","today":1,"retried":false}"#);
        /* chybové kódy nikdy nenesou klíč */
        for e in [AiErr::BadKey, AiErr::NoKey, AiErr::KeyStore, AiErr::Input] {
            assert!(e.code().starts_with("ai:") && !e.code().contains("gsk"));
        }
        key_clear_for("main", &ai, "groq").unwrap();
        assert_eq!(key_status_for("main", &ai, "groq"), Ok(false));
        assert_eq!(key_set_for("main", &ai, "groq", "short"), Err(AiErr::Input));
    }

    #[test]
    fn bez_klice_ani_s_hrou_v_popredi_se_nic_neposle() {
        let fake = Arc::new(Fake::ok("Ahoj."));
        let ai = ai_with(fake.clone(), false);
        assert_eq!(ask(&ai), Err(AiErr::NoKey));
        let ai = ai_with(fake.clone(), true);
        assert_eq!(ask_for("main", &ai, "groq", "m", &msgs(), true, Instant::now(), 1), Err(AiErr::Game));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 0);
        /* klíč jde jen do hlavičky přes transport, ne do těla */
        ask(&ai).unwrap();
        let seen = fake.seen.lock().unwrap();
        assert_eq!(seen[0].1, KEY);
        assert!(!String::from_utf8_lossy(&seen[0].2).contains(KEY));
    }

    #[test]
    fn meze_velikosti_dotazu() {
        let ai = ai_with(Arc::new(Fake::ok("x")), true);
        let big = vec![Msg { role: "system".into(), content: "s".into() }, Msg { role: "user".into(), content: "x".repeat(MAX_REQUEST) }];
        assert_eq!(ask_for("main", &ai, "groq", "m", &big, false, Instant::now(), 1), Err(AiErr::TooBig));
        let ok = vec![Msg { role: "system".into(), content: "s".into() }, Msg { role: "user".into(), content: "x".repeat(MAX_REQUEST - 1) }];
        assert!(messages_ok(&ok).is_ok());
        assert_eq!(messages_ok(&msgs()[..1]), Err(AiErr::Input));
        let mut many = msgs();
        for _ in 0..MAX_MESSAGES {
            many.insert(1, Msg { role: "user".into(), content: "a".into() });
        }
        assert_eq!(messages_ok(&many), Err(AiErr::Input));
        let bad_role = vec![Msg { role: "system".into(), content: "s".into() }, Msg { role: "tool".into(), content: "x".into() }];
        assert_eq!(messages_ok(&bad_role), Err(AiErr::Input));
        let not_system = vec![Msg { role: "user".into(), content: "s".into() }, Msg { role: "user".into(), content: "x".into() }];
        assert_eq!(messages_ok(&not_system), Err(AiErr::Input));
        let nul = vec![Msg { role: "system".into(), content: "s".into() }, Msg { role: "user".into(), content: "a\0b".into() }];
        assert_eq!(messages_ok(&nul), Err(AiErr::Input));
        /* tělo dotazu má pevné meze odpovědi a žádné nástroje */
        let body: serde_json::Value = serde_json::from_slice(&request_body(Provider::Groq, "openai/gpt-oss-120b", &msgs())).unwrap();
        assert_eq!(body["max_tokens"], MAX_TOKENS);
        assert_eq!(body["stream"], false);
        assert_eq!(body["reasoning_effort"], "low");
        assert!(body.get("tools").is_none());
        let body: serde_json::Value = serde_json::from_slice(&request_body(Provider::OpenRouter, "openrouter/free", &msgs())).unwrap();
        assert!(body.get("reasoning_effort").is_none());
        assert!((500..=700).contains(&MAX_TOKENS));
        assert_eq!(TIMEOUT, Duration::from_secs(30));
        assert_eq!(MAX_RESPONSE, 64 * 1024);
    }

    #[test]
    fn mapovani_chyb() {
        let cases: [(u16, AiErr); 8] = [
            (401, AiErr::BadKey),
            (403, AiErr::BadKey),
            (429, AiErr::Quota),
            (404, AiErr::Model),
            (400, AiErr::Request),
            (500, AiErr::Server),
            (502, AiErr::Server),
            (503, AiErr::Server),
        ];
        for (status, want) in cases {
            let ai = ai_with(Arc::new(Fake::raw(Ok((status, br#"{"error":{"message":"Invalid API Key gsk_abc"}}"#.to_vec())))), true);
            assert_eq!(ask(&ai), Err(want), "{status}");
        }
        for (net, want) in [(NetErr::Timeout, AiErr::Timeout), (NetErr::Offline, AiErr::Offline), (NetErr::TooBig, AiErr::Reply)] {
            let ai = ai_with(Arc::new(Fake::raw(Err(net))), true);
            assert_eq!(ask(&ai), Err(want));
        }
        assert_eq!(parse_reply(200, b"not json"), Err(AiErr::Reply));
        assert_eq!(parse_reply(200, br#"{"choices":[]}"#), Err(AiErr::Reply));
        assert_eq!(parse_reply(200, br#"{"choices":[{"message":{"content":null}}]}"#), Err(AiErr::Empty));
        assert_eq!(parse_reply(200, br#"{"choices":[{"message":{"content":"  <think>x</think>  "}}]}"#), Err(AiErr::Empty));
        assert_eq!(parse_reply(200, br#"{"choices":[{"message":{"content":{"a":1}}}]}"#), Err(AiErr::Reply));
    }

    #[test]
    fn text_odpovedi_je_cisty_a_omezeny() {
        assert_eq!(clean_answer("<think>plan</think>Nech si je.\u{0007}\r\nKvůli Gear Benchi."), "Nech si je.  \nKvůli Gear Benchi.");
        assert_eq!(clean_answer("a\u{202e}b\u{200b}c"), "a b c");
        let long = "é".repeat(MAX_ANSWER + 50);
        assert_eq!(clean_answer(&long).chars().count(), MAX_ANSWER);
    }

    #[test]
    fn limit_za_minutu_a_za_den() {
        let mut l = Limiter::default();
        let t0 = Instant::now();
        for i in 0..RATE_PER_MIN {
            assert_eq!(l.admit(t0 + Duration::from_secs(i as u64), 5), Ok(i as u32 + 1));
        }
        assert_eq!(l.admit(t0 + Duration::from_secs(10), 5), Err(AiErr::Rate));
        /* po minutě od prvního dotazu jde zase jeden */
        assert_eq!(l.admit(t0 + Duration::from_secs(60), 5), Ok(RATE_PER_MIN as u32 + 1));
        /* nový den: počítadlo od nuly */
        assert_eq!(l.admit(t0 + Duration::from_secs(200), 6), Ok(1));
        let mut d = Limiter::default();
        let mut t = t0;
        for _ in 0..DAILY_MAX {
            t += Duration::from_secs(11);
            d.admit(t, 9).unwrap();
        }
        assert_eq!(d.admit(t + Duration::from_secs(61), 9), Err(AiErr::Daily));
        /* limit se uplatní i přes ask_for (bez sítě) */
        let fake = Arc::new(Fake::ok("Ahoj."));
        let ai = ai_with(fake.clone(), true);
        let now = Instant::now();
        for _ in 0..RATE_PER_MIN {
            ask_for("main", &ai, "groq", "m", &msgs(), false, now, 1).unwrap();
        }
        assert_eq!(ask_for("main", &ai, "groq", "m", &msgs(), false, now, 1), Err(AiErr::Rate));
        assert_eq!(fake.calls.load(Ordering::SeqCst), RATE_PER_MIN);
    }

    #[test]
    fn nejvys_jeden_dotaz_soucasne() {
        let mut f = Fake::ok("Ahoj.");
        f.delay = Duration::from_millis(300);
        let fake = Arc::new(f);
        let ai = Arc::new(ai_with(fake.clone(), true));
        let a2 = ai.clone();
        let h = std::thread::spawn(move || ask(&a2));
        std::thread::sleep(Duration::from_millis(80));
        assert_eq!(ask(&ai), Err(AiErr::Busy));
        assert!(h.join().unwrap().is_ok());
        /* po skončení (i chybou) jde další */
        assert!(ask(&ai).is_ok());
        assert_eq!(fake.calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn prazdna_odpoved_jednou_znovu_bez_reasoning_effort() {
        /* model s uvažováním: prázdná, pak odpověď → jeden opakovaný dotaz bez reasoning_effort, stejné meze */
        let fake = Arc::new(Fake::seq(vec![Ok((200, content(None)))], Ok((200, content(Some("Nech si je."))))));
        let ai = ai_with(fake.clone(), true);
        let r = ask(&ai).unwrap();
        assert_eq!(r, AiReply { text: "Nech si je.".into(), today: 2, retried: true });
        let bodies = fake.bodies();
        assert_eq!(bodies.len(), 2);
        assert_eq!(bodies[0]["reasoning_effort"], "low");
        assert!(bodies[1].get("reasoning_effort").is_none());
        assert_eq!(bodies[1]["max_tokens"], MAX_TOKENS);
        assert_eq!(bodies[1]["messages"], bodies[0]["messages"]);
        /* opakování dostane jen zbytek celkového časového limitu */
        let limits = fake.limits.lock().unwrap().clone();
        assert_eq!(limits[0], None);
        assert!(limits[1].is_some_and(|l| l <= TIMEOUT && l >= RETRY_MIN_LEFT));
        /* ani druhá odpověď: chyba Empty, víc dotazů ne */
        let fake = Arc::new(Fake::raw(Ok((200, content(Some("  <think>dlouhé přemýšlení</think> "))))));
        let ai = ai_with(fake.clone(), true);
        assert_eq!(ask(&ai), Err(AiErr::Empty));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 2);
        /* model bez reasoning_effort (OpenRouter): nic se neopakuje */
        let fake = Arc::new(Fake::raw(Ok((200, content(None)))));
        let keys = MemKeys::default();
        keys.set(Provider::OpenRouter, KEY).unwrap();
        let ai = Ai::new(Box::new(fake.clone()), Box::new(keys));
        assert_eq!(ask_for("main", &ai, "openrouter", "openrouter/free", &msgs(), false, Instant::now(), 1), Err(AiErr::Empty));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 1);
        /* jiná chyba než prázdná odpověď se neopakuje */
        let fake = Arc::new(Fake::seq(vec![Ok((500, b"{}".to_vec()))], Ok((200, content(Some("x"))))));
        let ai = ai_with(fake.clone(), true);
        assert_eq!(ask(&ai), Err(AiErr::Server));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 1);
        /* opakování počítá limit za minutu: poslední volné místo = bez opakování */
        let fake = Arc::new(Fake::raw(Ok((200, content(None)))));
        let ai = ai_with(fake.clone(), true);
        let now = Instant::now();
        for _ in 0..RATE_PER_MIN - 1 {
            ai.limiter.lock().unwrap().admit(now, 1).unwrap();
        }
        assert_eq!(ask_for("main", &ai, "groq", "openai/gpt-oss-120b", &msgs(), false, now, 1), Err(AiErr::Empty));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn opakovani_jen_ve_zbytku_casoveho_limitu() {
        assert_eq!(retry_budget(Duration::ZERO), Some(TIMEOUT));
        assert_eq!(retry_budget(Duration::from_secs(10)), Some(Duration::from_secs(20)));
        assert_eq!(retry_budget(TIMEOUT - RETRY_MIN_LEFT), Some(RETRY_MIN_LEFT));
        assert_eq!(retry_budget(TIMEOUT - RETRY_MIN_LEFT + Duration::from_millis(1)), None);
        assert_eq!(retry_budget(TIMEOUT + Duration::from_secs(5)), None);
        /* celkem nejvýš TIMEOUT: okno čeká 35 s */
        assert!(TIMEOUT < Duration::from_secs(35));
        /* skutečný klient zkrátí limit, nikdy neprodlouží */
        let slow = UreqTransport { timeout: Duration::from_secs(5), max_read: 1024, https_only: false };
        let ok = br#"{"choices":[{"message":{"content":"Ahoj."}}]}"#;
        let t0 = Instant::now();
        assert_eq!(slow.post_within(&serve(http("200 OK", ok), Duration::from_secs(3)), KEY, b"{}", Duration::from_millis(300)), Err(NetErr::Timeout));
        assert!(t0.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn model_nenalezen_podle_tela_chyby() {
        for (status, body) in [
            (404, r#"{"error":{"message":"The model `x` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}}"#),
            (400, r#"{"error":{"message":"foo/bar is not a valid model ID","code":400}}"#),
            (404, r#"{"error":{"message":"No endpoints found for foo/bar:free."}}"#),
            (400, r#"{"error":{"message":"The model `llama3-8b` has been decommissioned"}}"#),
            (400, r#"[{"error":{"code":400,"message":"models/x is not found for API version v1main"}}]"#),
        ] {
            assert_eq!(parse_reply(status, body.as_bytes()), Err(AiErr::Model), "{body}");
        }
        /* bez těla zůstane mapování podle stavu; jiné chyby nejsou „model“ */
        assert_eq!(parse_reply(404, b""), Err(AiErr::Model));
        assert_eq!(parse_reply(400, br#"{"error":{"message":"messages: too long"}}"#), Err(AiErr::Request));
        assert_eq!(parse_reply(400, b"not json"), Err(AiErr::Request));
        assert_eq!(parse_reply(401, br#"{"error":{"message":"model not found, invalid key"}}"#), Err(AiErr::BadKey));
        assert_eq!(parse_reply(429, br#"{"error":{"code":"model_not_found"}}"#), Err(AiErr::Quota));
        assert_eq!(parse_reply(500, br#"{"error":{"code":"model_not_found"}}"#), Err(AiErr::Server));
        /* přes ask_for: okno dostane jen kód */
        let ai = ai_with(Arc::new(Fake::raw(Ok((400, br#"{"error":{"message":"foo is not a valid model ID gsk_abc"}}"#.to_vec())))), true);
        assert_eq!(ask(&ai), Err(AiErr::Model));
        assert_eq!(AiErr::Model.code(), "ai:model");
        /* odpověď do okna: text, dnešní počet a příznak opakování (camelCase) */
        let v = serde_json::to_value(AiReply { text: "a".into(), today: 1, retried: false }).unwrap();
        assert_eq!(v, serde_json::json!({"text":"a","today":1,"retried":false}));
    }

    /// Místní zkušební server HTTP (jen 127.0.0.1, jen v testu): skutečný klient ureq bez sítě.
    fn serve(reply: Vec<u8>, wait: Duration) -> String {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut s, _)) = l.accept() {
                let mut buf = [0u8; 4096];
                let _ = s.read(&mut buf);
                std::thread::sleep(wait);
                let _ = s.write_all(&reply);
                let _ = s.flush();
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        format!("http://{addr}/v1/chat/completions")
    }
    fn http(status: &str, body: &[u8]) -> Vec<u8> {
        let mut v = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn skutecny_klient_meze_cteni_a_casu() {
        let t = UreqTransport { timeout: Duration::from_secs(5), max_read: 1024, https_only: false };
        let ok = br#"{"choices":[{"message":{"content":"Ahoj."}}]}"#;
        let (status, body) = t.post(&serve(http("200 OK", ok), Duration::ZERO), KEY, b"{}").unwrap();
        assert_eq!(parse_reply(status, &body), Ok("Ahoj.".into()));
        let (status, _) = t.post(&serve(http("401 Unauthorized", b"{}"), Duration::ZERO), KEY, b"{}").unwrap();
        assert_eq!(map_status(status), AiErr::BadKey);
        let (status, _) = t.post(&serve(http("429 Too Many Requests", b"{}"), Duration::ZERO), KEY, b"{}").unwrap();
        assert_eq!(map_status(status), AiErr::Quota);
        /* odpověď nad mez čtení */
        let huge = vec![b'x'; 4096];
        assert_eq!(t.post(&serve(http("200 OK", &huge), Duration::ZERO), KEY, b"{}"), Err(NetErr::TooBig));
        /* server neodpovídá do časového limitu */
        let slow = UreqTransport { timeout: Duration::from_millis(300), max_read: 1024, https_only: false };
        assert_eq!(slow.post(&serve(http("200 OK", ok), Duration::from_secs(3)), KEY, b"{}"), Err(NetErr::Timeout));
        /* nikdo neposlouchá */
        let dead = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap();
        assert_eq!(t.post(&format!("http://{dead}/x"), KEY, b"{}"), Err(NetErr::Offline));
        /* produkční klient odmítne http:// ještě před sítí */
        let prod = UreqTransport::production();
        assert!(prod.https_only);
        assert_eq!(prod.timeout, TIMEOUT);
        assert_eq!(prod.max_read, MAX_RESPONSE);
        assert!(prod.post(&serve(http("200 OK", ok), Duration::ZERO), KEY, b"{}").is_err());
    }
}
