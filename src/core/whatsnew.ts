/* „Co je nového“ po aktualizaci (0.19.0, schéma 16). Čisté funkce bez DOM.
   - Poslední verzi, kterou tento počítač viděl (whatsNew.seen), drží stav, ale patří tomuto počítači jako opsPrefs:
     import zálohy, obnova snímku ani reset ji nemění (store/app.ts replaceState).
   - Nová instalace (žádný uložený stav): seen = aktuální verze, karta se neukáže (začíná průvodce prvním spuštěním).
   - Starší stav bez seen (schéma ≤ 15): verze se odhadne podle schématu (poslední verze, která ho ukládala), takže
     hráč uvidí jen novinky od své verze. Neznámé nebo vadné seen = nic neukazovat.
   - Stejná verze nebo návrat ke starší verzi: nic. Po zavření karty seen = max(seen, aktuální), takže návrat ke
     starší verzi a znovu aktualizace neukáže stejné body dvakrát. */
import { RELEASES, type WhatsNewRelease } from './data/whatsnew';
import { isObj } from './util';

/* Kam bod vede: modul aplikace, hledání (Ctrl+K), Nastavení Opse. */
export type WhatsNewLink = 'raid' | 'maps' | 'advisor' | 'search' | 'itemCard' | 'overlayApp' | 'games' | 'quests' | 'profile' | 'opsSettings';
export interface WhatsNewState { seen: string | null }

export const APP_VERSION: string = RELEASES[0].version;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
export const isVersion = (v: unknown): v is string => typeof v === 'string' && VERSION_RE.test(v);

/* Porovnání verzí x.y.z: záporné = a je starší. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
const maxVersion = (a: string, b: string): string => (compareVersions(a, b) >= 0 ? a : b);

/* Poslední verze, která ukládala dané schéma (pro stav uložený před 0.19.0). Schéma < 8 = před 0.10.0. */
const SCHEMA_LAST: Record<number, string> = { 8: '0.10.1', 9: '0.10.2', 10: '0.11.0', 11: '0.12.0', 12: '0.13.1', 13: '0.14.0', 14: '0.16.1', 15: '0.18.0' };
export function versionForSchema(schema: unknown): string | null {
  const n = Number(schema);
  if (!Number.isInteger(n) || n < 1) return null;
  if (n < 8) return '0.9.0';
  return SCHEMA_LAST[n] ?? null;
}

export const emptyWhatsNew = (current: string = APP_VERSION): WhatsNewState => ({ seen: current });

/* Normalizace při načtení stavu. raw = state.whatsNew, schema = schéma uloženého stavu. */
export function normalizeWhatsNew(raw: unknown, schema: unknown): WhatsNewState {
  if (isObj(raw)) return { seen: isVersion(raw.seen) ? raw.seen : null };
  /* bez schématu (prázdný nebo cizí stav) jako nová instalace; schéma 16 bez pole (ručně upravený soubor) = neznámé.
     Ani jedno kartu neukáže. */
  if (typeof schema !== 'number') return emptyWhatsNew();
  return { seen: schema >= 16 ? null : versionForSchema(schema) };
}

/* Vydání novější než seen a nejvýš aktuální verze, od nejnovějšího. seen null = nic. */
export function pendingReleases(seen: string | null, current: string = APP_VERSION, releases: readonly WhatsNewRelease[] = RELEASES): WhatsNewRelease[] {
  if (!isVersion(seen) || !isVersion(current) || compareVersions(seen, current) >= 0) return [];
  return releases.filter(r => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}

/* Všechna vydání do aktuální verze (znovu otevřená karta z Nastavení). */
export const allReleases = (current: string = APP_VERSION, releases: readonly WhatsNewRelease[] = RELEASES): WhatsNewRelease[] =>
  releases.filter(r => compareVersions(r.version, current) <= 0);

/* Po zavření karty. Vrací null, když se nic nemění. */
export function markSeen(w: WhatsNewState, current: string = APP_VERSION): WhatsNewState | null {
  if (!isVersion(current)) return null;
  const next = isVersion(w.seen) ? maxVersion(w.seen, current) : current;
  return next === w.seen ? null : { seen: next };
}
