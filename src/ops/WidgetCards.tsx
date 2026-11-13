/* 0.22.0: obsah deseti widgetů nad hrou. Každý jen čte kopii stavu z hlavního okna a počítá stejnými funkcemi jádra
   jako zbytek aplikace (raidList, aktivní úkoly, nákupy kompaktu, rádce „Co dál?“, rada nechat / prodat / recyklovat,
   obsazenost skrýše, týdenní výzvy, fronta Ke kontrole, automatické snímání). Nic se tu nepočítá podruhé po svém.
   Ve Hře jsou karty jen k zobrazení: žádné tlačítko, zaškrtávátko ani pole (okno propouští myš). Interaktivní prvky
   (zaškrtnutí cíle úkolu, „mám“, hledání předmětu, Zkontrolovat) jsou jen v Úpravách; zápis jde do hlavního okna
   jako akce z allow-listu (store/relay.ts WIDGET_ACTIONS). Názvy herních předmětů se nepřekládají. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useAppState, useDerived } from '../store';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt, fmtDate, DASH } from '../ui/format';
import { cx } from '../ui/components';
import { dayKey } from '../core/util';
import { emptyGoals, findName, lookupAdvice, lookupNames, raidList } from '../core/raidPrep';
import { compactShopping, nextUpgrade } from '../core/compact';
import { visibleTips, STASH_FRESH_DAYS, weekDaysLeft } from '../core/advisor';
import { QUESTS, locText, questName } from '../core/quests';
import { autoIndicator } from '../core/autoCapture';
import { starSum } from '../core/week';
import { formForLevel } from '../core/ops';
import { verdictText } from '../ui/Advice';
import { AreaBadges } from '../ui/MapView';
import type { Density, WidgetId } from '../core/widgets';
import type { WidgetView } from './hub';

export interface CardProps {
  density: Density;
  edit: boolean;
  /* výška widgetu v logických px: podle ní se vejde jen tolik celých řádků (zbytek „+ n dalších“) */
  height: number;
  pending: WidgetView['pending'];
  /* poslední výslovně vyhledaný předmět (widget Nechat / prodat / recyklovat) */
  lookup: string;
  setLookup: (q: string) => void;
  /* úprava do hlavního okna (jen Úpravy) */
  act: (name: 'questObjective' | 'setRaidFound', args: unknown[]) => void;
  openApp: (tab: string) => void;
}

const DAY = 86_400_000;
/* Zaškrtnutí v Úpravách se ukáže hned; další kopie stavu z hlavního okna (už s provedenou akcí) ho nahradí. */
function useOptimistic(base: unknown): [Record<string, boolean>, (k: string, v: boolean) => void] {
  const [opt, setOpt] = useState<Record<string, boolean>>({});
  useEffect(() => { setOpt({}); }, [base]);
  return [opt, (k, v) => setOpt(o => ({ ...o, [k]: v }))];
}
const pad2 = (n: number) => String(n).padStart(2, '0');

/* Kolik celých řádků se vejde (hlavička a patička zabírají pevnou výšku). */
export function rowsFit(height: number, head: number, row: number, total: number): number {
  const n = Math.max(1, Math.floor((height - head) / row));
  return total <= n ? total : Math.max(1, n - 1);
}

function Head({ id, count, t }: { id: WidgetId; count?: number | null; t: TFn }) {
  return (
    <header className="wg-head">
      <h2>{t(`wg.w.${id}` as Key)}</h2>
      {count !== undefined && <span className="wg-tag mono">{count === null ? DASH : pad2(count)}</span>}
    </header>
  );
}
function More({ n, t }: { n: number; t: TFn }) {
  return n > 0 ? <p className="wg-more mono" data-testid="wg-more">{t('wg.more', { count: n })}</p> : null;
}
function Empty({ children }: { children: ReactNode }) { return <p className="wg-empty secondary">{children}</p>; }

/* ----- Seznam k nalezení (aktivní plán raidu) ----- */
function ToFind(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const plan = s.raidPlan;
  const rows = useMemo(() => (plan ? raidList(s, plan.goals, t.lang, dayKey(Date.now())) : []), [s, plan, t.lang]);
  const [opt, setOpt] = useOptimistic(plan?.found);
  const n = p.edit ? rows.length : rowsFit(p.height, p.density === 'expanded' ? 96 : 64, 56, rows.length);
  return (
    <>
      <Head id="toFind" count={plan ? rows.length : null} t={t} />
      {!plan || rows.length === 0 ? <Empty>{t('wg.empty.toFind')}</Empty> : (
        <ul className="wg-rows">{rows.slice(0, n).map(r => {
          const found = opt[r.mat] ?? plan.found.includes(r.mat);
          return (
            <li key={r.mat} className={cx('wg-row', found && 'done')} data-mat={r.mat}>
              <span className="grow">
                <b className="wg-item">{r.mat}</b>
                {r.areas.length > 0 && <AreaBadges areas={r.areas} />}
              </span>
              {p.edit
                ? <label className="wg-check"><input type="checkbox" checked={found} onChange={e => { setOpt(r.mat, e.target.checked); p.act('setRaidFound', [r.mat, e.target.checked]); }} aria-label={t('ops.ov.r.foundAria', { name: r.mat })} /><span className="mono">{fmt(r.have)} / {fmt(r.need)}</span></label>
                : <span className="wg-count mono">{found ? <Check size={16} className="wg-tick" aria-label="✓" /> : `${fmt(r.have)} / ${fmt(r.need)}`}</span>}
            </li>
          );
        })}</ul>
      )}
      {!p.edit && <More n={rows.length - n} t={t} />}
      {p.density === 'expanded' && <p className="wg-meta">{plan ? (p.edit ? t('wg.toFind.foundNote') : t('wg.toFind.plan')) : t('wg.toFind.noPlan')}</p>}
    </>
  );
}

/* ----- Připnuté úkoly (zaškrtnuté cíle) ----- */
function Quests(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const list = useMemo(() => (s.quests.pinned ?? []).map(id => QUESTS.find(q => q.id === id)).filter(q => !!q && !s.quests.done[q.id]), [s.quests.pinned, s.quests.done]);
  const [opt, setOpt] = useOptimistic(s.quests.objectives);
  const showObj = p.edit || p.density === 'expanded';
  const total = list.reduce((a, q) => a + 1 + (showObj ? q!.objectives.length : 0), 0);
  const cap = p.edit ? total : rowsFit(p.height, p.density === 'expanded' ? 92 : 56, 34, total);
  let used = 0;
  return (
    <>
      <Head id="quests" count={list.length} t={t} />
      {list.length === 0 ? <Empty>{t('wg.empty.quests')}</Empty> : (
        <ul className="wg-rows">{list.map(q => {
          if (used >= cap) return null;
          used++;
          const ticked = s.quests.objectives?.[q!.id] ?? [];
          const name = questName(q!, t.lang);
          const objs = showObj ? q!.objectives.map((o, i) => ({ o, i })).filter(() => (used < cap ? (used++, true) : false)) : [];
          return (
            <li key={q!.id} className="wg-quest" data-quest={q!.id}>
              <div className="wg-row">
                <b className="grow">{name}</b>
                <span className="wg-count mono">{fmt(ticked.length)} / {fmt(q!.objectives.length)}</span>
              </div>
              {objs.length > 0 && <ul className="wg-objs">{objs.map(({ o, i }) => {
                const k = q!.id + ':' + i, on = opt[k] ?? ticked.includes(i), text = locText(o, t.lang);
                return (
                  <li key={i} className={cx('wg-obj', on && 'done')}>
                    {p.edit
                      ? <label className="wg-check"><input type="checkbox" checked={on} onChange={e => { setOpt(k, e.target.checked); p.act('questObjective', [q!.id, i, e.target.checked]); }} aria-label={t('wg.quests.objAria', { quest: name, objective: text })} /><span>{text}</span></label>
                      : <><span className="grow">{text}</span>{on && <Check size={16} className="wg-tick" aria-label="✓" />}</>}
                  </li>
                );
              })}</ul>}
            </li>
          );
        })}</ul>
      )}
      {!p.edit && <More n={total - cap} t={t} />}
      {p.density === 'expanded' && <p className="wg-meta">{t('wg.quests.manual')}</p>}
    </>
  );
}

/* ----- Nákupy (jako kompaktní okno: zvolený upgrade, jinak nejvíc chybějící) ----- */
function Shopping(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const up = useMemo(() => nextUpgrade(d.needs, d.targets, s.inventory), [d.needs, d.targets, s.inventory]);
  const shop = useMemo(() => compactShopping(up, d.shop, 12), [up, d.shop]);
  const missing = shop.rows.reduce((a, r) => a + r.missing, 0);
  const n = p.edit ? shop.rows.length : rowsFit(p.height, p.density === 'expanded' ? 112 : 60, 36, shop.rows.length);
  return (
    <>
      <Head id="shopping" t={t} />
      {shop.forUpgrade && up && <p className="wg-tag mono">{up.station.name} {up.level}</p>}
      {shop.rows.length === 0 ? <Empty>{t('wg.empty.shopping')}</Empty> : (
        <ul className="wg-rows">{shop.rows.slice(0, n).map(r => (
          <li key={r.mat} className="wg-row" data-mat={r.mat}><b className="grow wg-item">{r.mat}</b><span className="wg-count mono">{fmt(r.have)} / {fmt(r.need)}</span></li>
        ))}</ul>
      )}
      {!p.edit && <More n={shop.rows.length - n} t={t} />}
      {p.density === 'expanded' && missing > 0 && <p className="wg-meta">{t(shop.forUpgrade ? 'wg.shop.upgrade' : 'wg.shop.goals', { count: missing })}</p>}
    </>
  );
}

/* ----- Co dál? (nejdůležitější tip rádce) ----- */
function Next(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const tip = visibleTips(d.tips, s.advisor, Date.now())[0];
  return (
    <>
      <Head id="next" t={t} />
      {!tip ? <Empty>{t('wg.empty.next')}</Empty> : (
        <div className="wg-tip" data-tip={tip.id}>
          <b>{t.m(tip.title)}</b>
          <p className="secondary">{t.m(tip.detail)}</p>
          {p.density === 'expanded' && <p className="wg-meta">{t('wg.next.footer')}</p>}
        </div>
      )}
    </>
  );
}

/* ----- Nechat / prodat / recyklovat (hledání jen v Úpravách) ----- */
function Lookup(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const plan = s.raidPlan;
  const today = dayKey(Date.now());
  const rows = useMemo(() => (plan ? raidList(s, plan.goals, t.lang, today) : []), [s, plan, t.lang, today]);
  const names = useMemo(() => lookupNames(s, d.materials.map(m => m.name)), [s, d.materials]);
  const found = findName(p.lookup, names);
  const v = useMemo(() => (found ? lookupAdvice(s, found, plan?.goals ?? emptyGoals(), rows, t.lang, today) : null), [found, s, plan, rows, t.lang, today]);
  return (
    <>
      <header className="wg-head"><h2>{t('wg.lookup.title')}</h2></header>
      {p.edit && (
        <label className="wg-field">
          <span className="sr-only">{t('wg.lookup.label')}</span>
          <input type="search" value={p.lookup} placeholder={t('wg.lookup.ph')} onChange={e => p.setLookup(e.target.value)} autoComplete="off" spellCheck={false} data-testid="wg-lookup" />
        </label>
      )}
      {v ? (
        <div className={cx('wg-verdict', v.kind)} data-testid="wg-verdict" data-kind={v.kind}>
          <span className="wg-kind mono">{t(`ops.ov.r.kind.${v.kind}` as Key)}</span>
          <b className="wg-item">{v.name}</b>
          <p className="secondary">{verdictText(v, t)}</p>
        </div>
      ) : <Empty>{t('wg.empty.lookup')}</Empty>}
      {!p.edit && <p className="wg-meta">{t('wg.lookup.playHint')}</p>}
      {p.density === 'expanded' && p.edit && <p className="wg-meta">{t('wg.lookup.note')}</p>}
    </>
  );
}

/* ----- Obsazenost skrýše (poslední potvrzený stav ze snímku nebo ručně) ----- */
function Stash(p: CardProps) {
  const t = useT();
  const sl = useAppState().vision.stash;
  if (!sl || sl.max <= 0) return <><Head id="stash" t={t} /><Empty>{t('wg.empty.stash')}</Empty></>;
  const free = sl.max - sl.used;
  const stale = Date.now() - sl.at > STASH_FRESH_DAYS * DAY;
  const pct = Math.min(100, Math.round((sl.used / sl.max) * 100));
  return (
    <>
      <Head id="stash" t={t} />
      <p className="wg-big mono">{fmt(sl.used)} <span className="secondary">/ {fmt(sl.max)}</span></p>
      <div className="wg-bar-track" role="img" aria-label={t('wg.stash.aria', { used: sl.used, max: sl.max })}><i style={{ width: pct + '%' }} /></div>
      <p>{free >= 0 ? t('wg.stash.free', { count: free }) : t('wg.stash.over', { count: -free })}</p>
      {p.density === 'expanded' && <p className="wg-meta">{stale ? t('wg.stale') : t('wg.stash.when', { when: fmtDate(sl.at, t.lang) })}</p>}
    </>
  );
}

/* ----- Týdenní výzvy (vlastní zapsané hvězdy) ----- */
const STARS_MAX = 3;
function Weekly(p: CardProps) {
  const t = useT();
  const tr = useAppState().trials;
  const sum = starSum(tr.stars);
  const named = tr.names.some(n => n.trim());
  const left = weekDaysLeft(Date.now());
  const list = tr.stars.map((st, i) => ({ st, i, name: tr.names[i]?.trim() || t('wg.weekly.name', { n: i + 1 }) }));
  const n = p.edit ? list.length : rowsFit(p.height, 88, 30, list.length);
  return (
    <>
      <Head id="weekly" t={t} />
      {sum === 0 && !named ? <Empty>{t('wg.empty.weekly')}</Empty> : (
        <>
          <p className="wg-row"><b className="grow">{t('wg.weekly.stars', { count: sum, max: tr.stars.length * STARS_MAX })}</b><span className="wg-count mono">{t('wg.weekly.left', { count: left })}</span></p>
          {p.density === 'expanded' && (
            <ul className="wg-rows">{list.slice(0, n).map(x => (
              <li key={x.i} className="wg-row"><span className="grow">{x.name}</span><span className="wg-stars mono" aria-label={t('trials.stars', { count: x.st })}>{'★'.repeat(x.st)}{'☆'.repeat(Math.max(0, STARS_MAX - x.st))}</span></li>
            ))}</ul>
          )}
          {p.density === 'expanded' && <p className="wg-meta">{t('wg.weekly.own')}</p>}
        </>
      )}
    </>
  );
}

/* ----- Ops (informační karta; žádná animace ani nevyžádaná řeč) ----- */
function Ops(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const form = formForLevel(s.profile.level);
  return (
    <>
      <header className="wg-head"><h2>{t('wg.ops.level', { level: s.profile.level })}</h2></header>
      <p><b>{form.name[t.lang]}</b></p>
      <p className="secondary">{t('wg.ops.ready')}</p>
      {p.density === 'expanded' && <p className="wg-meta">{t('wg.ops.hint')}</p>}
    </>
  );
}

/* ----- Ke kontrole (fronta nejistých údajů z automatického snímání a snímky čekající na revizi) ----- */
function Review(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const queue = s.review.length;
  const shots = p.pending.stash + (p.pending.loot ? 1 : 0) + (p.pending.progress ? 1 : 0);
  return (
    <>
      <Head id="review" count={queue + shots} t={t} />
      {queue + shots === 0 ? <Empty>{t('wg.empty.review')}</Empty> : (
        <>
          {queue > 0 && <p><b>{t('wg.review.count', { count: queue })}</b></p>}
          {shots > 0 && <p><b>{t('wg.review.shots', { count: shots })}</b></p>}
          {p.density === 'expanded' && <p className="wg-meta">{t('wg.review.note')}</p>}
          {p.edit && <button type="button" className="wg-btn" onClick={() => p.openApp(shots > 0 ? 'scan' : 'apps:journal')} data-testid="wg-review-open">{t('wg.review.open')}</button>}
        </>
      )}
    </>
  );
}

/* ----- Automatické snímání (stav; nikdy nic nezapíná) ----- */
function Capture(p: CardProps) {
  const t = useT();
  const s = useAppState();
  const ind = autoIndicator(s);
  const state = t(ind === 'on' ? 'wg.capture.on' : ind === 'paused' ? 'wg.capture.paused' : 'wg.capture.off');
  return (
    <>
      <header className="wg-head"><h2>{t('wg.w.capture')}</h2></header>
      <p className={cx('wg-state', 'auto-' + (ind ?? 'off'))} data-testid="wg-capture-state"><i aria-hidden="true" />{t('wg.capture.state', { state })}</p>
      {p.density === 'expanded' && <><p className="wg-meta">{t('wg.capture.scope')}</p><p className="wg-meta">{t('wg.capture.embark')}</p></>}
    </>
  );
}

const CARDS: Record<WidgetId, (p: CardProps) => ReactNode> = {
  toFind: ToFind, quests: Quests, shopping: Shopping, next: Next, lookup: Lookup, stash: Stash, weekly: Weekly, ops: Ops, review: Review, capture: Capture,
};
export function WidgetCard({ id, ...p }: CardProps & { id: WidgetId }) {
  const C = CARDS[id];
  return <C {...p} />;
}
