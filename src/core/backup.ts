/* Export zálohy a rozpoznání importu (záloha aplikace, nebo záloha starého deníku). */
import type { AppState } from './types';
import { isObj } from './util';
import { normalize, SCHEMA } from './state';
import { importV1, isDiaryV1, type ImportReport } from './importV1';
import { tl, type Lang } from '../i18n';

export const APP_ID = 'arc-raiders-companion';

export interface BackupFile { app: typeof APP_ID; schema: number; exportedAt: string; state: AppState }

export function makeBackup(state: AppState, now: Date = new Date()): string {
  const file: BackupFile = { app: APP_ID, schema: SCHEMA, exportedAt: now.toISOString(), state };
  return JSON.stringify(file, null, 1);
}

/* Název souboru zálohy v jazyce UI (bez diakritiky): arc-companion-zaloha-… / arc-companion-backup-… */
export const backupFileName = (now: Date = new Date(), lang: Lang = 'cs'): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tl(lang, 'backup.fileName')}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
};

export type ParsedBackup =
  | { kind: 'app' | 'diary'; state: AppState; report: ImportReport | null; exportedAt: string | null }
  | { error: string };

/* Kódy chyb jsou české texty z dřívějších verzí; UI je přeloží přes backupErrorText. */
export const ERR_INVALID = 'Soubor není platná záloha.';
export const ERR_NEWER = 'Záloha pochází z novější verze aplikace.';
export const backupErrorText = (err: string, lang: Lang): string =>
  (err === ERR_INVALID ? tl(lang, 'backup.err.invalid') : err === ERR_NEWER ? tl(lang, 'backup.err.newer') : err);

/* lang = jazyk pro zálohu bez uložené volby jazyka (starší zálohy a deník v1 převezmou aktuální jazyk). */
export function parseBackup(textIn: string, now: number = Date.now(), lang: Lang = 'cs'): ParsedBackup {
  let raw: unknown;
  try { raw = JSON.parse(String(textIn).replace(/^﻿/, '')); } catch { return { error: ERR_INVALID }; }
  if (!isObj(raw)) return { error: ERR_INVALID };
  if (raw.app === APP_ID) {
    if (typeof raw.schema !== 'number' || raw.schema > SCHEMA) return { error: typeof raw.schema === 'number' ? ERR_NEWER : ERR_INVALID };
    if (!isObj(raw.state)) return { error: ERR_INVALID };
    return { kind: 'app', state: normalize(raw.state, now, lang), report: null, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null };
  }
  if (typeof raw.schema === 'number') {
    if (raw.schema > SCHEMA) return { error: ERR_NEWER };
    if (raw.schema === 2 || raw.schema === SCHEMA) return { kind: 'app', state: normalize(raw, now, lang), report: null, exportedAt: null };
    return { error: ERR_INVALID };
  }
  if (isDiaryV1(raw)) {
    const { state, report } = importV1(raw, now, lang);
    return { kind: 'diary', state, report, exportedAt: null };
  }
  return { error: ERR_INVALID };
}
