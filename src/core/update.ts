/* 0.33.0: volitelná kontrola nové verze (jen upozornění; nic nestahuje ani nespouští). Čisté funkce bez DOM:
   nastavení (výchozí stav vypnuto), normalizace při načtení a importu, výsledek z Rustu, kdy kontrolovat
   automaticky, kdy ukázat pruh a kdy smí Ops jednou říct hlášku.
   - Síť je jen v Rustu (src-tauri/src/update.rs, příkaz update_check): jediná pevná adresa api.github.com pro
     nejnovější vydání tohoto repozitáře, nejvýš jednou za 10 minut. Okno nic neposílá a nic jiného nevolá.
   - Nastavení patří tomuto počítači (jako AI asistent): import zálohy, obnova ani reset ho nemění a nikdy ho
     nezapnou.
   - Adrese stránky vydání se nikdy nevěří: při načtení, importu i z Rustu se počítá znovu z ověřené verze
     (RELEASES_PREFIX + tag/v<verze>, stejné pravidlo jako url_ok v Rustu).
   - Poznámky k vydání jsou jen prostý text (bez HTML, Markdownu a odkazů), omezená délka. */
import type { AppState } from './types';
import { isObj } from './util';
import { APP_VERSION, compareVersions } from './whatsnew';
import { inRaidRisk, plainAnswer, type GameInfo } from './ai';

/* Stránka vydání musí začínat přesně tímto (stejná konstanta jako RELEASES_PREFIX v Rustu). */
export const RELEASES_PREFIX = 'https://github.com/sudo-rtkit/arc-ops/releases/';
/* Automaticky nejvýš jednou za den. */
export const UPDATE_DAY_MS = 24 * 3600 * 1000;
/* První automatická kontrola chvíli po startu aplikace. */
export const UPDATE_START_MS = 30_000;
/* Hra v popředí: kontrola počká. */
export const UPDATE_DEFER_MS = 5 * 60_000;
/* Jak často se znovu podívat, jestli je kontrola na řadě (aplikace může běžet dny). */
export const UPDATE_IDLE_MS = 3600_000;
/* Pojistka v okně nad časovým limitem Rustu (10 s). */
export const UPDATE_UI_TIMEOUT_MS = 15_000;
export const UPDATE_NOTES_MAX = 2000;
export const UPDATE_NAME_MAX = 120;

export const UPDATE_ERRORS = ['offline', 'timeout', 'rate', 'bad', 'none', 'game', 'window', 'unavailable'] as const;
export type UpdateError = (typeof UPDATE_ERRORS)[number];
export const isUpdateError = (v: unknown): v is UpdateError => typeof v === 'string' && (UPDATE_ERRORS as readonly string[]).includes(v);
/* Chyby, u kterých se na síť vůbec nešlo (nepočítají se do „jednou za den“). */
export const NO_NET_ERRORS: readonly UpdateError[] = ['game', 'window', 'unavailable'];

export interface UpdateRelease {
  /* verze bez „v“, např. 0.34.0 */
  latest: string;
  /* stránka vydání (vždy RELEASES_PREFIX + tag/v<latest>) */
  url: string;
  name: string;
  /* ISO 8601 UTC nebo '' */
  publishedAt: string;
  /* prostý text */
  notes: string;
}
export type UpdateResult = { ok: true; release: UpdateRelease } | { ok: false; error: UpdateError };
export interface UpdatePrefs {
  enabled: boolean;
  /* čas poslední kontroly, která šla na síť (0 = nikdy) */
  lastCheck: number;
  lastResult: UpdateResult | null;
  /* verze skrytá tlačítkem „Skrýt tuto verzi“ ('' = žádná) */
  skippedVersion: string;
  /* verze, o které už Ops jednou řekl hlášku ('' = žádná) */
  notifiedVersion: string;
}
export const emptyUpdate = (): UpdatePrefs => ({ enabled: false, lastCheck: 0, lastResult: null, skippedVersion: '', notifiedVersion: '' });

/* Verze x.y.z (každé číslo 1–9 číslic, stejně jako parse_version v Rustu). */
export const VERSION_RE = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;
export const isVersion = (v: unknown): v is string => typeof v === 'string' && VERSION_RE.test(v);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;

export const releaseUrl = (version: string): string => `${RELEASES_PREFIX}tag/v${version}`;
/* Stejné pravidlo jako url_ok v Rustu: přesně předpona + tag/v<verze>. */
export const releaseUrlOk = (url: unknown, version: string): boolean => isVersion(version) && url === releaseUrl(version);
export const newerThanApp = (latest: string, current: string = APP_VERSION): boolean => isVersion(latest) && compareVersions(latest, current) > 0;

/* Poznámky k vydání pro zobrazení: prostý text (plainAnswer: bez HTML, Markdownu a odkazů), nejvýš UPDATE_NOTES_MAX. */
export const plainNotes = (raw: unknown): string => plainAnswer(typeof raw === 'string' ? raw.slice(0, UPDATE_NOTES_MAX * 2) : '', UPDATE_NOTES_MAX);
export const plainName = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '').replace(CONTROL, ' ').replace(/<[^>]{0,200}>/g, '').replace(/\s+/g, ' ').trim().slice(0, UPDATE_NAME_MAX);

function normalizeRelease(raw: unknown): UpdateRelease | null {
  if (!isObj(raw) || !isVersion(raw.latest)) return null;
  const latest = raw.latest;
  return {
    latest,
    /* adresa se nikdy nebere z uložených dat ani z importu */
    url: releaseUrl(latest),
    name: plainName(raw.name),
    publishedAt: typeof raw.publishedAt === 'string' && ISO_RE.test(raw.publishedAt) ? raw.publishedAt : '',
    notes: plainNotes(raw.notes),
  };
}

export function normalizeUpdateResult(raw: unknown): UpdateResult | null {
  if (!isObj(raw)) return null;
  if (raw.ok === true) { const release = normalizeRelease(raw.release); return release ? { ok: true, release } : null; }
  if (raw.ok === false && isUpdateError(raw.error)) return { ok: false, error: raw.error };
  return null;
}

/* Normalizace při načtení a importu: jen známé hodnoty a meze; čas z budoucnosti = nikdy. */
export function normalizeUpdate(raw: unknown, now: number = Date.now()): UpdatePrefs {
  const r = isObj(raw) ? raw : {};
  const d = emptyUpdate();
  d.enabled = r.enabled === true;
  if (typeof r.lastCheck === 'number' && Number.isFinite(r.lastCheck) && r.lastCheck > 0 && r.lastCheck <= now + 60_000) d.lastCheck = Math.floor(r.lastCheck);
  d.lastResult = normalizeUpdateResult(r.lastResult);
  if (isVersion(r.skippedVersion)) d.skippedVersion = r.skippedVersion;
  if (isVersion(r.notifiedVersion)) d.notifiedVersion = r.notifiedVersion;
  return d;
}

/* Kód chyby z Rustu (update:<kód>) → chyba UI; cokoli neznámého = chybná odpověď. */
export function mapUpdateError(e: unknown): UpdateError {
  const s = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  const m = /^update:([a-z]+)$/.exec(s);
  return m && isUpdateError(m[1]) ? m[1] : 'bad';
}

/* Výsledek z Rustu: i jemu se ověří verze a adresa (stejné pravidlo), poznámky jen jako prostý text. */
export function fromNative(raw: unknown): UpdateResult {
  if (!isObj(raw) || !isVersion(raw.latest) || !releaseUrlOk(raw.url, raw.latest)) return { ok: false, error: 'bad' };
  return { ok: true, release: normalizeRelease({ ...raw })! };
}

/* Je automatická kontrola na řadě? Jen se zapnutou kontrolou a nejvýš jednou za UPDATE_DAY_MS. */
export const autoDue = (p: UpdatePrefs, now: number): boolean => p.enabled && (p.lastCheck <= 0 || now - p.lastCheck >= UPDATE_DAY_MS);
/* Kdy se znovu podívat (ms od teď): zbytek dne do další kontroly, nejvýš UPDATE_IDLE_MS. */
export const nextDelay = (p: UpdatePrefs, now: number): number =>
  !p.enabled ? UPDATE_IDLE_MS : Math.max(1000, Math.min(UPDATE_IDLE_MS, p.lastCheck + UPDATE_DAY_MS - now));

/* Novější vydání z posledního výsledku (bez ohledu na pruh). */
export function newerRelease(p: UpdatePrefs, current: string = APP_VERSION): UpdateRelease | null {
  const r = p.lastResult;
  return r && r.ok && newerThanApp(r.release.latest, current) ? r.release : null;
}
/* Pruh v hlavním okně: jen se zapnutou kontrolou, jen novější verze než aplikace a ne skrytá (skrytá verze
   i starší; novější než skrytá se zase ukáže). */
export function bannerRelease(p: UpdatePrefs, current: string = APP_VERSION): UpdateRelease | null {
  if (!p.enabled) return null;
  const r = newerRelease(p, current);
  if (!r) return null;
  if (p.skippedVersion && compareVersions(r.latest, p.skippedVersion) <= 0) return null;
  return r;
}
/* Smí Ops o verzi jednou říct hlášku? Jen pro verzi z pruhu, jen jednou za verzi, se zapnutými dialogy a buddym,
   když hra není v popředí a aplikace ví, že hráč není v raidu (nejistota = raid). Bublina dál podléhá pravidlům
   nevyžádaných hlášek (buddy ji ukáže, jen když hráč s Opsem pracuje). */
export function announceVersion(s: AppState, game: GameInfo, current: string = APP_VERSION): string | null {
  const r = bannerRelease(s.update, current);
  if (!r || r.latest === s.update.notifiedVersion) return null;
  if (!s.opsPrefs.dialogs || !s.buddy.enabled) return null;
  if (game.visible || inRaidRisk(s, game, 'overlay')) return null;
  return r.latest;
}
