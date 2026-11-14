/* Loadout Planner (záložka Weapons): uložené sestavy a jejich výsledky z Raid Journalu.
   0.23.0: loadout builder. Sestava podle míst ve hře (augment, štít, dvě zbraně s tierem, BACKPACK, QUICK USE,
   AUGMENTED SLOTS, SAFE POCKET), počty míst a mez váhy (výchozí podle obrazovek hry, upravitelné), živý souhrn
   (hodnota podle katalogu s vyznačenými neznámými cenami, váha proti mezi, dostupnost ve skrýši, hodnota v riziku
   bez bezpečné kapsy), chybějící předměty do nákupního seznamu, porovnání dvou loadoutů a předvyplnění ze snímku
   MANAGE LOADOUT nebo FINDINGS přes kontrolu (nic se nezapíše bez potvrzení). Názvy předmětů zůstávají anglicky. */
import { useMemo, useState } from 'react';
import { Copy, Crosshair, GitCompareArrows, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, Check, ConfirmButton, Dialog, Empty, IconBtn, NumberField, Panel, Select, cx } from '../ui/components';
import { ItemList, itemsText } from '../ui/ItemList';
import { DASH, fmt, pct } from '../ui/format';
import {
  LIST_SECTIONS, LOADOUT_PRESETS, LOADOUT_PURPOSES, SLOT_MAX, WEIGHT_MAX, compareLoadouts, emptyLoadout, loadoutStats, loadoutSummary,
  sectionItems, switchKind, usableSections, weaponLabel, withSectionItems, type LoadoutSummary,
} from '../core/loadouts';
import { purposeLabel } from '../core/gametext';
import { TIER_ORDER } from '../core/data/weapons';
import { ITEM_DATA } from '../core/data/itemdata';
import { ITEM_TIERS, type ItemTier, type Loadout, type LoadoutKind } from '../core/types';
import { LoadoutScan } from '../ui/LoadoutScan';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

const tierIdx = (t: string): number => { const i = (TIER_ORDER as readonly string[]).indexOf(t); return i < 0 ? 9 : i; };
const AUGMENTS = ITEM_DATA.filter(r => r.ty === 'Augment').map(r => r.n);
const SHIELDS = ITEM_DATA.filter(r => r.ty === 'Shield').map(r => r.n);
const kg = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* Souhrn: hodnota, váha, riziko, dostupnost, místa. Neznámé ceny a váhy se vypíšou (nic se nedopočítává). */
export function LoadoutSummaryView({ sum, compact }: { sum: LoadoutSummary; compact?: boolean }) {
  const t = useT();
  const missing = sum.missing.reduce((a, r) => a + r.missing, 0);
  return (
    <div className="lo-sum stack-sm" data-testid="lo-summary">
      <div className="lo-kpis">
        <div className="lo-kpi" data-testid="lo-value"><span className="mv-eyebrow">{t('lo.value')}</span><b className="mono">{fmt(sum.value)}</b>
          {sum.valueUnknown.length > 0 && <span className="meta amber" title={sum.valueUnknown.join(', ')}>{t('lo.unknownCount', { count: sum.valueUnknown.length })}</span>}</div>
        <div className={cx('lo-kpi', sum.weightOver && 'danger')} data-testid="lo-weight"><span className="mv-eyebrow">{t('lo.weight')}</span>
          <b className="mono">{kg(sum.weight)} / {sum.weightMax === null ? '?' : kg(sum.weightMax)}</b>
          {sum.weightOver && <span className="meta danger-text">{t('lo.weightOver')}</span>}
          {sum.weightUnknown.length > 0 && <span className="meta amber" title={sum.weightUnknown.join(', ')}>{t('lo.unknownCount', { count: sum.weightUnknown.length })}</span>}</div>
        <div className="lo-kpi" data-testid="lo-risk"><span className="mv-eyebrow">{t('lo.risk')}</span><b className="mono">{fmt(sum.risk)}</b>
          {sum.free ? <span className="meta">{t('lo.riskFree')}</span>
            : <span className="meta">{sum.safeValue > 0 ? t('lo.riskSafe', { value: fmt(sum.safeValue) }) : t('lo.riskHint')}</span>}
          {sum.riskUnknown.length > 0 && <span className="meta amber" title={sum.riskUnknown.join(', ')}>{t('lo.unknownCount', { count: sum.riskUnknown.length })}</span>}</div>
        <div className={cx('lo-kpi', missing > 0 && 'amber')} data-testid="lo-avail"><span className="mv-eyebrow">{t('lo.avail')}</span>
          <b>{sum.need.length === 0 ? DASH : missing > 0 ? t('lo.missingCount', { count: missing }) : t('lo.allHave')}</b></div>
      </div>
      {!compact && (
        <p className="meta" data-testid="lo-slots">
          {sum.slots.filter(s => s.max !== 0 || s.used > 0).map(s => (
            <span key={s.section} className={cx('lo-slot', s.over && 'danger-text')}>{t(`lo.section.${s.section}` as Key)} {s.used}/{s.max === null ? '?' : s.max}{s.over ? ' · ' + t('lo.slotsOver') : ''}</span>
          ))}
        </p>
      )}
    </div>
  );
}

/* Dostupnost ve skrýši: potřeba, máš, chybí (chybějící řádky zvýrazněné). */
function AvailabilityTable({ sum }: { sum: LoadoutSummary }) {
  const t = useT();
  if (!sum.need.length) return <p className="meta">{t('lo.availEmpty')}</p>;
  return (
    <div className="table-wrap">
      <table className="table" data-testid="lo-avail-table">
        <thead><tr><th>{t('lo.col.item')}</th><th className="num">{t('lo.col.need')}</th><th className="num">{t('lo.col.have')}</th><th className="num">{t('lo.col.missing')}</th><th className="num">{t('lo.col.value')}</th></tr></thead>
        <tbody>{sum.need.map(r => {
          const v = sum.lines.filter(x => x.name.toLowerCase() === r.name.toLowerCase());
          const unknown = v.some(x => x.value === null);
          const value = v.reduce((a, x) => a + (x.value ?? 0), 0);
          return (
            <tr key={r.name} data-item={r.name} className={r.missing ? 'lo-missing' : undefined}>
              <td><b>{r.name}</b></td>
              <td className="num mono">{fmt(r.need)}</td>
              <td className="num mono">{fmt(r.have)}</td>
              <td className="num mono">{r.missing ? <span className="danger-text">{fmt(r.missing)}×</span> : '✓'}</td>
              <td className="num mono">{unknown ? <span className="amber" title={t('lo.valueUnknown')}>?</span> : fmt(value)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function LoadoutDialog({ l, onClose }: { l: Loadout | null; onClose: () => void }) {
  const d = useDerived();
  const s = useAppState();
  const t = useT();
  const [f, setF] = useState<Loadout>(() => (l ? structuredClone(l) : { ...emptyLoadout('custom'), name: '' }));
  const weaponOpts = [{ value: '', label: t('loadout.none') }, ...[...d.weapons].sort((a, b) => tierIdx(a.tier) - tierIdx(b.tier) || a.name.localeCompare(b.name))
    .map(w => ({ value: w.id, label: `${w.name}${w.tier ? ' · ' + w.tier : ''}${w.antiArc ? ' · anti-ARC' : ''}` }))];
  for (const k of ['primary', 'secondary'] as const) if (f[k] && !d.weapons.some(w => w.id === f[k])) weaponOpts.push({ value: f[k], label: t('loadout.missingWeapon', { name: f[k] }) });
  const tierOpts = [{ value: '', label: t('lo.tierAny') }, ...ITEM_TIERS.map(x => ({ value: x, label: x }))];
  const purposes = [...LOADOUT_PURPOSES, ...(f.purpose && !LOADOUT_PURPOSES.includes(f.purpose) ? [f.purpose] : [])];
  const sum = useMemo(() => loadoutSummary(f, d.weaponName, d.loadoutHave), [f, d.weaponName, d.loadoutHave]);
  const suggestions = useMemo(() => [...new Set([...Object.values(s.items).map(i => i.key), ...Object.keys(s.inventory), ...ITEM_DATA.filter(r => r.ty !== 'Blueprint').map(r => r.n)])], [s.items, s.inventory]);
  const usable = usableSections(f);
  const save = () => { actions.saveLoadout({ ...f, id: l?.id }); onClose(); };
  const setSlot = (k: keyof Loadout['slots'], v: number) => setF(x => ({ ...x, slots: { ...x.slots, [k]: v } }));
  const setKind = (k: LoadoutKind) => setF(x => (x.kind === k ? x : switchKind(x, k)));
  return (
    <Dialog title={l ? t('loadout.editTitle', { name: l.name }) : t('loadout.new')} size="wide" onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!f.name.trim()} onClick={save}>{t('loadout.save')}</Btn></>}>
      <LoadoutScan base={f} onApply={next => setF(x => ({ ...next, id: x.id, name: x.name, purpose: x.purpose, note: x.note, shop: x.shop }))} />
      <div className="form-grid">
        <div className="field"><label className="field-label" htmlFor="lo-name">{t('common.name')}</label><input id="lo-name" className="input" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <Select label={t('loadout.purpose')} value={f.purpose || ''} onChange={v => setF({ ...f, purpose: v })} options={[{ value: '', label: t('common.notSpecified') }, ...purposes.map(p => ({ value: p, label: purposeLabel(p, t.lang) }))]} />
      </div>
      <div className="seg" role="group" aria-label={t('lo.kind')}>
        {(['custom', 'free'] as const).map(k => <button key={k} type="button" className={cx('seg-btn', f.kind === k && 'active')} aria-pressed={f.kind === k} onClick={() => setKind(k)}>{t(`lo.kind.${k}` as Key)}</button>)}
      </div>
      {f.kind === 'free' && <p className="meta">{t('lo.freeHint')}</p>}
      <div className="form-grid">
        <div className="field"><label className="field-label" htmlFor="lo-aug">Augment</label><input id="lo-aug" className="input" list="lo-aug-list" value={f.augment} maxLength={80} onChange={e => setF({ ...f, augment: e.target.value })} /></div>
        <div className="field"><label className="field-label" htmlFor="lo-sh">{t('loadout.shield')}</label><input id="lo-sh" className="input" list="lo-sh-list" value={f.shield} maxLength={80} onChange={e => setF({ ...f, shield: e.target.value })} /></div>
        <Select label={t('loadout.primary')} value={f.primary} onChange={v => setF({ ...f, primary: v })} options={weaponOpts} />
        <Select label={t('lo.primaryTier')} value={f.primaryTier} onChange={v => setF({ ...f, primaryTier: v as ItemTier | '' })} options={tierOpts} />
        <Select label={t('loadout.secondary')} value={f.secondary} onChange={v => setF({ ...f, secondary: v })} options={weaponOpts} />
        <Select label={t('lo.secondaryTier')} value={f.secondaryTier} onChange={v => setF({ ...f, secondaryTier: v as ItemTier | '' })} options={tierOpts} />
      </div>
      <datalist id="lo-aug-list">{AUGMENTS.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="lo-sh-list">{SHIELDS.map(n => <option key={n} value={n} />)}</datalist>
      <fieldset className="field lo-slots-edit">
        <legend className="field-label">{t('lo.slots')}</legend>
        <div className="form-grid">
          {LIST_SECTIONS.map(k => <NumberField key={k} label={t(`lo.section.${k}` as Key)} value={f.slots[k] ?? 0} min={0} max={SLOT_MAX} onCommit={v => setSlot(k, v)} />)}
          <NumberField label={t('lo.weightMax')} suffix="kg" value={f.slots.weight ?? 0} min={0} max={WEIGHT_MAX} decimals onCommit={v => setSlot('weight', v)} />
        </div>
        <div className="row">
          <Btn size="sm" onClick={() => setF(x => ({ ...x, slots: { ...LOADOUT_PRESETS[x.kind] } }))}>{t('lo.slotsReset')}</Btn>
          <span className="meta">{t('lo.slotsHint')}</span>
        </div>
      </fieldset>
      {LIST_SECTIONS.map(k => usable.includes(k) ? (
        <ItemList key={k} label={t(`lo.list.${k}` as Key)} items={sectionItems(f, k)} onChange={items => setF(x => withSectionItems(x, k, items))} suggestions={suggestions} empty={t('loadout.itemsEmpty')} max={40} />
      ) : (k === 'safe' || k === 'augmented') ? <p key={k} className="meta" data-testid={'lo-no-' + k}>{t(`lo.no.${k}` as Key)}</p> : null)}
      <section className="stack-sm" aria-label={t('lo.summary')}>
        <b>{t('lo.summary')}</b>
        <LoadoutSummaryView sum={sum} />
        <AvailabilityTable sum={sum} />
        <Check checked={f.shop} onChange={v => setF({ ...f, shop: v })} note={t('lo.shopNote')}>{t('lo.shop')}</Check>
      </section>
      <div className="field"><label className="field-label" htmlFor="lo-note">{t('common.note')}</label><textarea id="lo-note" className="textarea" value={f.note} maxLength={2000} onChange={e => setF({ ...f, note: e.target.value })} /></div>
      <p className="meta">{t('lo.formHint')}</p>
    </Dialog>
  );
}

/* Porovnání dvou loadoutů vedle sebe: součty a obsah míst. */
function Compare({ list }: { list: Loadout[] }) {
  const t = useT();
  const d = useDerived();
  const [a, setA] = useState(list[0]?.id ?? '');
  const [b, setB] = useState(list[1]?.id ?? '');
  const la = list.find(x => x.id === a), lb = list.find(x => x.id === b);
  const opts = list.map(x => ({ value: x.id, label: x.name }));
  const sa = la && loadoutSummary(la, d.weaponName, d.loadoutHave), sb = lb && loadoutSummary(lb, d.weaponName, d.loadoutHave);
  const rows = sa && sb ? compareLoadouts(sa, sb) : [];
  const show = (metric: string, v: number, unknown: boolean) => (metric === 'weight' ? kg(v) : fmt(v)) + (unknown ? ' +?' : '');
  const content = (l: Loadout) => [
    ['augment', l.augment], ['shield', l.shield],
    ['weapon1', l.primary ? weaponLabel(d.weaponName(l.primary), l.primaryTier) : ''], ['weapon2', l.secondary ? weaponLabel(d.weaponName(l.secondary), l.secondaryTier) : ''],
    ...LIST_SECTIONS.map(k => [k, itemsText(sectionItems(l, k))] as const),
  ] as const;
  return (
    <Panel title={t('lo.compare')} actions={<GitCompareArrows size={16} aria-hidden="true" />}>
      <div className="form-grid">
        <Select label={t('lo.compareA')} value={a} onChange={setA} options={opts} />
        <Select label={t('lo.compareB')} value={b} onChange={setB} options={opts} />
      </div>
      {la && lb && sa && sb && (
        <div className="table-wrap">
          <table className="table lo-compare" data-testid="lo-compare">
            <thead><tr><th>{t('lo.col.metric')}</th><th className="num">{la.name}</th><th className="num">{lb.name}</th><th className="num">{t('lo.col.diff')}</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.metric} data-metric={r.metric}>
                  <td>{t(`lo.metric.${r.metric}` as Key)}</td>
                  <td className="num mono">{show(r.metric, r.a, r.unknownA)}</td>
                  <td className="num mono">{show(r.metric, r.b, r.unknownB)}</td>
                  <td className="num mono">{r.diff > 0 ? '+' : ''}{r.metric === 'weight' ? kg(r.diff) : fmt(r.diff)}</td>
                </tr>
              ))}
              {content(la).map(([k, va], i) => {
                const vb = content(lb)[i][1];
                return (
                  <tr key={k} className="lo-compare-items">
                    <td>{t(`lo.section.${k}` as Key)}</td>
                    <td className="wrap">{va || DASH}</td><td className="wrap">{vb || DASH}</td><td>{va === vb ? '=' : '≠'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {a && a === b && <p className="meta">{t('lo.compareSame')}</p>}
    </Panel>
  );
}

export default function Loadouts() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const openRaid = useUi(x => x.openRaidForm);
  const [edit, setEdit] = useState<Loadout | null | undefined>(undefined);
  const stats = Object.fromEntries(loadoutStats(s.raids).map(x => [x.id, x]));
  const none = stats[''];
  return (
    <div className="stack">
      <Panel title={t('loadout.title')} actions={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setEdit(null)}>{t('loadout.new')}</Btn>}>
        {s.loadouts.length === 0 ? <Empty icon={Crosshair} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit(null)}>{t('loadout.new')}</Btn>}>{t('loadout.empty')}</Empty> : (
          <div className="cards">
            {s.loadouts.map(l => {
              const st = stats[l.id];
              const sum = loadoutSummary(l, d.weaponName, d.loadoutHave);
              return (
                <div key={l.id} className="panel" data-loadout={l.name}>
                  <div className="panel-body stack-sm">
                    <div className="row"><h3 className="grow wrap">{l.name}</h3>{l.kind === 'free' && <Badge>{t('lo.kind.free')}</Badge>}{l.purpose && <Badge>{purposeLabel(l.purpose, t.lang)}</Badge>}
                      {l.shop && sum.missing.length > 0 && <Badge tone="amber" title={t('lo.shop')}><ShoppingCart size={12} aria-hidden="true" /> {sum.missing.length}</Badge>}</div>
                    <LoadoutSummaryView sum={sum} compact />
                    <dl className="dl">
                      <dt>{t('loadout.weapons')}</dt><dd>{[[l.primary, l.primaryTier], [l.secondary, l.secondaryTier]].filter(([w]) => w).map(([w, tr]) => weaponLabel(d.weaponName(w), tr as ItemTier | '')).join(' + ') || DASH}</dd>
                      <dt>Augment</dt><dd>{l.augment || DASH}</dd>
                      <dt>{t('loadout.shield')}</dt><dd>{l.shield || DASH}</dd>
                      <dt>{t('loadout.gear')}</dt><dd className="wrap">{l.items.length + l.quickUse.length + l.safe.length + l.augmented.length ? itemsText([...l.items, ...l.quickUse, ...l.augmented, ...l.safe]) : DASH}</dd>
                      <dt>{t('loadout.results')}</dt><dd>{st ? t('loadout.resultsVal', { count: st.n, rate: pct(st.rate), ph: st.perHour ? fmt(st.perHour) + ' / h' : DASH, lost: st.lost }) : t('loadout.noRaid')}</dd>
                    </dl>
                    {sum.missing.length > 0 && <p className="meta amber" data-testid="lo-card-missing">{t('lo.missingList', { list: sum.missing.map(m => `${m.missing}× ${m.name}`).join(', ') })}</p>}
                    {l.note && <p className="meta wrap">{l.note}</p>}
                    <div className="row">
                      <Btn size="sm" variant="primary" icon={Plus} onClick={() => openRaid({ preset: { loadout: l.id } })}>{t('loadout.logRaid')}</Btn>
                      <IconBtn label={t('loadout.editAria', { name: l.name })} icon={Pencil} onClick={() => setEdit(l)} />
                      <IconBtn label={t('loadout.dupAria', { name: l.name })} icon={Copy} onClick={() => actions.duplicateLoadout(l.id)} />
                      <ConfirmButton size="sm" variant="ghost" icon={Trash2} title={t('loadout.delete')} confirmLabel={t('loadout.delete')}
                        text={<p>{t('loadout.deleteQ', { name: l.name })} {st ? t('loadout.deleteRaids', { count: st.n }) : ''}</p>} onConfirm={() => actions.deleteLoadout(l.id)}><span className="sr-only">{t('common.deleteItem', { name: l.name })}</span></ConfirmButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {none && s.loadouts.length > 0 && <p className="meta">{t('loadout.without', { count: none.n, rate: pct(none.rate) })}</p>}
      </Panel>
      {s.loadouts.length >= 2 && <Compare list={s.loadouts} />}
      {edit !== undefined && <LoadoutDialog l={edit} onClose={() => setEdit(undefined)} />}
    </div>
  );
}

