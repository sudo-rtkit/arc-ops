/* Inventory → „Ze snímku“: hráč vloží vlastní snímky obrazovky INVENTORY, aplikace přečte STASH a po kontrole
   v tabulce zapíše materiály a mince. Snímky zůstávají jen v paměti této stránky; uloží se jen otisky ikon. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, ImagePlus, Info, Trash2, Upload } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, Check, Empty, Panel, Select, Stepper, cx } from '../ui/components';
import { fmt } from '../ui/format';
import { decodeImage, imagesFrom, type DecodeError } from '../ui/imageFile';
import { readScreenshot, type ScreenRead } from '../core/vision/read';
import { analyzeShots, defaultTarget, itemCategoryFor, type ImportAnalysis, type ImportGroup, type ImportWarning, type Target, type VisionSummary } from '../core/visionImport';
import { LIMITS } from '../core/state';
import { catalogItems, matchContext } from '../core/catalog';
import { ITEM_CATEGORIES, itemKey, type ItemCategory } from '../core/types';
import { catKey } from './Equipment';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

interface Shot { id: number; name: string; bitmap: ImageBitmap; read: ScreenRead }
const NEW = '\u0000new';
const ITEM = '\u0000item';
const SKIP = '';

const WARN_KEY: Partial<Record<ImportWarning, Key>> = {
  noInventory: 'scan.warn.noInventory', noStash: 'scan.warn.noStash', scaleOdd: 'scan.warn.scaleOdd',
  countUnreadable: 'scan.warn.countUnreadable', noOverlap: 'scan.warn.noOverlap', differentState: 'scan.warn.differentState',
  headerUnreadable: 'scan.warn.headerUnreadable', occluded: 'scan.warn.occluded',
};
/* Nejvýš tolik snímků najednou (stejně jako dávka stashe v hubu). */
const MAX_SHOTS = 12;
const ERR_KEY: Record<DecodeError, Key> = { notImage: 'scan.err.notImage', tooBig: 'scan.err.tooBig', decode: 'scan.err.decode' };

/* Stav rozpoznání políčka → barva rámečku v náhledu. */
const tone = (g: ImportGroup): 'success' | 'warning' | 'danger' =>
  g.match.status === 'unknown' ? 'danger' : g.match.status === 'uncertain' || !g.countSure ? 'warning' : 'success';
const TONE_VAR = { success: '--success', warning: '--warning', danger: '--danger' } as const;
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';

/* Náhled STASH ze snímku s vyznačenými políčky. */
function Preview({ shot, index, groups }: { shot: Shot; index: number; groups: ImportGroup[] }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const stash = shot.read.panels.find(p => p.panel === 'stash');
  useEffect(() => {
    const c = ref.current;
    if (!c || !stash) return;
    const g = stash.grid;
    /* od nadpisu STASH po spodní okraj posledního celého řádku (useknutý řádek se neukazuje) */
    const x0 = Math.max(0, g.x - g.pitchX * 0.3), y0 = Math.max(0, g.y - g.pitchY * 1.3);
    const w = g.cols * g.pitchX + g.pitchX * 0.4, h = g.y - y0 + (g.rows - 1) * g.pitchY + g.cell + 4;
    const scale = Math.min(1, 320 / w);
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(shot.bitmap, x0, y0, w, h, 0, 0, c.width, c.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar('--text-muted');
    ctx.setLineDash([4, 3]);
    for (const h of stash.hidden) {
      const x = g.x + h.col * g.pitchX, y = g.y + h.row * g.pitchY;
      ctx.strokeRect((x - x0) * scale + 1, (y - y0) * scale + 1, g.cell * scale - 2, g.cell * scale - 2);
    }
    ctx.setLineDash([]);
    for (const gr of groups) for (const cell of gr.cells) {
      if (cell.shot !== index) continue;
      const b = stash.cells.find(x => x.row === cell.row && x.col === cell.col)?.box;
      if (!b) continue;
      ctx.strokeStyle = cssVar(TONE_VAR[tone(gr)]);
      ctx.strokeRect((b.x - x0) * scale + 1, (b.y - y0) * scale + 1, b.w * scale - 2, b.h * scale - 2);
    }
  }, [shot, stash, groups, index]);
  if (!stash) return <div className="scan-shot"><span className="meta">{shot.name}</span><p className="danger-text">{t('scan.warn.noInventory')}</p></div>;
  return (
    <figure className="scan-shot">
      <canvas ref={ref} role="img" aria-label={t('scan.previewAria', { n: index + 1 })} />
      <figcaption className="meta">{t('scan.shotN', { n: index + 1 })} · {shot.name}</figcaption>
    </figure>
  );
}

/* Ikona skupiny vyříznutá z hráčova snímku (jen pro rozpoznání v tabulce, neukládá se). */
function Thumb({ shot, group }: { shot: Shot | undefined; group: ImportGroup }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = group.cells[0];
  const box = shot?.read.panels.find(p => p.panel === 'stash')?.cells.find(x => x.row === cell.row && x.col === cell.col)?.box;
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx || !shot || !box) return;
    c.width = 48; c.height = 48;
    ctx.drawImage(shot.bitmap, box.x, box.y, box.w, box.h, 0, 0, 48, 48);
  }, [shot, box]);
  return <canvas ref={ref} className="scan-thumb" width={48} height={48} aria-hidden="true" />;
}

function Warnings({ a }: { a: ImportAnalysis }) {
  const t = useT();
  const list = a.warnings.filter(w => WARN_KEY[w]);
  if (!list.length) return null;
  return <>{list.map(w => (
    <div key={w} className={cx('banner', w === 'noInventory' || w === 'noStash' ? 'danger' : w === 'scaleOdd' ? 'info' : 'amber')} role="status">
      {w === 'scaleOdd' ? <Info size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
      <span className="banner-text">{t(WARN_KEY[w]!)}</span>
    </div>
  ))}</>;
}

export default function ScreenImport() {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Key[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [itemCats, setItemCats] = useState<Record<string, ItemCategory>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [coinsOn, setCoinsOn] = useState(true);
  const [zeroOn, setZeroOn] = useState(false);
  const [done, setDone] = useState<VisionSummary | null>(null);
  const [writing, setWriting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const matNames = useMemo(() => d.materials.map(m => m.name).sort((a, b) => a.localeCompare(b)), [d.materials]);
  /* Naučené otisky se pro tabulku vezmou ve chvíli vložení snímků (zápis je změní, tabulka už je pak hotová). */
  const learnedRef = useRef(s.vision.learned);
  /* Katalog (otisky ikon a názvy) a evidované předměty pro rozpoznání a přiřazení názvu z tooltipu. */
  const itemNamesKnown = useMemo(() => [...new Set(Object.values(s.items).map(x => x.name))], [s.items]);
  const ctxRef = useRef<ReturnType<typeof matchContext> | null>(null);
  const analysis = useMemo(() => {
    if (!shots.length) return null;
    ctxRef.current ??= matchContext(matNames, itemNamesKnown);
    return analyzeShots(shots.map(x => x.read), learnedRef.current, ctxRef.current);
  }, [shots]);
  const itemSuggestions = useMemo(() => [...new Set([...catalogItems().filter(x => x.category !== 'material').map(x => x.name), ...itemNamesKnown])], [itemNamesKnown]);

  const addFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setDone(null);
    learnedRef.current = s.vision.learned;
    ctxRef.current = null;
    const errs: Key[] = [], added: Shot[] = [];
    /* 0.16.1: každý snímek drží v paměti náhled (ImageBitmap), proto nejvýš MAX_SHOTS najednou */
    const room = MAX_SHOTS - shotsRef.current.length;
    for (const f of files) {
      if (added.length >= room) { errs.push('scan.err.tooMany'); break; }
      const r = await decodeImage(f);
      if (typeof r === 'string') { errs.push(ERR_KEY[r]); continue; }
      /* Zpracování trvá desítky milisekund; krátká pauza nechá překreslit stav „Zpracovávám…“. */
      await new Promise(res => setTimeout(res, 0));
      added.push({ id: nextId.current++, name: f.name || t('scan.pasted'), bitmap: r.bitmap, read: readScreenshot(r.img) });
    }
    setErrors(errs);
    setShots(prev => [...prev, ...added]);
    setBusy(false);
  }, [s.vision.learned, t]);

  /* Ctrl+V kdekoli na stránce, dokud je záložka otevřená (jen v okně aplikace, žádná globální zkratka). */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  /* Snímky se při odchodu ze záložky zahodí. */
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => { for (const x of shotsRef.current) x.bitmap.close(); }, []);

  const clear = () => {
    for (const x of shots) x.bitmap.close();
    setShots([]); setTargets({}); setNewNames({}); setItemNames({}); setItemCats({}); setCounts({}); setErrors([]); setZeroOn(false); setCoinsOn(true);
  };

  const targetOf = (g: ImportGroup): Target => {
    const v = targets[g.id];
    const def = defaultTarget(g, matNames, s.items);
    if (v === undefined) {
      if (def.kind === 'item') {
        const name = itemNames[g.id] ?? def.name;
        return { kind: 'item', name: name.trim(), category: itemCats[g.id] ?? itemCategoryFor(name.trim(), g, s.items) };
      }
      if (def.kind === 'newMaterial') return { kind: 'newMaterial', name: (newNames[g.id] ?? def.name).trim() };
      return def;
    }
    if (v === SKIP) return { kind: 'skip' };
    if (v === NEW) return { kind: 'newMaterial', name: (newNames[g.id] ?? (def.kind !== 'skip' ? def.name : '')).trim() };
    if (v === ITEM) {
      const name = (itemNames[g.id] ?? (def.kind !== 'skip' ? def.name : '')).trim();
      return { kind: 'item', name, category: itemCats[g.id] ?? itemCategoryFor(name, g, s.items) };
    }
    return { kind: 'material', name: v };
  };
  const countOf = (g: ImportGroup) => counts[g.id] ?? g.count ?? 0;
  const selectValue = (g: ImportGroup) => { const tg = targetOf(g); return tg.kind === 'skip' ? SKIP : tg.kind === 'newMaterial' ? NEW : tg.kind === 'item' ? ITEM : tg.name; };

  const a = analysis;
  const rows = a?.groups ?? [];
  const writeRows = rows.map(g => ({ group: g, target: targetOf(g), count: countOf(g) }));
  const invalidNew = writeRows.some(r => (r.target.kind === 'newMaterial' || r.target.kind === 'item') && !r.target.name);
  const materialsCount = new Set(writeRows.flatMap(r => (r.target.kind === 'skip' ? [] : [r.target.name]))).size;
  const storedOf = (g: ImportGroup, tg: Target): number | null =>
    tg.kind === 'skip' ? null : tg.kind === 'item' ? s.items[itemKey(tg.name, g.tier ?? undefined)]?.count || 0 : s.inventory[tg.name] || 0;
  const coins = a?.coins ?? null;
  const canZero = !!a?.canZero;

  const write = async () => {
    if (!a) return;
    setWriting(true);
    const sum = await actions.importFromScreens({
      rows: writeRows, coins: coinsOn && coins !== null ? coins : null, zeroMissing: zeroOn && canZero, canZero, profile: a.profile,
    });
    setWriting(false);
    if (sum) { setDone(sum); clear(); }
  };

  const options = [
    { value: SKIP, label: t('scan.target.skip') },
    { value: NEW, label: t('scan.target.new') },
    { value: ITEM, label: t('scan.target.item') },
    ...matNames.map(n => ({ value: n, label: n })),
  ];

  return (
    <div className="stack">
      <Panel title={t('scan.title')}>
        <p className="secondary-text">{t('scan.intro')}</p>
        <div className={cx('scan-drop', dragging && 'over')} data-testid="scan-drop"
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void addFiles(imagesFrom(e.dataTransfer)); }}>
          <ImagePlus size={28} aria-hidden="true" />
          <p>{t('scan.dropHint')}</p>
          <div className="row">
            <Btn icon={Upload} onClick={() => fileRef.current?.click()}>{t('scan.pick')}</Btn>
            {shots.length > 0 && <Btn variant="ghost" icon={Trash2} onClick={clear}>{t('scan.clear')}</Btn>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden data-testid="scan-file"
            onChange={e => { void addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
        </div>
        <p className="meta">{t('scan.privacy')}</p>
        {busy && <p className="meta" role="status">{t('scan.busy')}</p>}
        {errors.map((k, i) => <p key={i} className="danger-text" role="alert">{t(k)}</p>)}
      </Panel>

      {done && (
        <Panel title={t('scan.doneTitle')}>
          <div className="banner" role="status"><CircleCheck size={18} aria-hidden="true" className="success" />
            <span className="banner-text" data-testid="scan-done">
              {done.coins !== null ? t('scan.doneCoins', { count: done.materials, coins: done.coins }) : t('scan.done', { count: done.materials })}
              {done.items > 0 && <> · {t('scan.doneItems', { count: done.items })}</>}
              {done.newMaterials > 0 && <> · {t('scan.doneNew', { count: done.newMaterials })}</>}
              {done.zeroed > 0 && <> · {t('scan.doneZeroed', { count: done.zeroed })}</>}
              {done.other > 0 && <> · {t('scan.doneOther', { count: done.other })}</>}
              {done.learned > 0 && <> · {t('scan.doneLearned', { count: done.learned })}</>}
            </span>
          </div>
          <div className="row"><a className="link-btn" href="#inventory">{t('scan.backToStock')}</a>{done.items > 0 && <a className="link-btn" href="#inventory/equipment">{t('scan.backToEquipment')}</a>}</div>
        </Panel>
      )}

      {a && (
        <Panel title={t('scan.reviewTitle')} flush>
          <div className="stack" style={{ padding: '0 16px' }}>
            <div className="scan-shots">{shots.map((x, i) => <Preview key={x.id} shot={x} index={i} groups={rows} />)}</div>
            <p className="meta scan-legend"><span className="dot success" /> {t('scan.legend.known')} <span className="dot warning" /> {t('scan.legend.unsure')} <span className="dot danger" /> {t('scan.legend.unknown')}</p>
            {a.headerSlots !== null && (
              <p data-testid="scan-checksum" className={a.checksumOk ? 'success' : 'amber'}>
                {a.checksumOk ? <CircleCheck size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}{' '}
                {t('scan.found', { found: a.found, total: a.headerSlots })}
                {a.hidden > 0 && <span className="meta" data-testid="scan-hidden"> · {t('scan.hidden', { count: a.hidden })}</span>}
                {!a.checksumOk && <span className="meta"> · {t('scan.checksumHint')}</span>}
              </p>
            )}
            <Warnings a={a} />
          </div>
          {rows.length === 0 ? <Empty>{t('scan.noCells')}</Empty> : (
            <div className="table-wrap tall">
              <table className="table scan-table">
                <thead><tr>
                  <th><span className="sr-only">{t('scan.col.icon')}</span></th><th>{t('scan.col.item')}</th>
                  <th className="num">{t('scan.col.read')}</th><th className="num">{t('scan.col.stored')}</th>
                  <th className="num">{t('scan.col.change')}</th><th>{t('scan.col.conf')}</th>
                </tr></thead>
                <tbody>{rows.map(g => {
                  const tg = targetOf(g), n = countOf(g);
                  const stored = storedOf(g, tg);
                  const diff = stored === null ? null : n - stored;
                  const where = g.cells.map(c => `${c.merged + 1}/${c.col + 1}`).join(', ');
                  return (
                    <tr key={g.id} data-group={g.id} data-cells={g.cells.map(c => `${c.merged},${c.col}`).join(' ')}>
                      <td><Thumb shot={shots[g.cells[0].shot]} group={g} /></td>
                      <td>
                        <div className="scan-item">
                          <Select label={t('scan.col.itemAria', { where })} hideLabel value={selectValue(g)} options={options}
                            onChange={v => setTargets(p => ({ ...p, [g.id]: v }))} />
                          {tg.kind === 'newMaterial' && (
                            <input className="input" aria-label={t('scan.newName')} placeholder={t('scan.newName')} maxLength={80}
                              value={newNames[g.id] ?? tg.name} onChange={e => setNewNames(p => ({ ...p, [g.id]: e.target.value }))} />
                          )}
                          {tg.kind === 'item' && (
                            <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                              <input className="input grow" list="scan-item-names" aria-label={t('scan.itemName')} placeholder={t('scan.itemName')} maxLength={120}
                                value={itemNames[g.id] ?? tg.name} onChange={e => setItemNames(p => ({ ...p, [g.id]: e.target.value }))} />
                              <Select label={t('scan.itemCat')} hideLabel value={tg.category} onChange={v => setItemCats(p => ({ ...p, [g.id]: v as ItemCategory }))}
                                options={ITEM_CATEGORIES.map(c => ({ value: c, label: t(catKey(c)) }))} />
                              {g.tier && <Badge>{g.tier}</Badge>}
                            </div>
                          )}
                          <span className="meta">{t('scan.cells', { count: g.cells.length, where })}</span>
                        </div>
                      </td>
                      <td className="num"><Stepper label={t('scan.countAria', { where })} value={n} min={0} max={LIMITS.inventory[1]} onChange={v => setCounts(p => ({ ...p, [g.id]: v }))} /></td>
                      <td className="num">{stored === null ? <span className="muted">—</span> : fmt(stored)}</td>
                      <td className={cx('num', diff ? (diff > 0 ? 'success' : 'amber') : 'muted')}>{diff === null ? '—' : diff > 0 ? '+' + fmt(diff) : fmt(diff)}</td>
                      <td>
                        <Badge tone={g.match.status === 'known' ? 'success' : g.match.status === 'uncertain' ? 'amber' : 'danger'}>{t(`scan.status.${g.match.status}` as Key)}</Badge>
                        {g.match.source && g.match.status !== 'unknown' && <span className="meta"> {t(`scan.source.${g.match.source}` as Key)}</span>}
                        {!g.countSure && <> <Badge tone="amber">{t('scan.countCheck')}</Badge></>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <datalist id="scan-item-names">{itemSuggestions.map(n => <option key={n} value={n} />)}</datalist>
            </div>
          )}
          <div className="stack" style={{ padding: '0 16px 16px' }}>
            <Check checked={coinsOn && coins !== null} disabled={coins === null} onChange={setCoinsOn} note={coins === null ? t('scan.coinsNone') : undefined}>
              {coins !== null ? t('scan.optCoins', { coins }) : t('scan.optCoinsOff')}
            </Check>
            <Check checked={zeroOn && canZero} disabled={!canZero} onChange={v => setZeroOn(v && canZero)} note={canZero ? t('scan.optZeroNote') : t('scan.optZeroOff')}>
              {t('scan.optZero')}
            </Check>
            <div className="row">
              <Btn variant="primary" disabled={writing || invalidNew || (!materialsCount && !(coinsOn && coins !== null))} onClick={() => void write()}>{t('scan.write')}</Btn>
              <span className="meta">{t('scan.writeHint')}</span>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
