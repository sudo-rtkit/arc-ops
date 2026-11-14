/* 0.23.0: Loadout builder → „Ze snímku obrazovky“. Hráč vloží snímek MANAGE LOADOUT (příprava loadoutu) nebo
   FINDINGS (výsledek raidu). Přečte se stejnou čtečkou jako u automatického snímání (vision/loadout.ts): výbava
   (augment, štít, dvě zbraně), BACKPACK a QUICK USE, počty míst z popisků a mez váhy. Rozpoznané předměty se ukážou
   v kontrole jako u lootu ze snímku: hráč názvy a počty zkontroluje, opraví nebo vynechá a teprve „Předvyplnit“
   je převezme do formuláře (nic se neukládá, loadout se uloží až tlačítkem dialogu). Neznámé místo zůstane prázdné,
   dokud ho hráč nepojmenuje; nic se nehádá. Snímek zůstává jen v paměti, po zavření se zahodí. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, ImagePlus, Upload, X } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import { Btn, IconBtn, Stepper, cx } from './components';
import { decodeImage, imagesFrom, type DecodeError } from './imageFile';
import { readLoadout, type LoadoutRead } from '../core/vision/loadout';
import { loadoutSnap, type LoadoutSnap } from '../core/raidLife';
import { analyzeLoot } from '../core/visionImport';
import { catalogItems, matchContext } from '../core/catalog';
import { itemKey, type Loadout } from '../core/types';
import { ITEM_MAX } from '../core/raidItems';
import { loadoutFromScan, type ScanRow, type ScanSlot } from '../core/loadouts';
import type { Box } from '../core/vision/layout';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const ERR_KEY: Record<DecodeError, Key> = { notImage: 'scan.err.notImage', tooBig: 'scan.err.tooBig', decode: 'scan.err.decode' };
interface Shot { bitmap: ImageBitmap; read: LoadoutRead; snap: LoadoutSnap; rows: Row[] }
/* Řádek kontroly: místo, navržený název (prázdný = neznámý), počet, jistota a výřez políčka pro náhled.
   0.24.0: score = jistota rozpoznání 0–1, guess = návrh pod prahem (jen tlačítkem), tierConf = tier zbraně. */
interface Row {
  id: string; slot: ScanSlot; name: string; qty: number; conf: 'high' | 'medium' | 'unknown'; box: Box | null;
  score?: number; guess?: string; tierConf?: 'high' | 'medium' | 'unknown';
}

function Thumb({ bitmap, box }: { bitmap: ImageBitmap; box: Box | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx || !box) return;
    c.width = 40; c.height = 40;
    /* 0.24.0: místo zbraně je na šířku: celý obrázek zmenšený do náhledu (dřív se ořízl na čtverec a zbraň byla useknutá) */
    const k = 40 / Math.max(box.w, box.h), w = box.w * k, h = box.h * k;
    ctx.clearRect(0, 0, 40, 40);
    ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, (40 - w) / 2, (40 - h) / 2, w, h);
  }, [bitmap, box]);
  return <canvas ref={ref} className="scan-thumb" width={40} height={40} aria-hidden="true" />;
}

/* Řádky kontroly: výbava ze snímku loadoutu (stejné rozpoznání jako automatický zápis), batoh a quick use po
   skupinách stejných předmětů (zbraň v batohu nese tier). */
function reviewRows(read: LoadoutRead, snap: LoadoutSnap, ctx: ReturnType<typeof matchContext>, learned: Parameters<typeof analyzeLoot>[1]): Row[] {
  const rows: Row[] = [];
  read.equip.forEach((e, i) => {
    const f = snap.fields[i];
    if (!f || f.state !== 'item') return;
    rows.push({ id: 'e' + i, slot: e.slot, name: f.name ?? '', qty: 1, conf: f.conf, box: e.box, ...(f.score !== undefined ? { score: f.score } : {}), ...(f.guess ? { guess: f.guess } : {}), ...(f.tierConf ? { tierConf: f.tierConf } : {}) });
  });
  if (read.screen) {
    const a = analyzeLoot(read.screen, learned, ctx);
    for (const g of a.groups) {
      const c0 = g.cells[0];
      const panel = c0?.panel === 'quickUse' ? 'quickUse' : 'backpack';
      const known = g.match.itemKey !== null && g.match.status !== 'unknown';
      const box = read.screen.panels.find(p => p.panel === panel)?.cells.find(x => x.row === c0.row && x.col === c0.col)?.box ?? null;
      rows.push({ id: g.id, slot: panel, name: known ? itemKey(g.match.itemKey!, g.tier ?? undefined) : '', qty: Math.max(1, Math.min(ITEM_MAX, g.count ?? 1)), conf: !known ? 'unknown' : g.match.status === 'known' && g.countSure ? 'high' : 'medium', box });
    }
  }
  return rows;
}

/* 0.24.0: jistota pole (zbraň, augment), tier zbraně a návrh pod prahem, který se převezme jen tlačítkem. */
function ScanConf({ r, used, onUse }: { r: Row; used: boolean; onUse: (name: string) => void }) {
  const t = useT();
  if (r.score === undefined && !r.tierConf) return null;
  return (
    <span className="lo-scan-conf" data-testid="lo-scan-conf">
      {r.score !== undefined && r.conf === 'high' && <span className="meta"> {t('lo.scan.conf', { conf: r.score })}</span>}
      {r.tierConf === 'unknown' && r.conf === 'high' && <span className="meta amber"> {t('lo.scan.noTier')}</span>}
      {r.guess && !used && (
        <button type="button" className="link-btn" onClick={() => onUse(r.guess!)} data-testid="lo-scan-guess">
          {t('lo.scan.guess', { name: r.guess, conf: r.score ?? 0 })}
        </button>
      )}
    </span>
  );
}

export function LoadoutScan({ base, onApply }: { base: Loadout; onApply: (l: Loadout) => void }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const materials = useMemo(() => d.materials.map(m => m.name), [d.materials]);
  const ctxRef = useRef({ learned: s.vision.learned, materials, items: Object.values(s.items).map(x => x.name) });
  ctxRef.current = { learned: s.vision.learned, materials, items: Object.values(s.items).map(x => x.name) };
  const suggestions = useMemo(() => [...new Set([...materials, ...catalogItems().map(x => x.name), ...d.weapons.map(w => w.name)])], [materials, d.weapons]);

  const drop = useCallback(() => { setShot(prev => { prev?.bitmap.close(); return null; }); setNames({}); setCounts({}); setOff({}); setError(null); setApplied(false); }, []);
  const add = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy(true); drop();
    const r = await decodeImage(f);
    if (typeof r === 'string') { setError(ERR_KEY[r]); setBusy(false); return; }
    await new Promise(res => setTimeout(res, 0));
    const read = readLoadout(r.img);
    if (!read) { r.bitmap.close(); setError('lo.scan.none'); setBusy(false); return; }
    const c = ctxRef.current, ctx = matchContext(c.materials, c.items);
    const snap = loadoutSnap(read, c.learned, ctx, Date.now());
    setShot({ bitmap: r.bitmap, read, snap, rows: reviewRows(read, snap, ctx, c.learned) });
    setBusy(false);
  }, [drop]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault(); e.stopImmediatePropagation();
      void add(files);
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [open, add]);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  useEffect(() => () => { shotRef.current?.bitmap.close(); }, []);

  const rows = shot?.rows ?? [];
  const nameOf = (r: Row) => names[r.id] ?? r.name;
  const countOf = (r: Row) => counts[r.id] ?? r.qty;
  const chosen = rows.filter(r => !off[r.id]);
  const unnamed = chosen.filter(r => !nameOf(r).trim()).length;
  const apply = () => {
    if (!shot) return;
    const list: ScanRow[] = chosen.map(r => ({ slot: r.slot, name: nameOf(r), qty: countOf(r) }));
    const rd = shot.read;
    onApply(loadoutFromScan(list, { kind: rd.kind, backpackMax: rd.backpackMax, quickUseMax: rd.quickUseMax, weightMax: rd.weightMax }, d.weapons, base));
    setApplied(true);
  };

  if (!open) return <div><Btn size="sm" icon={ImagePlus} onClick={() => setOpen(true)} data-testid="lo-scan-open">{t('lo.scan.open')}</Btn></div>;
  const rd = shot?.read;
  const slotLabel = (sl: ScanSlot) => t(`lo.section.${sl}` as Key);
  return (
    <section className="loot-scan stack-sm" aria-label={t('lo.scan.title')} data-testid="lo-scan">
      <div className="row between">
        <b>{t('lo.scan.title')}</b>
        <IconBtn ghost label={t('lo.scan.close')} icon={X} onClick={() => { drop(); setOpen(false); }} />
      </div>
      <p className="meta">{t('lo.scan.intro')}</p>
      <div className={cx('scan-drop', 'compact', dragging && 'over')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void add(imagesFrom(e.dataTransfer)); }}>
        <p>{t('lootscan.drop')}</p>
        <Btn size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>{t('lootscan.pick')}</Btn>
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="lo-scan-file"
          onChange={e => { void add([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      {busy && <p className="meta" role="status">{t('scan.busy')}</p>}
      {error && <p className="danger-text" role="alert"><CircleAlert size={16} aria-hidden="true" /> {t(error)}</p>}
      {rd && shot && (
        <>
          <p className="meta" data-testid="lo-scan-found">{t('lo.scan.found', {
            kind: t(rd.kind === 'unknown' ? 'lo.scan.kindUnknown' : (`lo.kind.${rd.kind}` as Key)),
            bp: rd.backpackMax ?? '?', qu: rd.quickUseMax ?? '?', weight: rd.weightMax ?? '?', value: rd.value ?? '?',
          })}</p>
          {shot.snap.fields.some(f => f.state === 'random') && <p className="meta">{t('lo.scan.random')}</p>}
          {rows.length === 0 ? <p className="meta" data-testid="lo-scan-empty">{t('lo.scan.empty')}</p> : (
            <div className="table-wrap">
              <table className="table loot-scan-table">
                <thead><tr><th><span className="sr-only">{t('lo.scan.include')}</span></th><th><span className="sr-only">{t('scan.col.icon')}</span></th><th>{t('lo.col.slot')}</th><th>{t('scan.col.item')}</th><th className="num">{t('scan.col.read')}</th></tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.id} data-row={r.id} className={off[r.id] ? 'muted' : undefined}>
                    <td><input type="checkbox" aria-label={t('lo.scan.includeAria', { slot: slotLabel(r.slot) })} checked={!off[r.id]} onChange={e => setOff(p => ({ ...p, [r.id]: !e.target.checked }))} /></td>
                    <td><Thumb bitmap={shot.bitmap} box={r.box} /></td>
                    <td>{slotLabel(r.slot)}</td>
                    <td><input className="input" list="lo-scan-names" aria-label={t('lo.scan.itemAria', { slot: slotLabel(r.slot) })} placeholder={t('lootscan.namePh')} maxLength={80}
                      value={nameOf(r)} onChange={e => setNames(p => ({ ...p, [r.id]: e.target.value }))} />
                      {r.conf !== 'high' && <span className="meta"> {t(r.conf === 'unknown' ? 'lo.scan.unknown' : 'scan.status.uncertain')}</span>}
                      <ScanConf r={r} used={names[r.id] !== undefined} onUse={g => setNames(p => ({ ...p, [r.id]: g }))} /></td>
                    <td className="num"><Stepper label={t('lo.scan.countAria', { slot: slotLabel(r.slot) })} value={countOf(r)} min={1} max={ITEM_MAX} onChange={v => setCounts(p => ({ ...p, [r.id]: v }))} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <datalist id="lo-scan-names">{suggestions.map(n => <option key={n} value={n} />)}</datalist>
            </div>
          )}
          <div className="row">
            <Btn size="sm" variant="primary" onClick={apply} data-testid="lo-scan-apply">{t('lo.scan.apply')}</Btn>
            <span className="meta">{applied ? t('lo.scan.applied') : unnamed ? t('lo.scan.unnamed', { count: unnamed }) : t('lo.scan.applyHint')}</span>
          </div>
        </>
      )}
    </section>
  );
}
