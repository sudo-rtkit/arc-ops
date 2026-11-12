/* Sdílené prvky mapové vrstvy (0.14.0, návrh docs/design/maps): ikony bodů, glyfy typů míst, štítky, snímek
   z místního úložiště a geometrie zobrazení (přiblížení a posun). Používá je modul Mapy i náhled v overlayi. */
import { useEffect, useState, type CSSProperties } from 'react';
import { areaCode, areaSlug, type PoiType } from '../core/lootAreas';
import { AREA_PATHS, POI_PATHS } from './mapPaths';
import { getMapImage, onMapImage, type MapImageRec } from '../storage/mapImages';
import { cx } from './components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const SVG = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function PoiIcon({ type, size = 20, className }: { type: PoiType; size?: number; className?: string }) {
  return <svg className={cx('map-icon', className)} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...SVG}><path d={POI_PATHS[type]} /></svg>;
}
/* Glyf typu místa; neznámý typ = otazník. */
export function AreaGlyph({ area, size = 16 }: { area: string; size?: number }) {
  const d = AREA_PATHS[areaSlug(area)];
  return (
    <svg className="map-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...SVG}>
      {d ? <path d={d} /> : <path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15m0 3v.5" />}
    </svg>
  );
}
/* Barva typu místa (tokeny --loot-*; neznámé neutrální). */
export const areaColor = (area: string): string => `var(--loot-${areaSlug(area)})`;
export const areaStyle = (area: string): CSSProperties => ({ color: areaColor(area) });

/* Štítek typu místa: glyf + název (názvy typů míst jsou stabilní katalogové hodnoty v obou jazycích). */
export function AreaBadge({ area, size = 14 }: { area: string; size?: number }) {
  const t = useT();
  return <span className="map-badge" style={areaStyle(area)} data-area={area || 'unknown'}><AreaGlyph area={area} size={size} />{area || t('mapv.unknown')}</span>;
}
/* Více typů míst předmětu, nebo „Neznámé“. */
export function AreaBadges({ areas }: { areas: string[] }) {
  return <span className="map-badges">{areas.length ? areas.map(a => <AreaBadge key={a} area={a} />) : <AreaBadge area="" />}</span>;
}

export const poiTypeLabel = (t: (k: Key) => string, type: PoiType): string => t(`mapv.type.${type}` as Key);
export const poiNumber = (i: number): string => String(i + 1).padStart(2, '0');
/* Popisek bodu na mapě: „01 · E“ (číslo · kód typu místa). */
export const pinLabel = (i: number, area: string): string => `${poiNumber(i)} · ${areaCode(area)}`;

/* Vlastní snímek mapy z místního úložiště; načte se znovu při změně (i z jiného okna) nebo při změně `at`. */
export function useMapImage(mapId: string, at = 0): { img: MapImageRec | null; loading: boolean } {
  const [st, setSt] = useState<{ id: string; img: MapImageRec | null; loading: boolean }>({ id: mapId, img: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => onMapImage(id => { if (id === mapId) setTick(x => x + 1); }), [mapId]);
  useEffect(() => {
    let dead = false;
    setSt(x => (x.id === mapId ? { ...x, loading: true } : { id: mapId, img: null, loading: true }));
    void getMapImage(mapId).then(img => { if (!dead) setSt({ id: mapId, img, loading: false }); });
    return () => { dead = true; };
  }, [mapId, at, tick]);
  return st.id === mapId ? { img: st.img, loading: st.loading } : { img: null, loading: true };
}

/* ----- geometrie zobrazení -----
   Snímek se vejde do plochy (contain) a pak se násobí přiblížením z (1–3). pan = posun středu v px plochy. */
export interface View { z: number; px: number; py: number }
export const VIEW0: View = { z: 1, px: 0, py: 0 };
export const Z_MIN = 1, Z_MAX = 3;
export interface Frame { ox: number; oy: number; dw: number; dh: number }
export function frameOf(cw: number, ch: number, w: number, h: number, v: View): Frame {
  const fit = Math.min(cw / w, ch / h) || 1;
  const dw = w * fit * v.z, dh = h * fit * v.z;
  return { ox: (cw - dw) / 2 + v.px, oy: (ch - dh) / 2 + v.py, dw, dh };
}
/* Posun omezený tak, aby z obrázku zůstala vidět aspoň čtvrtina plochy (snímek nejde odsunout celý pryč). */
export function clampView(cw: number, ch: number, w: number, h: number, v: View): View {
  const z = Math.min(Z_MAX, Math.max(Z_MIN, v.z));
  const f = frameOf(cw, ch, w, h, { z, px: 0, py: 0 });
  const mx = Math.max(0, (f.dw - cw) / 2) + cw * 0.25, my = Math.max(0, (f.dh - ch) / 2) + ch * 0.25;
  return { z, px: Math.max(-mx, Math.min(mx, v.px)), py: Math.max(-my, Math.min(my, v.py)) };
}
/* Přiblížení s bodem pod kurzorem na místě (mx, my v px plochy). */
export function zoomAt(cw: number, ch: number, w: number, h: number, v: View, z: number, mx = cw / 2, my = ch / 2): View {
  const f = frameOf(cw, ch, w, h, v);
  const u = (mx - f.ox) / f.dw, q = (my - f.oy) / f.dh;
  const nz = Math.min(Z_MAX, Math.max(Z_MIN, z));
  const g = frameOf(cw, ch, w, h, { z: nz, px: 0, py: 0 });
  return clampView(cw, ch, w, h, { z: nz, px: mx - u * g.dw - (cw - g.dw) / 2, py: my - q * g.dh - (ch - g.dh) / 2 });
}
/* Bod plochy → relativní souřadnice snímku (null mimo snímek). */
export function toRel(f: Frame, mx: number, my: number): { x: number; y: number } | null {
  const x = (mx - f.ox) / f.dw, y = (my - f.oy) / f.dh;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

/* Mřížka a snímek (z0–z1). Filtr sladění jen při zobrazení, originál se nemění. */
export function MapBackdrop({ img, frame, harmonise, grid }: { img: MapImageRec; frame: Frame; harmonise: boolean; grid: boolean }) {
  const box: CSSProperties = { left: frame.ox, top: frame.oy, width: frame.dw, height: frame.dh };
  const cell = frame.dw / 10;
  return <>
    <img className={cx('map-shot', harmonise && 'harmonised')} src={img.dataUrl} alt="" draggable={false} style={box} />
    {grid && <div className="map-grid" aria-hidden="true" style={{ ...box, backgroundSize: `${cell}px ${cell}px` }} />}
  </>;
}
