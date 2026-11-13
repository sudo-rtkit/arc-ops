/* Vlastní snímky map (0.14.0). Obrázky jsou velké, proto nejsou ve stavu (JSON se ukládá při každé změně) ani
   v localStorage (limit pár MB), ale v IndexedDB webview. To leží v místních datech aplikace tohoto počítače
   a sdílí ho hlavní okno i overlay (stejný původ). Nic se neposílá ven. Do zálohy jdou jen volitelně.
   Bez IndexedDB (soukromý režim, chyba) se drží jen v paměti do zavření okna. */

import { dataUrlSize, withinBudget } from '../core/imageSize';

export interface MapImageRec { mapId: string; dataUrl: string; w: number; h: number; at: number }

const DB = 'arcops-maps';
const STORE = 'images';
const memory = new Map<string, MapImageRec>();
const listeners = new Set<(mapId: string) => void>();
const CHANNEL = 'arcops-map-images';
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
channel?.addEventListener('message', e => { const id = (e.data as { mapId?: unknown } | null)?.mapId; if (typeof id === 'string') listeners.forEach(f => f(id)); });

/* Jen obrázkové data URL z vlastního importu (PNG, JPEG, WebP). */
export const IMAGE_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const isImageRec = (v: unknown): v is MapImageRec => {
  const r = v as MapImageRec | null;
  return !!r && typeof r.mapId === 'string' && typeof r.dataUrl === 'string' && IMAGE_URL_RE.test(r.dataUrl.slice(0, 64) + 'A') &&
    Number.isFinite(r.w) && Number.isFinite(r.h) && r.w > 0 && r.h > 0;
};

/* 0.16.1: obrázek, jehož hlavičku nejde přečíst nebo je nad rozpočtem (core/imageSize.ts), se neuloží ani
   nezobrazí (i starší záznam z dřívější zálohy), takže otevření mapy nikdy nedekóduje obří obrázek. */
const fitsBudget = (r: MapImageRec): boolean => {
  const size = dataUrlSize(r.dataUrl);
  return !!size && withinBudget(size.w, size.h);
};

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'mapId' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then(d => new Promise<T | undefined>((resolve, reject) => {
    if (!d) { resolve(undefined); return; }
    try {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error ?? new Error('idb'));
      t.onabort = () => reject(t.error ?? new Error('idb'));
    } catch (e) { reject(e); }
  }));
}
const changed = (mapId: string) => { listeners.forEach(f => f(mapId)); channel?.postMessage({ mapId }); };

export async function getMapImage(mapId: string): Promise<MapImageRec | null> {
  try {
    const r = await tx<MapImageRec>('readonly', s => s.get(mapId) as IDBRequest<MapImageRec>);
    if (r && isImageRec(r)) return fitsBudget(r) ? r : null;
  } catch { /* spadne na paměť */ }
  const m = memory.get(mapId);
  return m && fitsBudget(m) ? m : null;
}
export async function putMapImage(rec: MapImageRec): Promise<void> {
  if (!isImageRec(rec) || !fitsBudget(rec)) throw new Error('image');
  memory.set(rec.mapId, rec);
  try { await tx('readwrite', s => s.put(rec)); } catch { /* zůstane v paměti */ }
  changed(rec.mapId);
}
export async function deleteMapImage(mapId: string): Promise<void> {
  memory.delete(mapId);
  try { await tx('readwrite', s => s.delete(mapId)); } catch { /* nic */ }
  changed(mapId);
}
export async function allMapImages(): Promise<MapImageRec[]> {
  let list: MapImageRec[] = [];
  try { list = ((await tx<MapImageRec[]>('readonly', s => s.getAll() as IDBRequest<MapImageRec[]>)) ?? []).filter(isImageRec); } catch { list = []; }
  const ids = new Set(list.map(r => r.mapId));
  return [...list, ...[...memory.values()].filter(r => !ids.has(r.mapId))].filter(fitsBudget);
}
export async function clearMapImages(): Promise<void> {
  const ids = [...new Set([...memory.keys(), ...(await allMapImages()).map(r => r.mapId)])];
  memory.clear();
  try { await tx('readwrite', s => s.clear()); } catch { /* nic */ }
  ids.forEach(changed);
}
/* Změna snímku (i z jiného okna téhož původu). */
export function onMapImage(fn: (mapId: string) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
