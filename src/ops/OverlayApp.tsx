/* Overlay „Polní konzole“ (milník 5, návrh docs/design/overlay): teplý taktický HUD nad hrou. Ukazuje jen data
   aplikace: přehled, dostupné úkoly, nákupy a výsledek snímku ke schválení. Stav je kopie z hlavního okna
   (store tohoto okna se nikdy nespustí, takže nic neukládá); zápisy jdou do hlavního okna jako akce. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { app, useAppState, useDerived } from '../store';
import { createBus } from './bus';
import { createNative } from './native';
import type { BatchView, OverlayView } from './hub';
import { OpsCanvas } from './OpsCanvas';
import { hotkeyLabel } from './hotkey';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt, fmtTime } from '../ui/format';
import { cx } from '../ui/components';
import { formForLevel, resolveOutfit } from '../core/ops';
import { QUESTS, locText, questName, questStatus } from '../core/quests';
import { catalogByName, matchContext } from '../core/catalog';
import { cleanupRows, cleanupSummary } from '../core/advice';
import { analyzeShots, defaultTarget, type ImportGroup, type Target, type VisionApply, type VisionSummary } from '../core/visionImport';
import { MAPS } from '../core/data/maps';
import { LIMITS } from '../core/state';
import { itemKey } from '../core/types';

const bus = createBus('overlay');
const native = createNative();

type Tab = 'overview' | 'quests' | 'shop' | 'scan';
const TABS: Tab[] = ['overview', 'quests', 'shop', 'scan'];
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const rarityOf = (name: string): string => { const r = catalogByName(name)?.rarity; return r && (RARITY as readonly string[]).includes(r) ? r : 'unknown'; };
const abbr = (name: string): string => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

function ItemMark({ name }: { name: string }) {
  const t = useT();
  const r = rarityOf(name);
  return (
    <div className="ov-item">
      <span className={cx('ov-abbr', 'r-' + r)} aria-hidden="true">{abbr(name)}</span>
      <span><b>{name}</b><span className="ov-rarity"><i className={cx('ov-dot', 'r-' + r)} />{t(`ops.rarity.${r}` as Key)}</span></span>
    </div>
  );
}

/* ----- Přehled ----- */
function Overview({ batch, go }: { batch: BatchView; go: (tab: Tab) => void }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const pcs = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  const active = QUESTS.filter(q => questStatus(q, s.quests.done) === 'active').length;
  const shopMissing = d.shop.filter(r => r.missing > 0);
  const missing = shopMissing.reduce((a, r) => a + r.missing, 0);
  const clean = cleanupSummary(cleanupRows(d.advice.values()));
  const steps: { tag: string; tone: string; title: string; sub: string; action: () => void; label: string }[] = [];
  const open = (route: string) => () => bus.send('main', 'open', { route });
  if (batch.shots.length) steps.push({ tag: t('ops.ov.tag.review'), tone: 'muted', title: t('ops.ov.step.scan'), sub: t('ops.ov.step.scanSub', { count: batch.shots.length }), action: () => go('scan'), label: t('ops.ov.tab.scan') });
  for (const n of d.needs.filter(x => !x.block && x.ready >= 1).slice(0, 2)) steps.push({ tag: t('ops.ov.tag.ready'), tone: 'ok', title: t('ops.ov.step.upgrade', { name: n.station.name, level: n.level }), sub: t('ops.ov.step.upgradeSub'), action: open('workshop'), label: t('ops.ov.openApp') });
  const short = d.needs.find(x => !x.block && x.ready < 1);
  if (short) {
    const lack = short.mats.map(([m, n]) => [m, Math.max(0, n - (s.inventory[m] || 0))] as const).filter(([, n]) => n > 0);
    const total = lack.reduce((a, [, n]) => a + n, 0);
    steps.push({ tag: t('ops.ov.tag.missing', { n: total }), tone: 'warn', title: t('ops.ov.step.missing', { name: short.station.name, level: short.level }), sub: t('ops.ov.step.missingSub', { count: total, mats: lack.slice(0, 3).map(([m, n]) => `${m} ${n}`).join(', ') }), action: () => go('shop'), label: t('ops.ov.tab.shop') });
  }
  if (clean.items > 0) steps.push({ tag: t('ops.ov.tag.cleanup'), tone: 'muted', title: t('ops.ov.step.cleanup'), sub: t('ops.ov.step.cleanupSub', { sell: clean.sell, recycle: clean.recycle, slots: clean.slots }), action: open('inventory/cleanup'), label: t('ops.ov.openApp') });
  const note = s.steps.find(x => !x.done);
  const form = formForLevel(s.profile.level);
  return (
    <div className="ov-body-grid">
      <div className="ov-main">
        <div className="ov-head"><h2>{t('ops.ov.ready')}</h2><p>{t('ops.ov.readySub')}</p></div>
        <div className="ov-kpis">
          <div className="ov-kpi accent"><span>{t('ops.ov.kpi.stock')}</span><b data-testid="ov-stock">{fmt(pcs)} <small>{t('ops.ov.pcs')}</small></b><em>{t('ops.ov.kpi.stockSub', { kinds: Object.keys(s.inventory).length, items: Object.keys(s.items).length })}</em></div>
          <div className="ov-kpi"><span>{t('ops.ov.kpi.coins')}</span><b data-testid="ov-coins">{fmt(s.profile.coins)}</b><em>{t('ops.ov.kpi.coinsSub', { level: s.profile.level, rounds: s.profile.rounds })}</em></div>
          <div className="ov-kpi"><span>{t('ops.ov.kpi.quests')}</span><b>{fmt(active)}</b><em>{t('ops.ov.kpi.questsSub', { done: d.quests.done, total: d.quests.total })}</em></div>
          <div className="ov-kpi"><span>{t('ops.ov.kpi.missing')}</span><b>{fmt(missing)} <small>{t('ops.ov.pcs')}</small></b><em>{t('ops.ov.kpi.missingSub', { count: shopMissing.length })}</em></div>
        </div>
        <section className="ov-card">
          <header><h3>{t('ops.ov.next')}</h3><span className="ov-stencil">{t('ops.ov.nextTag', { n: String(steps.length).padStart(2, '0') })}</span></header>
          {steps.length === 0 ? <p className="ov-muted">{t('ops.ov.step.none')}</p> : (
            <ul className="ov-steps">{steps.slice(0, 4).map((x, i) => (
              <li key={i}>
                <span className={cx('ov-tag', x.tone)}>{x.tag}</span>
                <span className="grow"><b>{x.title}</b><em>{x.sub}</em></span>
                <button type="button" className="ov-link" onClick={x.action}>{x.label} →</button>
              </li>
            ))}</ul>
          )}
        </section>
      </div>
      <aside className="ov-rail">
        <section className="ov-card ov-opscard">
          <OpsCanvas level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} scale={2} label="Ops" />
          <span className="ov-stencil">{t('ops.ov.opsLevel', { level: s.profile.level })}</span>
          <b>{form.name[t.lang]}</b>
        </section>
        <section className="ov-card ov-note">
          <span className="ov-stencil">{t('ops.ov.note')}</span>
          {note ? <><blockquote>„{note.text}“</blockquote><em>{t('ops.ov.noteFrom')}</em></> : <p className="ov-muted">{t('ops.ov.noteEmpty')}</p>}
        </section>
      </aside>
    </div>
  );
}

/* ----- Úkoly ----- */
function Quests() {
  const t = useT();
  const s = useAppState();
  const list = useMemo(() => QUESTS.filter(q => questStatus(q, s.quests.done) === 'active').sort((a, b) => questName(a, t.lang).localeCompare(questName(b, t.lang))), [s.quests.done, t.lang]);
  const mapName = (id: string) => MAPS.find(m => m.id === id)?.name ?? id;
  return (
    <div className="ov-single">
      <div className="ov-head"><h2>{t('ops.ov.q.title')}</h2><p>{t('ops.ov.q.sub')}</p></div>
      {list.length === 0 ? <p className="ov-muted">{t('ops.ov.q.empty')}</p> : (
        <ol className="ov-quests">{list.map((q, i) => {
          const name = questName(q, t.lang);
          const need = [...q.deliver, ...q.questItems];
          return (
            <li key={q.id} className="ov-card ov-quest" data-quest={q.id}>
              <span className="ov-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="grow">
                <b>{name}</b>
                <em>{t('ops.ov.q.trader', { name: q.trader })}{q.maps.length ? ' · ' + q.maps.map(mapName).join(', ') : ''}</em>
                <ul>{q.objectives.slice(0, 2).map((o, j) => <li key={j}>{locText(o, t.lang)}</li>)}</ul>
                {q.objectives.length > 2 && <em>{t('ops.ov.q.more', { count: q.objectives.length - 2 })}</em>}
                {need.length > 0 && <p><span className="ov-stencil">{t('ops.ov.q.deliver')}</span> {need.map(([m, n]) => `${m} ${fmt(s.inventory[m] || s.items[m]?.count || 0)}/${fmt(n)}`).join(' · ')}</p>}
                {q.rewards.length > 0 && <p><span className="ov-stencil">{t('ops.ov.q.rewards')}</span> {q.rewards.map(([m, n]) => `${m} ×${n}`).join(' · ')}{q.xp ? ` · ${fmt(q.xp)} XP` : ''}</p>}
              </div>
              <button type="button" className="ov-btn" aria-label={t('ops.ov.q.doneAria', { name })} onClick={() => bus.send('main', 'questSet', { id: q.id, done: true })}>{t('ops.ov.q.done')}</button>
            </li>
          );
        })}</ol>
      )}
    </div>
  );
}

/* ----- Nákupy ----- */
function Shop() {
  const t = useT();
  const d = useDerived();
  const [all, setAll] = useState(false);
  const missing = d.shop.filter(r => r.missing > 0);
  const rows = all ? d.shop : missing;
  const total = missing.reduce((a, r) => a + r.missing, 0);
  const questLabel = t('quests.use', { name: '' }).trim();
  const fromQuests = missing.filter(r => r.uses.some(u => questLabel && u.startsWith(questLabel))).reduce((a, r) => a + r.missing, 0);
  return (
    <div className="ov-body-grid">
      <div className="ov-main">
        <div className="ov-head row-between"><div><h2>{t('ops.ov.s.title')}</h2><p>{t('ops.ov.s.sub')}</p></div><span className="ov-chip">{t('ops.ov.s.total', { count: total })}</span></div>
        <section className="ov-card">
          <div className="ov-filter" role="group" aria-label={t('ops.ov.s.filter')}>
            <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>{t('ops.ov.s.missingOnly', { count: missing.length })}</button>
            <button type="button" aria-pressed={all} onClick={() => setAll(true)}>{t('ops.ov.s.all', { count: d.shop.length })}</button>
          </div>
          {rows.length === 0 ? <p className="ov-muted">{t('ops.ov.s.empty')}</p> : (
            <table className="ov-table">
              <thead><tr><th>{t('ops.ov.s.col.item')}</th><th className="num">{t('ops.ov.s.col.have')}</th><th className="num">{t('ops.ov.s.col.missing')}</th><th>{t('ops.ov.s.col.why')}</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.mat} data-mat={r.mat}>
                  <td><ItemMark name={r.mat} /></td>
                  <td className="num mono">{fmt(r.have)} / {fmt(r.need)}</td>
                  <td className={cx('num mono', r.missing > 0 && 'warn')}>{fmt(r.missing)}</td>
                  <td className="ov-why">{r.uses.join(', ')}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <p className="ov-muted">{t('ops.ov.s.hint')}</p>
        </section>
      </div>
      <aside className="ov-rail">
        <section className="ov-card"><h3>{t('ops.ov.s.railHead')}</h3><p className="ov-quote">{t('ops.ov.s.railText')}</p></section>
        <section className="ov-card">
          <span className="ov-stencil">{t('ops.ov.s.railTitle')}</span>
          <p><b>{t('ops.ov.s.railStations')}</b><em>{t('ops.ov.s.railCount', { count: total - fromQuests })}</em></p>
          <p><b>{t('ops.ov.s.railQuests')}</b><em>{t('ops.ov.s.railCount', { count: fromQuests })}</em></p>
        </section>
      </aside>
    </div>
  );
}

/* ----- Ze snímku ----- */
type RowKind = 'known' | 'uncertain' | 'unknown';
interface Row { g: ImportGroup; target: Target; kind: RowKind; count: number; selected: boolean; stored: number | null; name: string }

function doneText(t: TFn, d: VisionSummary): string {
  const parts = [d.coins !== null ? t('scan.doneCoins', { count: d.materials, coins: d.coins }) : t('scan.done', { count: d.materials })];
  if (d.items > 0) parts.push(t('scan.doneItems', { count: d.items }));
  if (d.newMaterials > 0) parts.push(t('scan.doneNew', { count: d.newMaterials }));
  if (d.learned > 0) parts.push(t('scan.doneLearned', { count: d.learned }));
  return parts.join(' · ');
}

function Scan({ batch, hotkey, go }: { batch: BatchView; hotkey: string; go: (tab: Tab) => void }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const key = batch.shots.map(x => x.id).join(',');
  const matNames = useMemo(() => d.materials.map(m => m.name), [d.materials]);
  const analysis = useMemo(() => {
    if (!batch.shots.length) return null;
    const names = [...new Set(Object.values(s.items).map(x => x.name))];
    return analyzeShots(batch.shots.map(x => x.read), s.vision.learned, matchContext(matNames, names));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [coinsOn, setCoinsOn] = useState(true);
  const [writing, setWriting] = useState(false);
  const [done, setDone] = useState<VisionSummary | null>(null);
  useEffect(() => { setSel({}); setOk({}); setCounts({}); setCoinsOn(true); if (key) setDone(null); }, [key]);
  useEffect(() => bus.on('imported', p => { setWriting(false); const sum = (p as { summary: VisionSummary | null }).summary; if (sum) setDone(sum); }), []);

  const rows: Row[] = (analysis?.groups ?? []).map(g => {
    const target = defaultTarget(g, matNames, s.items);
    const kind: RowKind = target.kind === 'skip' ? 'unknown' : g.match.status === 'known' && g.countSure ? 'known' : 'uncertain';
    const selected = kind === 'unknown' ? false : kind === 'known' ? sel[g.id] ?? true : !!ok[g.id] && (sel[g.id] ?? true);
    const stored = target.kind === 'skip' ? null : target.kind === 'item' ? s.items[itemKey(target.name, g.tier ?? undefined)]?.count || 0 : s.inventory[target.name] || 0;
    return { g, target, kind, count: counts[g.id] ?? g.count ?? 0, selected, stored, name: target.kind === 'skip' ? t('ops.ov.c.unknownName') : target.name };
  });
  const chosen = rows.filter(r => r.selected);
  const pcs = chosen.reduce((a, r) => a + r.count, 0);
  const coins = analysis?.coins ?? null;

  const write = () => {
    if (!analysis || !chosen.length) return;
    const input: VisionApply = {
      rows: rows.map(r => ({ group: r.g, target: r.selected ? r.target : { kind: 'skip' }, count: r.count })),
      coins: coinsOn && coins !== null ? coins : null, zeroMissing: false, canZero: analysis.canZero, profile: analysis.profile,
    };
    setWriting(true);
    bus.send('main', 'import', { input });
  };
  const newShot = () => { void native.captureNow(); };

  if (done && !batch.shots.length) {
    return (
      <div className="ov-single">
        <div className="ov-head"><h2>{t('ops.ov.c.title')}</h2></div>
        <div className="ov-banner ok" role="status" data-testid="ov-done">{doneText(t, done)}</div>
        <div className="row"><button type="button" className="ov-btn" onClick={() => go('overview')}>{t('ops.ov.c.back')}</button><button type="button" className="ov-btn" onClick={newShot} disabled={!native.available}>{t('ops.ov.c.new')}</button></div>
      </div>
    );
  }
  if (!batch.shots.length) {
    const nothing = batch.emptyAt > 0, failed = !!batch.failed;
    return (
      <div className="ov-single">
        <div className="ov-head row-between"><div><h2>{nothing ? t('ops.ov.c.nothing') : t('ops.ov.c.empty')}</h2></div>
          <button type="button" className="ov-btn primary" onClick={newShot} disabled={!native.available}>{nothing || failed ? t('ops.ov.c.retry') : t('ops.ov.c.new')}</button></div>
        {nothing && <div className="ov-banner danger" role="alert" data-testid="ov-nothing">{t('ops.ov.c.nothingText')}</div>}
        {failed && <div className="ov-banner danger" role="alert">{t('ops.ov.c.failed')}</div>}
        <p className="ov-muted">{hotkey ? t('ops.ov.c.emptyHint', { key: hotkeyLabel(hotkey) }) : t('ops.ov.c.emptyHintNoKey')}</p>
        {!native.available && <p className="ov-muted">{t('ops.ov.c.unsupported')}</p>}
        {nothing && <button type="button" className="ov-btn" onClick={() => go('overview')}>{t('ops.ov.c.back')}</button>}
      </div>
    );
  }
  const last = batch.shots[batch.shots.length - 1].at;
  return (
    <div className="ov-body-grid">
      <div className="ov-main">
        <div className="ov-head row-between">
          <div><h2>{t('ops.ov.c.title')}</h2><p>{t('ops.ov.c.sub', { count: batch.shots.length, time: fmtTime(last) })}</p></div>
          <div className="row"><button type="button" className="ov-btn" onClick={() => bus.send('main', 'batchClear')}>{t('ops.ov.c.discard')}</button><button type="button" className="ov-btn" onClick={newShot} disabled={!native.available}>{t('ops.ov.c.new')}</button></div>
        </div>
        <div className="ov-banner warn">{t('ops.ov.c.banner')}</div>
        {analysis && analysis.warnings.filter(w => w !== 'scaleOdd').length > 0 && (
          <p className="ov-muted" aria-label={t('ops.ov.c.warnings')}>{analysis.warnings.filter(w => w !== 'scaleOdd').map(w => t(`scan.warn.${w}` as Key)).join(' ')}</p>
        )}
        <section className="ov-card ov-review">
          <table className="ov-table">
            <thead><tr><th><span className="sr-only">{t('ops.ov.c.rowAria', { name: '' })}</span></th><th>{t('ops.ov.c.col.item')}</th><th className="num">{t('ops.ov.c.col.count')}</th><th>{t('ops.ov.c.col.status')}</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.g.id} className={cx(r.kind === 'uncertain' && 'unsure', r.kind === 'unknown' && 'off')} data-kind={r.kind}>
                <td><input type="checkbox" checked={r.selected} disabled={r.kind === 'unknown' || (r.kind === 'uncertain' && !ok[r.g.id])}
                  aria-label={t('ops.ov.c.rowAria', { name: r.name })} onChange={e => setSel(p => ({ ...p, [r.g.id]: e.target.checked }))} /></td>
                <td>
                  {r.kind === 'unknown' ? <div><b>{r.name}</b><em className="ov-muted">{t('ops.ov.c.unknownSub')}</em></div> : <ItemMark name={r.name} />}
                  {r.target.kind === 'newMaterial' && <em className="ov-muted"> · {t('ops.ov.c.newMat')}</em>}
                  {r.target.kind === 'item' && <em className="ov-muted"> · {t('ops.ov.c.item')}</em>}
                  {r.stored !== null && <em className="ov-muted"> · {t('ops.ov.c.stored', { n: r.stored })}</em>}
                  {r.kind === 'uncertain' && !ok[r.g.id] && <button type="button" className="ov-link" onClick={() => setOk(p => ({ ...p, [r.g.id]: true }))}>{t('ops.ov.c.confirm')}</button>}
                </td>
                <td className="num">{r.kind === 'unknown' ? '—' : (
                  <input className="ov-count mono" type="number" min={0} max={LIMITS.inventory[1]} value={r.count} aria-label={t('ops.ov.c.countAria', { name: r.name })}
                    onChange={e => { const v = Math.max(0, Math.min(LIMITS.inventory[1], Math.round(Number(e.target.value) || 0))); setCounts(p => ({ ...p, [r.g.id]: v })); if (r.kind === 'uncertain') setOk(p => ({ ...p, [r.g.id]: false })); }} />
                )}</td>
                <td><span className={cx('ov-tag', r.kind === 'known' ? 'ok' : r.kind === 'uncertain' ? 'warn' : 'muted')}>{r.kind === 'known' ? '✓ ' : r.kind === 'uncertain' ? '? ' : ''}{t(`ops.ov.c.status.${r.kind}` as Key)}</span></td>
              </tr>
            ))}</tbody>
          </table>
          <footer className="ov-review-foot">
            <div>
              <p data-testid="ov-selected">{t('ops.ov.c.selected', { count: chosen.length, pcs })}</p>
              <p className="ov-muted">{t('ops.ov.c.skipped')}</p>
              {coins !== null && <label className="ov-check"><input type="checkbox" checked={coinsOn} onChange={e => setCoinsOn(e.target.checked)} />{t('ops.ov.c.coins', { coins })}</label>}
            </div>
            <div className="ov-write">
              <button type="button" className="ov-btn primary" disabled={writing || !chosen.length} onClick={write}>{writing ? t('ops.ov.c.writing') : t('ops.ov.c.write', { count: chosen.length })}</button>
              <p className="ov-muted">{t('ops.ov.c.writeHint')}</p>
            </div>
          </footer>
        </section>
      </div>
      <aside className="ov-rail">
        <section className="ov-card"><span className="ov-stencil">{t('ops.ov.c.railTitle', { n: String(rows.length).padStart(2, '0') })}</span><h3>{t('ops.ov.c.railHead')}</h3>
          <p className="ov-quote">{t('ops.ov.c.railText')}</p><p className="ov-hand">{t('ops.ov.c.railNote')}</p></section>
        <section className="ov-card"><span className="ov-tag muted">{t('ops.ov.c.pending')}</span><p className="ov-muted">{t('ops.ov.c.discarded')}</p></section>
      </aside>
    </div>
  );
}

/* ----- okno ----- */
export default function OverlayApp() {
  const t = useT();
  const [view, setView] = useState<OverlayView | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [opacity, setOpacity] = useState(90);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, quests: null, shop: null, scan: null });
  const batchRef = useRef<BatchView | null>(null);

  useEffect(() => {
    const offs = [
      bus.on('state', p => {
        const v = p as OverlayView;
        app.store.setState({ state: v.state });
        batchRef.current = v.batch;
        setView(v);
      }),
      /* z Rustu při otevření: případně rovnou na výsledek snímku */
      bus.on('open', p => {
        const want = typeof p === 'string' && (TABS as string[]).includes(p) ? (p as Tab) : null;
        const b = batchRef.current;
        if (want) setTab(want);
        else if (b && (b.shots.length || b.emptyAt)) setTab('scan');
        setTimeout(() => document.querySelector<HTMLButtonElement>('.ov-tabs [aria-selected="true"]')?.focus(), 30);
      }),
    ];
    bus.send('main', 'hello', { from: 'overlay' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); void native.overlayClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { offs.forEach(f => f()); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { if (view) setOpacity(view.state.buddy.opacity); }, [view?.state.buddy.opacity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view?.batch.shots.length) setTab('scan'); }, [view?.batch.shots.length]);

  const glass = { ['--ov-alpha' as string]: String(opacity / 100) };
  if (!view) return <div className="ov" style={glass}><p className="ov-loading" role="status">{t('ops.ov.loading')}</p></div>;
  const s = view.state;
  const d = { quests: QUESTS.filter(q => questStatus(q, s.quests.done) === 'active').length };
  const counts: Record<Tab, number | null> = { overview: null, quests: d.quests, shop: null, scan: view.batch.shots.length || null };
  const onTabKey = (e: ReactKeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(n); tabRefs.current[n]?.focus();
  };
  const commitOpacity = () => bus.send('main', 'opacity', { value: opacity });
  return (
    <div className="ov" style={glass} data-testid="overlay">
      <i className="ov-tape" aria-hidden="true" /><i className="ov-bracket tl" aria-hidden="true" /><i className="ov-bracket br" aria-hidden="true" />
      <header className="ov-header">
        <OpsCanvas level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} scale={1} label="Ops" initial={tab === 'scan' ? 'unsure' : 'idle'} />
        <div className="grow"><span className="ov-kicker">{t(`ops.ov.kicker.${tab}` as Key)}</span><h1>{t('ops.ov.title')}</h1></div>
        <div className="ov-profile"><span className="ov-local">■ {t('ops.ov.local')}</span><span>{view.savedAt ? t('ops.ov.saved', { time: fmtTime(view.savedAt) }) : t('ops.ov.notSaved')}</span></div>
        <button type="button" className="ov-close" aria-label={t('ops.ov.close')} onClick={() => void native.overlayClose()}><X size={18} aria-hidden="true" /></button>
      </header>
      <nav className="ov-tabs" role="tablist" aria-label={t('ops.ov.tabs')}>
        {TABS.map((x, i) => (
          <button key={x} ref={el => { tabRefs.current[x] = el; }} type="button" role="tab" id={'ov-tab-' + x} aria-selected={tab === x} aria-controls="ov-panel"
            tabIndex={tab === x ? 0 : -1} onClick={() => setTab(x)} onKeyDown={e => onTabKey(e, i)}>
            {t(`ops.ov.tab.${x}` as Key)}{counts[x] !== null && <span className="ov-count-badge">{counts[x]}</span>}
          </button>
        ))}
      </nav>
      <main className="ov-content" role="tabpanel" id="ov-panel" aria-labelledby={'ov-tab-' + tab}>
        {tab === 'overview' && <Overview batch={view.batch} go={setTab} />}
        {tab === 'quests' && <Quests />}
        {tab === 'shop' && <Shop />}
        {tab === 'scan' && <Scan batch={view.batch} hotkey={view.hotkey} go={setTab} />}
      </main>
      <footer className="ov-footer">
        <span>{t('ops.ov.footer')}</span>
        <span><kbd>Esc</kbd> {view.hotkey ? t('ops.ov.closeHintKey', { key: hotkeyLabel(view.hotkey) }) : t('ops.ov.closeHint')}</span>
        <label className="ov-opacity">{t('ops.ov.opacity')}
          <input type="range" min={70} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} onPointerUp={commitOpacity} onKeyUp={commitOpacity} />
          <span className="mono">{t('ops.opacityVal', { v: opacity })}</span>
        </label>
      </footer>
    </div>
  );
}
