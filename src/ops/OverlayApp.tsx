/* Overlay „Polní konzole“ (milník 5, návrh docs/design/overlay): teplý taktický HUD nad hrou. Ukazuje jen data
   aplikace: přehled, dostupné úkoly, nákupy a výsledek snímku ke schválení (0.8.1: stash a loot po raidu odděleně). Stav je kopie z hlavního okna
   (store tohoto okna se nikdy nespustí, takže nic neukládá); zápisy jdou do hlavního okna jako akce. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { app, derivedOf, useAppState, useDerived } from '../store';
import { createBus } from './bus';
import { startHello } from './handshake';
import { createNative } from './native';
import type { BatchView, BuddyStatus, LootShot, OverlayView } from './hub';
import { OpsCanvas, type OpsHandle } from './OpsCanvas';
import { useOpsSpeech } from './speech';
import { createSoundPlayer } from './sound';
import { isFreshProfile, nextUpgrade } from '../core/compact';
import { upgradeHint, withMinigameHint, type LineRef } from '../core/opsVoice';
import { STATIONS } from '../core/data/stations';
import { hotkeyLabel } from './hotkey';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt, fmtDateTime, fmtTime } from '../ui/format';
import { cx } from '../ui/components';
import { formForLevel, resolveOutfit } from '../core/ops';
import { QUESTS, locText, objectiveProgress, questName, questStatus } from '../core/quests';
import { catalogByName, catalogItems, matchContext } from '../core/catalog';
import { cleanupRows, cleanupSummary } from '../core/advice';
import { analyzeLoot, analyzeShots, defaultTarget, type ImportGroup, type Target, type VisionApply, type VisionSummary } from '../core/visionImport';
import { lootItems, lootRows, raidGear, raidWithSig, type RaidLootInput } from '../core/lootImport';
import type { RaidLootResult } from '../store/app';
import { MAPS } from '../core/data/maps';
import { LIMITS } from '../core/state';
import { itemKey } from '../core/types';
import { ProgressReview } from '../ui/ProgressReview';
import { OvInventory, OvProfile, OvSkills, OvWorkshop } from './OverlayModules';
import { OvRaid, OvRaidEval } from './OverlayRaid';
import { raidList } from '../core/raidPrep';
import { dayKey } from '../core/util';
import type { ProgressApply, ProgressSummary } from '../core/progressImport';

const bus = createBus('overlay');
const native = createNative();
const STATION_MINS: Record<string, number> = Object.fromEntries(STATIONS.map(x => [x.id, x.min]));
/* overlay hraje zvuky, když je otevřený a má fokus (hráč ho právě používá) */
let soundPrefs = { on: false, volume: 0 };
const sound = createSoundPlayer(() => ({
  /* skrytý overlay fokus mít nemůže, takže fokus = overlay je otevřený a hráč ho používá */
  on: soundPrefs.on, volume: soundPrefs.volume, overlayOpen: typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus(),
  appFocused: false, buddyTouchAt: 0, gameForeground: false,
}));
if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) (window as unknown as { __opsSound?: unknown }).__opsSound = sound;

/* 0.10.1: i hlavní moduly (profil, inventář, dílna, skill tree) jako kompaktní přehledy s rychlými úpravami */
/* 0.14.0: záložka Raid (aktivní plán z Přípravy na raid) na konci, pořadí ostatních se nemění */
type Tab = 'overview' | 'profile' | 'inventory' | 'workshop' | 'quests' | 'skills' | 'shop' | 'scan' | 'raid';
const TABS: Tab[] = ['overview', 'quests', 'profile', 'inventory', 'workshop', 'skills', 'shop', 'scan', 'raid'];
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
  if (batch.loot) steps.push({ tag: t('ops.ov.tag.review'), tone: 'warn', title: t('ops.ov.l.title'), sub: t('ops.ov.l.banner'), action: () => go('scan'), label: t('ops.ov.tab.scan') });
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
          <OpsCanvas variant="detail" fit level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} paint={s.games?.paint} scale={1} label="Ops" />
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
          const op = objectiveProgress(s.quests.objectives, q), ticked = s.quests.objectives?.[q.id] ?? [];
          return (
            <li key={q.id} className="ov-card ov-quest" data-quest={q.id}>
              <span className="ov-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="grow">
                <b>{name}</b>
                <em>{t('ops.ov.q.trader', { name: q.trader })}{q.maps.length ? ' · ' + q.maps.map(mapName).join(', ') : ''}</em>
                {op.done > 0 && <p data-testid="ov-quest-obj"><span className="ov-stencil">{t('ops.ov.q.objProgress', op)}</span></p>}
                <ul>{q.objectives.slice(0, 2).map((o, j) => <li key={j} data-done={String(ticked.includes(j))}>{ticked.includes(j) ? '✓ ' : ''}{locText(o, t.lang)}</li>)}</ul>
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

function StashReview({ batch, hotkey, go }: { batch: BatchView; hotkey: string; go: (tab: Tab) => void }) {
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
    const nothing = batch.emptyAt > 0, failed = !!batch.failed, other = nothing && batch.rejected === 'otherScreen';
    return (
      <div className="ov-single">
        <div className="ov-head row-between"><div><h2>{other ? t('ops.ov.c.other') : nothing ? t('ops.ov.c.nothing') : t('ops.ov.c.empty')}</h2></div>
          <button type="button" className="ov-btn primary" onClick={newShot} disabled={!native.available}>{nothing || failed ? t('ops.ov.c.retry') : t('ops.ov.c.new')}</button></div>
        {nothing && <div className="ov-banner danger" role="alert" data-testid="ov-nothing">{other ? t('ops.ov.c.otherText') : t('ops.ov.c.nothingText')}</div>}
        {failed && <div className="ov-banner danger" role="alert">{t('ops.ov.c.failed')}</div>}
        <p className="ov-muted">{hotkey ? t('ops.ov.c.emptyHint', { key: hotkeyLabel(hotkey) }) : t('ops.ov.c.emptyHintNoKey')}</p>
        <p className="ov-muted">{t('ops.ov.c.lootHint')}</p>
        <p className="ov-muted">{t('ops.ov.c.progressHint')}</p>
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

/* ----- Loot po raidu (FINDINGS, 0.8.1) ----- */
const where = (g: ImportGroup) => g.cells.map(c => `${c.panel === 'quickUse' ? 'Q' : 'B'}${c.row + 1}/${c.col + 1}`).join(', ');
const RECENT_MS = 6 * 3600_000;

function LootReview({ shot, writing, fail, onWrite }: { shot: LootShot; writing: boolean; fail: string; onWrite: (input: RaidLootInput) => void }) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const matNames = useMemo(() => d.materials.map(m => m.name), [d.materials]);
  const analysis = useMemo(() => analyzeLoot(shot.read, s.vision.learned, matchContext(matNames, [...new Set(Object.values(s.items).map(x => x.name))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shot.id]);
  const suggestions = useMemo(() => [...new Set([...matNames, ...catalogItems().map(x => x.name)])], [matNames]);
  const raids = useMemo(() => [...s.raids].sort((a, b) => b.ts - a.ts).slice(0, 10), [s.raids]);
  /* Výchozí raid: nejnovější, když je čerstvý a ještě nemá loot ze snímku; jinak nový záznam. Volba je vždy vidět. */
  const initialRaid = raids[0] && !raids[0].lootScan && Math.abs(shot.at - raids[0].ts) < RECENT_MS ? raids[0].id : 'new';
  const [raidSel, setRaidSel] = useState(initialRaid);
  const [map, setMap] = useState(raids[0]?.map ?? MAPS[0].id);
  const [names, setNames] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [inc, setInc] = useState<Record<string, boolean>>({});
  const [replace, setReplace] = useState(false);
  const [gearChecked, setGearChecked] = useState(false);
  const [toInv, setToInv] = useState(true);
  useEffect(() => { setRaidSel(initialRaid); setNames({}); setCounts({}); setInc({}); setReplace(false); setGearChecked(false); }, [shot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const raid = raidSel === 'new' ? null : s.raids.find(r => r.id === raidSel) ?? null;
  const gear = raidGear(raid, s.loadouts);
  const dup = raidWithSig(s, shot.sig);
  const groups = analysis.groups;
  const defName = (g: ImportGroup) => (g.match.status !== 'unknown' && g.match.itemKey ? itemKey(g.match.itemKey, g.tier ?? undefined) : '');
  const nameOf = (g: ImportGroup) => names[g.id] ?? defName(g);
  const countOf = (g: ImportGroup) => counts[g.id] ?? g.count ?? 1;
  /* Jistě rozpoznané řádky jsou vybrané; nejisté a neznámé až po kontrole hráčem. */
  const included = (g: ImportGroup) => inc[g.id] ?? g.match.status === 'known';
  /* Výbava se rozdělí na všechna pojmenovaná políčka (fyzicky jsou v batohu), zapíšou se jen vybrané řádky. */
  const rows = lootRows(groups.map(g => ({ id: g.id, name: nameOf(g), qty: countOf(g) })), gear.items);
  const items = lootItems(rows.filter((_, i) => included(groups[i])));
  const pcs = items.reduce((a, x) => a + x.qty, 0);
  const needReplace = !!raid?.lootScan;
  const blocked = writing || !!dup || !items.length || (gear.source === 'none' && !gearChecked) || (needReplace && !replace);
  const write = () => {
    if (blocked) return;
    onWrite({ raidId: raid ? raid.id : null, ...(raid ? {} : { map }), items, replace: needReplace && replace, toInventory: toInv, gearChecked: gear.source === 'none' && gearChecked });
  };
  const slots = (x: { slots: number | null; max: number | null } | null) => (x && x.slots !== null ? `${x.slots}/${x.max ?? '?'}` : '—');
  const mapName = (id: string) => MAPS.find(m => m.id === id)?.name ?? id;
  const gearList = gear.items.map(x => `${x.name} ×${x.qty}`).join(', ');

  return (
    <div className="ov-body-grid" data-testid="ov-loot">
      <div className="ov-main">
        <div className="ov-head row-between">
          <div><h2>{t('ops.ov.l.title')}</h2><p>{t('ops.ov.l.sub', { bp: slots(analysis.backpack), qu: slots(analysis.quickUse), time: fmtTime(shot.at) })}</p></div>
          <div className="row"><button type="button" className="ov-btn" onClick={() => bus.send('main', 'lootClear')}>{t('ops.ov.l.discard')}</button></div>
        </div>
        <div className="ov-banner warn">{t('ops.ov.l.banner')}</div>
        {dup && <div className="ov-banner danger" role="alert" data-testid="ov-loot-dup">{t('ops.ov.l.dup', { when: fmtDateTime(dup.lootScan!.at) })}</div>}
        {analysis.empty && <div className="ov-banner ok" role="status" data-testid="ov-loot-empty">{t('ops.ov.l.empty')}</div>}
        {fail && <div className="ov-banner danger" role="alert" data-testid="ov-loot-fail">{t(`ops.ov.l.fail.${fail}` as Key)}</div>}
        <section className="ov-card ov-review">
          <div className="ov-loot-raid">
            <label className="ov-field">{t('ops.ov.l.raid')}
              <select className="ov-input" value={raidSel} onChange={e => { setRaidSel(e.target.value); setReplace(false); setGearChecked(false); }} data-testid="ov-loot-raid">
                <option value="new">{t('ops.ov.l.newRaid')}</option>
                {raids.map(r => <option key={r.id} value={r.id}>{t('ops.ov.l.raidOpt', { when: fmtDateTime(r.ts), map: mapName(r.map) })}{r.lootScan ? ' ✓' : ''}</option>)}
              </select>
            </label>
            {!raid && (
              <label className="ov-field">{t('ops.ov.l.map')}
                <select className="ov-input" value={map} onChange={e => setMap(e.target.value)}>{MAPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </label>
            )}
          </div>
          {!raid && <p className="ov-muted">{t('ops.ov.l.newHint')}</p>}
          {needReplace && (
            <div className="ov-banner warn" role="status">{t('ops.ov.l.hasScan', { when: fmtDateTime(raid!.lootScan!.at) })}
              <label className="ov-check"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} data-testid="ov-loot-replace" />{t('ops.ov.l.replace')}</label>
            </div>
          )}
          {gear.source === 'none' ? (
            <div className="ov-banner danger" role="alert" data-testid="ov-loot-nogear">{t('ops.ov.l.noGear')}
              <label className="ov-check"><input type="checkbox" checked={gearChecked} onChange={e => setGearChecked(e.target.checked)} data-testid="ov-loot-gearcheck" />{t('ops.ov.l.gearChecked')}</label>
            </div>
          ) : <p className="ov-muted" data-testid="ov-loot-gear">{t(gear.source === 'raid' ? 'ops.ov.l.gear' : 'ops.ov.l.gearLoadout', { list: gearList })}</p>}
          {groups.length > 0 && (
            <table className="ov-table">
              <thead><tr><th><span className="sr-only">{t('ops.ov.l.rowAria', { where: '' })}</span></th><th>{t('ops.ov.c.col.item')}</th><th className="num">{t('ops.ov.l.col.found')}</th><th className="num">{t('ops.ov.l.col.gear')}</th><th className="num">{t('ops.ov.l.col.loot')}</th><th>{t('ops.ov.c.col.status')}</th></tr></thead>
              <tbody>{groups.map((g, i) => {
                const r = rows[i], on = included(g), kind = g.match.status === 'known' && g.countSure ? 'known' : g.match.status === 'unknown' ? 'unknown' : 'uncertain';
                return (
                  <tr key={g.id} data-group={g.id} data-kind={kind} className={cx(kind === 'uncertain' && 'unsure', !on && 'off')}>
                    <td><input type="checkbox" checked={on} aria-label={t('ops.ov.l.rowAria', { where: where(g) })} onChange={e => setInc(p => ({ ...p, [g.id]: e.target.checked }))} /></td>
                    <td>
                      <input className="ov-input ov-name" list="ov-loot-names" value={nameOf(g)} maxLength={80} placeholder={t('ops.ov.l.namePh')} aria-label={t('ops.ov.l.nameAria', { where: where(g) })}
                        onChange={e => setNames(p => ({ ...p, [g.id]: e.target.value }))} />
                      <em className="ov-muted"> {where(g)}</em>
                    </td>
                    <td className="num"><input className="ov-count mono" type="number" min={0} max={LIMITS.inventory[1]} value={countOf(g)} aria-label={t('ops.ov.l.countAria', { where: where(g) })}
                      onChange={e => { const v = Math.max(0, Math.min(LIMITS.inventory[1], Math.round(Number(e.target.value) || 0))); setCounts(p => ({ ...p, [g.id]: v })); }} /></td>
                    <td className="num mono">{r.gear ? `−${fmt(r.gear)}` : '0'}</td>
                    <td className="num mono" data-testid="ov-loot-qty">{on ? fmt(r.loot) : '—'}</td>
                    <td><span className={cx('ov-tag', kind === 'known' ? 'ok' : kind === 'uncertain' ? 'warn' : 'muted')}>{kind === 'unknown' ? t('ops.ov.l.unknown') : t(`ops.ov.c.status.${kind}` as Key)}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <datalist id="ov-loot-names">{suggestions.map(n => <option key={n} value={n} />)}</datalist>
          <footer className="ov-review-foot">
            <div>
              <p data-testid="ov-loot-selected">{t('ops.ov.l.summary', { count: items.length, pcs })}</p>
              <label className="ov-check"><input type="checkbox" checked={toInv} onChange={e => setToInv(e.target.checked)} />{t('ops.ov.l.toInv')}</label>
            </div>
            <div className="ov-write">
              <button type="button" className="ov-btn primary" disabled={blocked} onClick={write} data-testid="ov-loot-write">{writing ? t('ops.ov.c.writing') : t('ops.ov.l.write')}</button>
              <p className="ov-muted">{t('ops.ov.l.writeHint')}</p>
            </div>
          </footer>
        </section>
      </div>
      <aside className="ov-rail">
        <section className="ov-card"><span className="ov-stencil">{t('ops.ov.c.railTitle', { n: String(groups.length).padStart(2, '0') })}</span><h3>{t('ops.ov.c.railHead')}</h3>
          <p className="ov-quote">{t('ops.ov.c.railText')}</p></section>
        <section className="ov-card"><span className="ov-tag muted">{t('ops.ov.c.pending')}</span><p className="ov-muted">{t('ops.ov.c.discarded')}</p></section>
      </aside>
    </div>
  );
}

function lootDoneText(t: TFn, r: Extract<RaidLootResult, { ok: true }>): string {
  const parts = [t('ops.ov.l.done', { count: r.items.length })];
  if (r.created) parts.push(t('ops.ov.l.doneNew'));
  if (Object.keys(r.inventory).length) parts.push(t('ops.ov.l.doneInv'));
  return parts.join(' ');
}

/* Výsledek snímku: stash, loot po raidu a postup (profil, dílna, úkol, skill tree) jsou oddělené revize. */
type ScanMode = 'stash' | 'loot' | 'progress';
function Scan({ batch, hotkey, go }: { batch: BatchView; hotkey: string; go: (tab: Tab) => void }) {
  const t = useT();
  const [mode, setMode] = useState<ScanMode>(batch.last ?? 'stash');
  const [writing, setWriting] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState<Extract<RaidLootResult, { ok: true }> | null>(null);
  const [pWriting, setPWriting] = useState(false);
  const [pDone, setPDone] = useState<ProgressSummary | null>(null);
  const [pFail, setPFail] = useState(false);
  useEffect(() => { if (batch.last) setMode(batch.last); }, [batch.last, batch.loot?.id, batch.shots.length, batch.progress?.id]);
  useEffect(() => { setFail(''); if (batch.loot) setDone(null); }, [batch.loot?.id]);
  useEffect(() => { setPFail(false); if (batch.progress) setPDone(null); }, [batch.progress?.id]);
  useEffect(() => bus.on('lootImported', p => {
    setWriting(false);
    const r = (p as { result?: RaidLootResult } | null)?.result;
    if (!r) return;
    if (r.ok) { setDone(r); setFail(''); }
    else setFail(['duplicate', 'replaceNeeded', 'gearUnchecked', 'noRaid', 'empty', 'snapshot'].includes(r.reason) ? r.reason : 'other');
  }), []);
  useEffect(() => bus.on('progressImported', p => {
    setPWriting(false);
    const sum = (p as { summary?: ProgressSummary | null } | null)?.summary ?? null;
    if (sum) { setPDone(sum); setPFail(false); } else setPFail(true);
  }), []);
  const hasStash = batch.shots.length > 0, loot = batch.loot, prog = batch.progress;
  const avail: ScanMode[] = [...(hasStash ? ['stash' as const] : []), ...(loot ? ['loot' as const] : []), ...(prog ? ['progress' as const] : [])];
  const show: ScanMode = avail.includes(mode) ? mode : avail[0] ?? 'stash';
  const onWrite = (input: RaidLootInput) => { if (!loot) return; setWriting(true); setFail(''); bus.send('main', 'lootImport', { shotId: loot.id, input }); };
  const onProgress = (input: ProgressApply) => { if (!prog) return; setPWriting(true); setPFail(false); bus.send('main', 'progressImport', { shotId: prog.id, input }); };
  return (
    <>
      {avail.length > 1 && (
        <div className="ov-filter" role="group" aria-label={t('ops.ov.mode')}>
          {hasStash && <button type="button" aria-pressed={show === 'stash'} onClick={() => setMode('stash')}>{t('ops.ov.mode.stash', { count: batch.shots.length })}</button>}
          {loot && <button type="button" aria-pressed={show === 'loot'} onClick={() => setMode('loot')}>{t('ops.ov.mode.loot')}</button>}
          {prog && <button type="button" aria-pressed={show === 'progress'} onClick={() => setMode('progress')}>{t('ops.ov.mode.progress')}</button>}
        </div>
      )}
      {done && !loot && <div className="ov-banner ok" role="status" data-testid="ov-loot-done">{lootDoneText(t, done)}</div>}
      {done && !loot && <OvRaidEval bus={bus} raidId={done.raidId} />}
      {pDone && !prog && <div className="ov-banner ok" role="status" data-testid="ov-progress-done">{t('progress.done', { count: pDone.fields })}</div>}
      {pFail && prog && <div className="ov-banner danger" role="alert">{t('progress.failed')}</div>}
      {show === 'progress' && prog ? (
        <div className="ov-single" data-testid="ov-progress">
          <ProgressReview read={prog.read} id={prog.id} variant="ov" writing={pWriting} onWrite={onProgress} onDiscard={() => bus.send('main', 'progressClear')} />
        </div>
      ) : show === 'loot' && loot ? <LootReview shot={loot} writing={writing} fail={fail} onWrite={onWrite} /> : <StashReview batch={batch} hotkey={hotkey} go={go} />}
    </>
  );
}

/* ----- okno ----- */
export default function OverlayApp() {
  const t = useT();
  const [view, setView] = useState<OverlayView | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [opacity, setOpacity] = useState(90);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, profile: null, inventory: null, workshop: null, quests: null, skills: null, shop: null, scan: null, raid: null });
  const batchRef = useRef<BatchView | null>(null);
  const gotState = useRef(false);
  const ops = useRef<OpsHandle>(null);
  /* co Ops v hlavičce říká: poslední hláška ze stavu, při otevření rada k dalšímu vylepšení */
  const [said, setSaid] = useState<{ line: LineRef | null; n: number; hint: boolean }>({ line: null, n: 0, hint: true });

  useEffect(() => {
    const offs = [
      bus.on('state', p => {
        const v = p as OverlayView;
        app.store.setState({ state: v.state });
        batchRef.current = v.batch;
        gotState.current = true;
        setView(v);
      }),
      /* z Rustu při otevření: případně rovnou na výsledek snímku */
      bus.on('open', p => {
        const want = typeof p === 'string' && (TABS as string[]).includes(p) ? (p as Tab) : null;
        const b = batchRef.current;
        if (want) setTab(want);
        else if (b && (b.shots.length || b.loot || b.progress || b.emptyAt)) setTab('scan');
        setTimeout(() => document.querySelector<HTMLButtonElement>('.ov-tabs [aria-selected="true"]')?.focus(), 30);
        setSaid(x => ({ line: null, n: x.n + 1, hint: true }));
      }),
      /* stav Opse z hlavního okna (sken, čtení, zápis, chyba) */
      bus.on('status', p => {
        const st = p as BuddyStatus;
        if (st.anim !== 'talk' && st.anim !== 'dismiss') ops.current?.play(st.anim);
        if (st.sound && st.sound !== 'beep') sound.play(st.sound);
        if (st.line) setSaid(x => ({ line: st.line, n: x.n + 1, hint: false }));
      }),
    ];
    /* pozdrav až po registraci posluchačů a opakovaně, dokud nepřijde první stav (0.8.0) */
    const stopHello = startHello(bus, 'overlay', () => gotState.current);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); sound.play('close'); void native.overlayClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { stopHello(); offs.forEach(f => f()); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { if (view) setOpacity(view.state.buddy.opacity); }, [view?.state.buddy.opacity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view?.batch.shots.length) setTab('scan'); }, [view?.batch.shots.length]);
  useEffect(() => { if (view?.batch.loot) setTab('scan'); }, [view?.batch.loot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view?.batch.progress) setTab('scan'); }, [view?.batch.progress?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const st0 = view?.state;
  if (st0) soundPrefs = { on: st0.opsPrefs.sound, volume: st0.opsPrefs.volume };
  const hint = useMemo(() => {
    if (!st0) return null;
    const d = derivedOf(st0);
    /* 0.11.0: otevřený overlay = hráč s ním pracuje; když nic nechybí, smí Ops nabídnout minihru */
    return withMinigameHint(upgradeHint(nextUpgrade(d.needs, d.targets, st0.inventory), isFreshProfile(st0, STATION_MINS)), st0.opsPrefs.dialogs);
  }, [st0]);
  const speech = useOpsSpeech(said.hint ? hint : said.line, st0?.opsPrefs.personality ?? 'friendly', t.lang, {
    ops, nonce: said.n, gesture: said.hint ? null : undefined, onSay: () => sound.play('beep'),
  });

  const glass = { ['--ov-alpha' as string]: String(opacity / 100) };
  if (!view) return <div className="ov" style={glass}><p className="ov-loading" role="status">{t('ops.ov.loading')}</p></div>;
  const s = view.state;
  const d = { quests: QUESTS.filter(q => questStatus(q, s.quests.done) === 'active').length };
  const counts: Record<Tab, number | null> = { overview: null, profile: null, inventory: null, workshop: null, skills: null, quests: d.quests, shop: null, scan: view.batch.shots.length + (view.batch.loot ? 1 : 0) + (view.batch.progress ? 1 : 0) || null,
    raid: s.raidPlan ? raidList(s, s.raidPlan.goals, t.lang, dayKey(Date.now())).length : null };
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
        <OpsCanvas ref={ops} variant="detail" fit level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} paint={s.games?.paint} scale={1} label="Ops"
          restAnim={speech.talking ? 'talk' : 'idle'} />
        <div className="grow"><span className="ov-kicker">{t(`ops.ov.kicker.${tab}` as Key)}</span><h1>{t('ops.ov.title')}</h1>
          {speech.text && <p className="ov-speech" role="status" aria-label={t('ops.speechAria')} data-testid="ops-line">{speech.text}</p>}</div>
        <div className="ov-profile"><span className="ov-local">■ {t('ops.ov.local')}</span><span>{view.savedAt ? t('ops.ov.saved', { time: fmtTime(view.savedAt) }) : t('ops.ov.notSaved')}</span></div>
        <button type="button" className="ov-close" aria-label={t('ops.ov.close')} onClick={() => { sound.play('close'); void native.overlayClose(); }}><X size={18} aria-hidden="true" /></button>
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
        {tab === 'profile' && <OvProfile bus={bus} />}
        {tab === 'inventory' && <OvInventory bus={bus} />}
        {tab === 'workshop' && <OvWorkshop bus={bus} />}
        {tab === 'skills' && <OvSkills bus={bus} />}
        {tab === 'quests' && <Quests />}
        {tab === 'shop' && <Shop />}
        {tab === 'scan' && <Scan batch={view.batch} hotkey={view.hotkey} go={setTab} />}
        {tab === 'raid' && <OvRaid bus={bus} />}
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
