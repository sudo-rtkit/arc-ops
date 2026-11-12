/* Pravidla zvuků Opse (0.10.0). Hra se hraje podle zvuku, takže Ops smí pípnout jen tehdy, když s ním hráč
   právě pracuje: overlay je otevřený, okno aplikace (plné nebo kompaktní) má fokus, nebo hráč právě klikl na
   buddyho. Když je v popředí hra (nebo jiná aplikace) a žádné okno Opse se nepoužívá, Ops mlčí. Čisté funkce. */
/* 0.11.0: win, record, unlock = reakce na minihry (hrají jen v aktivním okně, stejná pravidla). */
export const SOUNDS = ['scan', 'done', 'unsure', 'error', 'levelup', 'open', 'close', 'beep', 'win', 'record', 'unlock'] as const;
export type SoundId = typeof SOUNDS[number];

export interface SoundContext {
  /* nastavení */
  on: boolean;
  volume: number;
  /* overlay je otevřený (a viditelný) */
  overlayOpen: boolean;
  /* okno, které chce hrát, nebo hlavní okno má fokus (plný i kompaktní režim) */
  appFocused: boolean;
  /* poslední klik nebo tažení buddyho (ms od epochy), 0 = nikdy */
  buddyTouchAt: number;
  /* hra běží v popředí (pokud to okno ví); bez znalosti false */
  gameForeground: boolean;
  now: number;
}

/* Jak dlouho po kliknutí na buddyho se počítá, že ho hráč používá. */
export const BUDDY_TOUCH_MS = 8000;

export function soundAllowed(c: SoundContext): boolean {
  if (!c.on || !(c.volume > 0)) return false;
  if (c.overlayOpen || c.appFocused) return true;
  if (c.buddyTouchAt > 0 && c.now - c.buddyTouchAt >= 0 && c.now - c.buddyTouchAt <= BUDDY_TOUCH_MS) return true;
  /* hra (nebo jiná aplikace) v popředí a Ops se nepoužívá: ticho */
  return false;
}

/* Hlasitost 0–100 → zesílení. Kvadratická křivka, strop 0,35: i plná hlasitost je tišší než hra. */
export const soundGain = (volume: number): number => {
  const v = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  return Math.round(v * v * 0.35 * 1000) / 1000;
};
