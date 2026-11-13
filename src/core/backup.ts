/* Export zálohy a rozpoznání importu (záloha aplikace, nebo záloha starého deníku). */
import type { AppState } from './types';
import { isObj, safeJsonParse } from './util';
import { normalize, SCHEMA } from './state';
import { importV1, isDiaryV1, type ImportReport } from './importV1';
import { tl, type Lang } from '../i18n';
import { MAPS } from './data/maps';
import { dataUrlSize, withinBudget } from './imageSize';

export const APP_ID = 'arc-raiders-companion';

/* mapImages (0.14.0): vlastní snímky map, jen když je hráč do zálohy výslovně přidá (výchozí vypnuto). */
export interface BackupImage { mapId: string; dataUrl: string; w: number; h: number }
export interface BackupFile { app: typeof APP_ID; schema: number; exportedAt: string; state: AppState; mapImages?: BackupImage[] }

export function makeBackup(state: AppState, now: Date = new Date(), mapImages: BackupImage[] = []): string {
  const file: BackupFile = { app: APP_ID, schema: SCHEMA, exportedAt: now.toISOString(), state };
  if (mapImages.length) file.mapImages = mapImages;
  return JSON.stringify(file, null, 1);
}

/* Snímky map ze zálohy: jen známé mapy a obrázková data URL (PNG, JPEG, WebP).
   0.16.1: nejvýš MAX_BACKUP_IMAGE_CHARS znaků na snímek; typ a rozměry se čtou z hlavičky obrázku (údaje w/h
   v záloze se nepoužijí) a obrázek nad rozpočtem (core/imageSize.ts) se zahodí bez dekódování. Před uložením
   jde každý snímek ještě stejnou cestou jako vlastní import (ui/mapImport.ts restoreImage: zmenšení na 4096 px). */
const IMG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_BACKUP_IMAGE_CHARS = 16 * 1024 * 1024;
export function backupImages(raw: unknown): BackupImage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BackupImage[] = [];
  for (const x of raw.slice(0, MAPS.length * 2)) {
    if (!isObj(x) || typeof x.mapId !== 'string' || !MAPS.some(m => m.id === x.mapId) || seen.has(x.mapId)) continue;
    if (typeof x.dataUrl !== 'string' || x.dataUrl.length > MAX_BACKUP_IMAGE_CHARS) continue;
    const kind = IMG_RE.exec(x.dataUrl)?.[1];
    const size = kind ? dataUrlSize(x.dataUrl) : null;
    if (!size || size.kind !== kind || !withinBudget(size.w, size.h)) continue;
    seen.add(x.mapId);
    out.push({ mapId: x.mapId, dataUrl: x.dataUrl, w: size.w, h: size.h });
  }
  return out;
}

/* Název souboru zálohy v jazyce UI (bez diakritiky): arc-companion-zaloha-… / arc-companion-backup-… */
export const backupFileName = (now: Date = new Date(), lang: Lang = 'cs'): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tl(lang, 'backup.fileName')}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
};

export type ParsedBackup =
  | { kind: 'app' | 'diary'; state: AppState; report: ImportReport | null; exportedAt: string | null; mapImages?: BackupImage[] }
  | { error: string };

/* Kódy chyb jsou české texty z dřívějších verzí; UI je přeloží přes backupErrorText. */
export const ERR_INVALID = 'Soubor není platná záloha.';
export const ERR_NEWER = 'Záloha pochází z novější verze aplikace.';
export const backupErrorText = (err: string, lang: Lang): string =>
  (err === ERR_INVALID ? tl(lang, 'backup.err.invalid') : err === ERR_NEWER ? tl(lang, 'backup.err.newer') : err);

/* lang = jazyk pro zálohu bez uložené volby jazyka (starší zálohy a deník v1 převezmou aktuální jazyk). */
export function parseBackup(textIn: string, now: number = Date.now(), lang: Lang = 'cs'): ParsedBackup {
  let raw: unknown;
  /* 0.16.1: __proto__, constructor a prototype se zahodí už při čtení (žádná výměna prototypu záznamů) */
  try { raw = safeJsonParse(String(textIn).replace(/^﻿/, '')); } catch { return { error: ERR_INVALID }; }
  if (!isObj(raw)) return { error: ERR_INVALID };
  if (raw.app === APP_ID) {
    if (typeof raw.schema !== 'number' || raw.schema > SCHEMA) return { error: typeof raw.schema === 'number' ? ERR_NEWER : ERR_INVALID };
    if (!isObj(raw.state)) return { error: ERR_INVALID };
    const images = backupImages(raw.mapImages);
    return { kind: 'app', state: normalize(raw.state, now, lang), report: null, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null, ...(images.length ? { mapImages: images } : {}) };
  }
  if (typeof raw.schema === 'number') {
    if (raw.schema > SCHEMA) return { error: ERR_NEWER };
    if (raw.schema >= 2 && raw.schema <= SCHEMA) return { kind: 'app', state: normalize(raw, now, lang), report: null, exportedAt: null };
    return { error: ERR_INVALID };
  }
  if (isDiaryV1(raw)) {
    const { state, report } = importV1(raw, now, lang);
    return { kind: 'diary', state, report, exportedAt: null };
  }
  return { error: ERR_INVALID };
}
