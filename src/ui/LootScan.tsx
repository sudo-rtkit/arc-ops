/* Zápis raidu → „Loot ze snímku“: hráč vloží snímek obrazovky po raidu (FINDINGS) nebo INVENTORY. Přečte se
   BACKPACK a QUICK USE, od nalezeného se odečte výbava zadaná pro raid a zbytek se předvyplní do lootu formuláře
   ke kontrole. Nic se nezapisuje: loot se uloží až s raidem a do Inventory se převádí tlačítkem jako dřív.
   Snímek zůstává jen v paměti, po zavření se zahodí. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, ImagePlus, Info, Upload, X } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import { Btn, IconBtn, Stepper, cx } from './components';
import { decodeImage, imagesFrom, type DecodeError } from './imageFile';
import { itemsText } from './ItemList';
import { readScreenshot, type ScreenRead } from '../core/vision/read';
import { analyzeLoot, lootMinusGear, mergeLoot, type ImportGroup } from '../core/visionImport';
import { catalogItems, matchContext } from '../core/catalog';
import { ITEM_MAX } from '../core/raidItems';
import type { ItemQty } from '../core/types';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const ERR_KEY: Record<DecodeError, Key> = { notImage: 'scan.err.notImage', tooBig: 'scan.err.tooBig', decode: 'scan.err.decode' };
interface Shot { bitmap: ImageBitmap; read: ScreenRead }
type Result = { added: number; minus: ItemQty[]; unnamed: number } | null;

function Thumb({ shot, g }: { shot: Shot; g: ImportGroup }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const c0 = g.cells[0];
  const box = shot.read.panels.find(p => p.panel === c0.panel)?.cells.find(x => x.row === c0.row && x.col === c0.col)?.box;
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx || !box) return;
    c.width = 40; c.height = 40;
    ctx.drawImage(shot.bitmap, box.x, box.y, box.w, box.h, 0, 0, 40, 40);
  }, [shot, box]);
  return <canvas ref={ref} className="scan-thumb" width={40} height={40} aria-hidden="true" />;
}

export function LootScan({ gear, loot, onLoot }: { gear: ItemQty[]; loot: ItemQty[]; onLoot: (v: ItemQty[]) => void }) {
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
  const [result, setResult] = useState<Result>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const materials = useMemo(() => d.materials.map(m => m.name), [d.materials]);
  /* Naučené otisky a evidence se vezmou ve chvíli vložení snímku (přepočet jen při novém snímku). */
  const ctxRef = useRef({ learned: s.vision.learned, materials, items: Object.values(s.items).map(x => x.name) });
  ctxRef.current = { learned: s.vision.learned, materials, items: Object.values(s.items).map(x => x.name) };
  const analysis = useMemo(() => {
    if (!shot) return null;
    const c = ctxRef.current;
    return analyzeLoot(shot.read, c.learned, matchContext(c.materials, c.items));
  }, [shot]);
  const suggestions = useMemo(() => [...new Set([...materials, ...catalogItems().map(x => x.name)])], [materials]);

  const drop = useCallback(() => { setShot(prev => { prev?.bitmap.close(); return null; }); setNames({}); setCounts({}); setOff({}); setResult(null); setError(null); }, []);
  const add = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy(true); drop();
    const r = await decodeImage(f);
    if (typeof r === 'string') { setError(ERR_KEY[r]); setBusy(false); return; }
    await new Promise(res => setTimeout(res, 0));
    setShot({ bitmap: r.bitmap, read: readScreenshot(r.img, { panels: ['backpack', 'quickUse'] }) });
    setBusy(false);
  }, [drop]);

  /* Ctrl+V, dokud je část otevřená. Zachytí se dřív než vkládání v záložce „Ze snímku“ pod dialogem. */
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

  const groups = analysis?.groups ?? [];
  const where = (g: ImportGroup) => g.cells.map(c => `${c.panel === 'quickUse' ? 'Q' : 'B'}${c.row + 1}/${c.col + 1}`).join(', ');
  const nameOf = (g: ImportGroup) => names[g.id] ?? (g.match.status !== 'unknown' && g.match.itemKey ? g.match.itemKey : '');
  const countOf = (g: ImportGroup) => counts[g.id] ?? g.count ?? 1;

  const apply = () => {
    const chosen = groups.filter(g => !off[g.id]);
    const named = chosen.filter(g => nameOf(g).trim());
    const found = named.map(g => ({ name: nameOf(g).trim(), qty: Math.max(0, Math.min(ITEM_MAX, countOf(g))) })).filter(x => x.qty > 0);
    const left = lootMinusGear(found, gear);
    const total = (xs: ItemQty[]) => new Map(xs.map(x => [x.name.toLowerCase(), x.qty]));
    const before = total(found), after = total(left);
    const minus = [...before].flatMap(([k, q]) => { const r = q - (after.get(k) || 0); return r > 0 ? [{ name: found.find(f => f.name.toLowerCase() === k)!.name, qty: r }] : []; });
    onLoot(mergeLoot(loot, left));
    setResult({ added: left.length, minus, unnamed: chosen.length - named.length });
  };

  if (!open) return <div><Btn size="sm" icon={ImagePlus} onClick={() => setOpen(true)}>{t('lootscan.open')}</Btn></div>;
  const a = analysis;
  const slots = (x: { slots: number | null; max: number | null } | null) => (x && x.slots !== null ? `${x.slots}/${x.max ?? '?'}` : '—');
  return (
    <section className="loot-scan stack-sm" aria-label={t('lootscan.title')} data-testid="loot-scan">
      <div className="row between">
        <b>{t('lootscan.title')}</b>
        <IconBtn ghost label={t('lootscan.close')} icon={X} onClick={() => { drop(); setOpen(false); }} />
      </div>
      <p className="meta">{t('lootscan.intro')}</p>
      <div className={cx('scan-drop', 'compact', dragging && 'over')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void add(imagesFrom(e.dataTransfer)); }}>
        <p>{t('lootscan.drop')}</p>
        <Btn size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>{t('lootscan.pick')}</Btn>
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="loot-scan-file"
          onChange={e => { void add([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      {busy && <p className="meta" role="status">{t('scan.busy')}</p>}
      {error && <p className="danger-text" role="alert">{t(error)}</p>}
      {a && a.noBackpack && <p className="danger-text" role="alert"><CircleAlert size={16} aria-hidden="true" /> {t('lootscan.noBackpack')}</p>}
      {a && !a.noBackpack && <p className="meta" data-testid="loot-scan-found">{t('lootscan.found', { bp: slots(a.backpack), qu: slots(a.quickUse) })}</p>}
      {a && a.empty && <p className="banner info" role="status" data-testid="loot-scan-empty"><Info size={16} aria-hidden="true" /> <span className="banner-text">{t('lootscan.empty')}</span></p>}
      {shot && groups.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table loot-scan-table">
              <thead><tr><th><span className="sr-only">{t('lootscan.apply')}</span></th><th><span className="sr-only">{t('scan.col.icon')}</span></th><th>{t('scan.col.item')}</th><th className="num">{t('scan.col.read')}</th></tr></thead>
              <tbody>{groups.map(g => (
                <tr key={g.id} data-group={g.id} className={off[g.id] ? 'muted' : undefined}>
                  <td><input type="checkbox" aria-label={t('lootscan.includeAria', { where: where(g) })} checked={!off[g.id]} onChange={e => setOff(p => ({ ...p, [g.id]: !e.target.checked }))} /></td>
                  <td><Thumb shot={shot} g={g} /></td>
                  <td><input className="input" list="loot-scan-names" aria-label={t('lootscan.itemAria', { where: where(g) })} placeholder={t('lootscan.namePh')} maxLength={80}
                    value={nameOf(g)} onChange={e => setNames(p => ({ ...p, [g.id]: e.target.value }))} />
                    <span className="meta"> {where(g)}{g.match.status === 'uncertain' ? ' · ' + t('scan.status.uncertain') : ''}</span></td>
                  <td className="num"><Stepper label={t('lootscan.countAria', { where: where(g) })} value={countOf(g)} min={0} max={ITEM_MAX} onChange={v => setCounts(p => ({ ...p, [g.id]: v }))} /></td>
                </tr>
              ))}</tbody>
            </table>
            <datalist id="loot-scan-names">{suggestions.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div className="row">
            <Btn size="sm" variant="primary" onClick={apply}>{t('lootscan.apply')}</Btn>
            <span className="meta">{t('lootscan.applyHint')}</span>
          </div>
        </>
      )}
      {result && (
        <p className="success" role="status" data-testid="loot-scan-result">
          {result.added ? t('lootscan.applied', { count: result.added }) : t('lootscan.nothingLeft')}
          {result.minus.length > 0 && <> {t('lootscan.minusGear', { list: itemsText(result.minus) })}</>}
          {result.unnamed > 0 && <> {t('lootscan.unnamed', { count: result.unnamed })}</>}
        </p>
      )}
    </section>
  );
}
