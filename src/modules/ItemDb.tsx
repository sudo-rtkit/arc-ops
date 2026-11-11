/* Item Database (milník 4): recyklace tam i zpět, blueprinty s ručním odškrtnutím a nabídka obchodníků
   z veřejných dat ARC Tracker (statická data, vždy s datem), a vlastní tier list. */
import { useMemo, useState } from 'react';
import { actions, navigate, useAppState } from '../store';
import { Badge, Empty, PageHead, Panel, Search, Select, Tabs, cx } from '../ui/components';
import { BLUEPRINTS, ITEMS_DATE, TRADERS, TRADER_OFFERS, blueprintTarget, coinPrice, recyclable, recycleMaterials, recycleSources } from '../core/itemdb';
import { haveOfState } from '../core/advice';
import { fmt } from '../ui/format';
import TierList from './TierList';
import { useT } from '../i18n/react';

type Tab = 'recycle' | 'blueprints' | 'traders' | 'tiers';
const LIMIT = 60;
const qtyList = (list: [string, number][]) => list.map(([n, q]) => `${fmt(q)}× ${n}`).join(', ');

function Recycling() {
  const s = useAppState();
  const t = useT();
  const haveOf = useMemo(() => haveOfState(s), [s]);
  const [q, setQ] = useState('');
  const [mat, setMat] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const all = recyclable();
  const found = all.filter(r => (!q || r.n.toLowerCase().includes(q.toLowerCase())) && (!ownedOnly || haveOf(r.n) > 0));
  const sources = mat ? recycleSources(mat).filter(x => !ownedOnly || haveOf(x.name) > 0) : [];
  return (
    <>
      <Panel title={t('recy.reverse')} flush>
        <div className="filter-bar" style={{ padding: '0 16px' }}>
          <div style={{ width: 280 }}><Select label={t('recy.material')} value={mat} onChange={setMat} options={[{ value: '', label: t('recy.choose') }, ...recycleMaterials().map(m => ({ value: m, label: m }))]} /></div>
          <label className="toggle" style={{ height: 36 }}><input type="checkbox" checked={ownedOnly} onChange={e => setOwnedOnly(e.target.checked)} />{t('recy.ownedOnly')}</label>
          {mat && <span className="meta" aria-live="polite" data-testid="recycle-sources-count">{t('recy.count', { count: sources.length })}</span>}
        </div>
        {mat && <p className="meta" style={{ padding: '0 16px' }}>{t('recy.hint')}</p>}
        {mat && (sources.length === 0 ? <Empty>{t('recy.none')}</Empty> : (
          <div className="table-wrap tall">
            <table className="table mat-table" data-testid="recycle-sources">
              <thead><tr><th>{t('cleanup.item')}</th><th className="num">{t('recy.yield')}</th><th className="num">{t('recy.owned')}</th><th className="num">{t('recy.value')}</th><th>{t('recy.all')}</th></tr></thead>
              <tbody>{sources.map(x => {
                const have = haveOf(x.name);
                return (
                  <tr key={x.name} className={cx(have > 0 && 'selected')} data-owned={have > 0 ? 'yes' : 'no'}>
                    <td><b className="wrap">{x.name}</b> <span className="meta">{x.type}</span></td>
                    <td className="num">{fmt(x.qty)}</td>
                    <td className="num">{have > 0 ? <Badge tone="success">{fmt(have)}</Badge> : <span className="muted">0</span>}</td>
                    <td className="num">{x.value ? fmt(x.value) : <span className="muted">—</span>}</td>
                    <td className="meta wrap">{qtyList(x.outputs)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ))}
      </Panel>
      <Panel title={t('recy.title')} flush>
        <div className="filter-bar" style={{ padding: '0 16px' }}>
          <Search label={t('recy.search')} value={q} onChange={setQ} placeholder={t('recy.searchPh')} />
          <span className="meta" aria-live="polite">{t('recy.count', { count: found.length })}</span>
        </div>
        {found.length === 0 ? <Empty>{t('filter.none')}</Empty> : (
          <div className="table-wrap tall">
            <table className="table mat-table" data-testid="recycle-items">
              <thead><tr><th>{t('cleanup.item')}</th><th className="num">{t('recy.owned')}</th><th>{t('recy.into')}</th><th className="num">{t('recy.value')}</th></tr></thead>
              <tbody>{found.slice(0, LIMIT).map(r => {
                const have = haveOf(r.n);
                return (
                  <tr key={r.n} className={cx(have > 0 && 'selected')}>
                    <td><b className="wrap">{r.n}</b> <span className="meta">{r.ty}</span></td>
                    <td className="num">{have > 0 ? <Badge tone="success">{fmt(have)}</Badge> : <span className="muted">0</span>}</td>
                    <td className="wrap">{(r.r ?? []).map(([n, qn], i) => <span key={n}>{i > 0 && ', '}<button type="button" className="link-btn" onClick={() => setMat(n)}>{fmt(qn)}× {n}</button></span>)}</td>
                    <td className="num">{r.v ? fmt(r.v) : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {found.length > LIMIT && <p className="meta" style={{ padding: '0 16px' }}>{t('recy.more', { n: LIMIT })}</p>}
      </Panel>
    </>
  );
}

function Blueprints() {
  const s = useAppState();
  const t = useT();
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const learned = BLUEPRINTS.filter(b => s.blueprints[b.n]).length;
  const rows = BLUEPRINTS.filter(b => (!q || b.n.toLowerCase().includes(q.toLowerCase())) && (!missing || !s.blueprints[b.n]));
  return (
    <Panel title={t('bp.title')} flush actions={<span className="meta mono" data-testid="bp-progress">{t('bp.progress', { n: learned, total: BLUEPRINTS.length })}</span>}>
      <p className="meta" style={{ padding: '0 16px' }}>{t('bp.hint')}</p>
      <div className="filter-bar" style={{ padding: '0 16px' }}>
        <Search label={t('bp.search')} value={q} onChange={setQ} />
        <label className="toggle" style={{ height: 36 }}><input type="checkbox" checked={missing} onChange={e => setMissing(e.target.checked)} />{t('bp.missingOnly')}</label>
        <span className="meta" aria-live="polite" data-testid="bp-count">{t('recy.count', { count: rows.length })}</span>
      </div>
      {rows.length === 0 ? <Empty>{t('filter.none')}</Empty> : (
        <div className="table-wrap tall">
          <table className="table mat-table">
            <thead><tr><th>{t('bp.title')}</th><th>{t('bp.unlocks')}</th><th className="num">{t('recy.value')}</th></tr></thead>
            <tbody>{rows.map(b => {
              const inStash = s.items[b.n]?.count || 0;
              return (
                <tr key={b.n} data-blueprint={b.n} className={cx(!!s.blueprints[b.n] && 'selected')}>
                  <td><label className="toggle"><input type="checkbox" checked={!!s.blueprints[b.n]} onChange={e => actions.blueprintSet(b.n, e.target.checked)} aria-label={t('bp.learned', { name: b.n })} /><b className="wrap">{b.n}</b></label>
                    {inStash > 0 && <> <Badge tone="amber">{t('bp.inStash', { n: inStash })}</Badge></>}</td>
                  <td>{blueprintTarget(b.n)}</td>
                  <td className="num">{b.v ? fmt(b.v) : <span className="muted">—</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Traders() {
  const t = useT();
  const [trader, setTrader] = useState('');
  const [q, setQ] = useState('');
  const rows = TRADER_OFFERS.filter(o => (!trader || o.trader === trader) && (!q || o.item.toLowerCase().includes(q.toLowerCase())));
  return (
    <Panel title={t('tr.title')} flush>
      <p className="meta" style={{ padding: '0 16px' }} data-testid="traders-date">{t('tr.hint', { date: ITEMS_DATE })}</p>
      <div className="filter-bar" style={{ padding: '0 16px' }}>
        <div style={{ width: 200 }}><Select label={t('tr.trader')} value={trader} onChange={setTrader} options={[{ value: '', label: t('common.all') }, ...TRADERS.map(x => ({ value: x, label: x }))]} /></div>
        <Search label={t('tr.search')} value={q} onChange={setQ} />
        <span className="meta" aria-live="polite" data-testid="traders-count">{t('tr.count', { count: rows.length })}</span>
      </div>
      {rows.length === 0 ? <Empty>{t('filter.none')}</Empty> : (
        <div className="table-wrap tall">
          <table className="table mat-table">
            <thead><tr><th>{t('tr.trader')}</th><th>{t('tr.item')}</th><th className="num">{t('tr.price')}</th><th className="num">{t('tr.qty')}</th><th className="num">{t('tr.limit')}</th><th className="num">{t('tr.level')}</th></tr></thead>
            <tbody>{rows.map((o, i) => {
              const coins = coinPrice(o);
              return (
                <tr key={`${o.trader}-${o.item}-${i}`}>
                  <td>{o.trader}</td>
                  <td><b className="wrap">{o.item}</b></td>
                  <td className="num">{coins !== null ? fmt(coins) : qtyList(o.cost)}</td>
                  <td className="num">{fmt(o.qty ?? 1)}</td>
                  <td className="num">{o.limit ? t('tr.limitVal', { n: o.limit, h: o.refreshH ?? 24 }) : <span className="muted">{t('tr.noLimit')}</span>}</td>
                  <td className="num">{o.level ? fmt(o.level) : <span className="muted">—</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function ItemDb({ sub }: { sub: string }) {
  const t = useT();
  const tab: Tab = sub === 'blueprints' || sub === 'traders' || sub === 'tiers' ? sub : 'recycle';
  return (
    <div className="page">
      <PageHead title="Item Database" sub={t('idb.sub')} />
      <Tabs label="Item Database" value={tab} onChange={v => navigate('items', v === 'recycle' ? '' : v)}
        tabs={[{ id: 'recycle', label: t('idb.tab.recycle') }, { id: 'blueprints', label: t('idb.tab.blueprints') }, { id: 'traders', label: t('idb.tab.traders') }, { id: 'tiers', label: t('idb.tab.tiers') }]} />
      {tab === 'recycle' && <Recycling />}
      {tab === 'blueprints' && <Blueprints />}
      {tab === 'traders' && <Traders />}
      {tab === 'tiers' && <TierList />}
      {tab !== 'tiers' && <p className="meta">{t('idb.data', { date: ITEMS_DATE })}</p>}
    </div>
  );
}
