//! Zprávy mezi okny (0.16.1) a kontrola volajícího okna.
//!
//! Žádné okno nemá oprávnění `core:event:allow-emit*`, takže JavaScript nemůže sám vyslat žádnou událost.
//! - Zprávy okno → okno jdou přes příkaz `bus_send`. Rust doplní odesílatele podle štítku volajícího okna
//!   (nejde podvrhnout), pustí jen pevné trasy (hlavní ↔ buddy, hlavní ↔ overlay) a omezí název a velikost.
//!   Příjemce dostane událost `bus:<typ>` s `{ from, payload }`.
//! - Události, které smí poslat jen Rust (zavření a nabídka oznamovací oblasti, viditelnost hry, snímek, overlay),
//!   mají předponu `native:` a posílá je výhradně `emit_native`. Okno je poslouchá zvlášť (Bus.onNative), takže
//!   zpráva z jiného okna se za ně vydávat nemůže.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, WebviewWindow};

pub const MAIN: &str = "main";
pub const BUDDY: &str = "buddy";
pub const OVERLAY: &str = "overlay";
/* Nejvýš tolik bajtů JSON v jedné zprávě z buddyho nebo overlaye (akce plného modulu má limit 256 K znaků). */
pub const MAX_FROM_CHILD: usize = 1024 * 1024;
/* Zprávy z hlavního okna nesou kopii stavu (limit stavu je 20 MB). */
pub const MAX_FROM_MAIN: usize = 24 * 1024 * 1024;

/// Smí okno s tímto štítkem volat příkaz? Obrana do hloubky vedle capabilities.
pub fn only<R: Runtime>(w: &WebviewWindow<R>, labels: &[&str]) -> Result<(), String> {
    if labels.contains(&w.label()) { Ok(()) } else { Err("Příkaz není pro toto okno povolený".into()) }
}

/// Povolené trasy zpráv mezi okny.
pub fn route_ok(from: &str, to: &str) -> bool {
    matches!((from, to), (MAIN, BUDDY) | (MAIN, OVERLAY) | (BUDDY, MAIN) | (OVERLAY, MAIN))
}

/// Typ zprávy: písmeno a pak písmena, číslice nebo pomlčka, nejvýš 32 znaků (platný název události Tauri).
pub fn kind_ok(kind: &str) -> bool {
    let b = kind.as_bytes();
    !b.is_empty() && b.len() <= 32 && b[0].is_ascii_alphabetic() && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'-')
}

#[derive(Serialize, Clone)]
struct Envelope {
    from: String,
    payload: serde_json::Value,
}

/// Pošle zprávu jinému oknu aplikace. Odesílatele určí Rust podle volajícího okna.
#[tauri::command]
pub fn bus_send<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, to: String, kind: String, payload: serde_json::Value) -> Result<(), String> {
    let from = window.label().to_string();
    if !route_ok(&from, &to) || !kind_ok(&kind) {
        return Err("bus:denied".into());
    }
    let max = if from == MAIN { MAX_FROM_MAIN } else { MAX_FROM_CHILD };
    let size = serde_json::to_vec(&payload).map(|v| v.len()).unwrap_or(usize::MAX);
    if size > max {
        return Err("bus:tooBig".into());
    }
    app.emit_to(to.as_str(), &format!("bus:{kind}"), Envelope { from, payload }).map_err(|e| e.to_string())
}

/// Událost, kterou smí poslat jen Rust (předpona `native:`).
pub fn emit_native<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, to: &str, kind: &str, payload: S) {
    let _ = app.emit_to(to, &format!("native:{kind}"), payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trasy_jen_mezi_hlavnim_oknem_a_ostatnimi() {
        assert!(route_ok("main", "buddy"));
        assert!(route_ok("main", "overlay"));
        assert!(route_ok("buddy", "main"));
        assert!(route_ok("overlay", "main"));
        assert!(!route_ok("buddy", "overlay"));
        assert!(!route_ok("overlay", "buddy"));
        assert!(!route_ok("main", "main"));
        assert!(!route_ok("buddy", "buddy"));
        assert!(!route_ok("evil", "main"));
        assert!(!route_ok("overlay", "anything"));
    }

    #[test]
    fn typ_zpravy() {
        for ok in ["hello", "action", "lootImport", "game-visible", "a1"] {
            assert!(kind_ok(ok), "{ok}");
        }
        for bad in ["", "1abc", "-x", "a:b", "a/b", "a b", "a_b", "x".repeat(33).as_str(), "ž"] {
            assert!(!kind_ok(bad), "{bad}");
        }
    }
}
