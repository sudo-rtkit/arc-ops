/* Karta předmětu „Proč to potřebuju?“ (0.18.0). Výpočet je v src/core/itemCard.ts (z existující logiky rady, Planneru,
   úkolů, workshopu, přípravy na raid, recyklace a typů míst); tady je jen zobrazení. Karta je boční dialog nad
   aktuálním modulem: v hlavním okně i v overlayi (plné moduly), z kompaktu se otevře v aplikaci. Odkaz na zdroj
   potřeby kartu zavře a otevře modul (v overlayi v záložce Aplikace). Neznámé údaje se ukážou jako neznámé. */
import { useMemo, type ReactNode } from 'react';
import { ArrowRight, Map as MapIcon, Pin, PinOff } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, Dialog, cx } from './components';
import { itemCard, type CardNeed, type ItemCardData } from '../core/itemCard';
import { coinPrice } from '../core/itemdb';
import { sourceLabel } from '../core/gametext';
import { dayKey } from '../core/util';
import { ADVICE_TONE, adviceKey, adviceLines, verdictText } from './Advice';
import { AreaBadges } from './MapView';
import { fmt, fmtDec } from './format';
import { useT, type TFn } from '../i18n/react';
import type { Key } from '../i18n';

export const openItemCard = (name: string): void => useUi.getState().openItemCard(name);

/* Název předmětu jako odkaz na kartu. Viditelný text zůstává stejný (název), aby tabulky vypadaly jako dřív. */
export function ItemLink({ name, children, className }: { name: string; children?: ReactNode; className?: string }) {
  const t = useT();
  return (
    <button type="button" className={cx('link-btn item-link', className)} onClick={() => openItemCard(name)} title={t('icard.openTitle', { name })} data-item-link={name}>
      {children ?? name}
    </button>
  );
}

const Unknown = () => { const t = useT(); return <span className="muted" data-unknown="true">{t('icard.unknown')}</span>; };
const Fact = ({ label, children, id }: { label: string; children: ReactNode; id: string }) => (
  <div className="ic-fact" data-fact={id}><dt>{label}</dt><dd>{children}</dd></div>
);

function needWhy(n: CardNeed, t: TFn): string {
  if (n.questItem) return t('icard.need.questItem');
  return t(`icard.need.kind.${n.kind}` as Key);
}

function NeedRow({ n, have, onGo }: { n: CardNeed; have: number; onGo: (r: CardNeed['route']) => void }) {
  const t = useT();
  const counted = n.when === 'now' && !n.questItem;
  return (
    <li className={cx('ic-need', n.when === 'later' && 'later')} data-need={n.kind} data-when={n.when}>
      <span className="grow">
        <button type="button" className="link-btn" onClick={() => onGo(n.route)}>{n.label}<ArrowRight size={12} aria-hidden="true" /></button>
        <small className="meta"> {needWhy(n, t)}</small>
      </span>
      <span className="mono">{fmt(n.qty)}×</span>
      {counted && <span className={cx('mono meta', have >= n.qty ? 'success' : 'amber')}>{t('icard.need.have', { have: Math.min(have, n.qty), qty: n.qty })}</span>}
      {n.when === 'later' && <Badge>{t('icard.need.later')}</Badge>}
    </li>
  );
}

function Verdict({ c }: { c: ItemCardData }) {
  const t = useT();
  if (c.verdict.basis === 'stock') {
    const a = c.verdict.advice;
    return (
      <div className="ic-verdict" data-testid="item-card-verdict" data-kind={a.kind} data-basis="stock">
        <div className="row"><Badge tone={ADVICE_TONE[a.kind]}>{t(adviceKey(a.kind))}</Badge>
          <span className="meta">{t('icard.verdict.stock', { count: c.have })}</span></div>
        <ul className="ic-lines">{adviceLines(a, t).map((l, i) => <li key={i}>{l}</li>)}</ul>
        <Btn size="sm" variant="ghost" icon={a.override ? PinOff : Pin} aria-pressed={a.override} onClick={() => actions.adviceKeep(a.key, !a.override)}>
          {a.override ? t('advice.keepOff', { name: c.name }) : t('advice.keepOn', { name: c.name })}
        </Btn>
      </div>
    );
  }
  const v = c.verdict.verdict;
  return (
    <div className="ic-verdict" data-testid="item-card-verdict" data-kind={v.kind} data-basis="found">
      <div className="row"><Badge tone={ADVICE_TONE[v.kind]}>{t(adviceKey(v.kind))}</Badge><span className="meta">{t('icard.verdict.found')}</span></div>
      <p>{verdictText(v, t)}</p>
    </div>
  );
}

function CardBody({ c, onGo }: { c: ItemCardData; onGo: (r: CardNeed['route']) => void }) {
  const t = useT();
  const now = c.needs.filter(n => n.when === 'now');
  const later = c.needs.filter(n => n.when === 'later');
  const rarity = c.rarity === 'unknown' ? <Unknown /> : <span className={cx('ic-rarity', 'r-' + c.rarity)}>{t(`ops.rarity.${c.rarity}` as Key)}</span>;
  return (
    <>
      {!c.known && <p className="meta" data-testid="item-card-unknown">{t('icard.notInData')}</p>}
      <dl className="ic-facts" data-testid="item-card-facts">
        <Fact id="rarity" label={t('icard.rarity')}>{rarity}</Fact>
        <Fact id="type" label={t('icard.type')}>{c.type ?? <Unknown />}</Fact>
        <Fact id="value" label={t('icard.value')}>{c.value !== null ? fmt(c.value) : <Unknown />}</Fact>
        <Fact id="weight" label={t('icard.weight')}>{c.weight !== null ? t('icard.kg', { n: fmtDec(c.weight, 2) }) : <Unknown />}</Fact>
        <Fact id="stack" label={t('icard.stack')}>{c.stack !== null ? fmt(c.stack) : <Unknown />}</Fact>
        <Fact id="have" label={t('icard.have')}><b className="mono" data-testid="item-card-have">{fmt(c.have)}</b></Fact>
        {c.source && <Fact id="source" label={t('inv.source')}>{sourceLabel(c.name, c.source, t.lang)}</Fact>}
        {c.needsBlueprint && <Fact id="bp" label={t('icard.blueprint')}>{t('icard.blueprintNeeded')}</Fact>}
        {c.blueprint.is && <Fact id="learned" label={t('icard.blueprint')}>{c.blueprint.learned ? t('icard.bpLearned') : t('icard.bpNotLearned')}</Fact>}
      </dl>

      <Verdict c={c} />

      <section className="ic-sec" data-testid="item-card-needs" aria-labelledby="ic-needs">
        <h3 id="ic-needs">{t('icard.needed')}</h3>
        {c.need > 0
          ? <p data-testid="item-card-need-sum"><b>{t('icard.needSum', { need: c.need, have: Math.min(c.have, c.need) })}</b> {c.missing > 0 ? <span className="amber">{t('icard.missing', { n: c.missing })}</span> : <span className="success">{t('icard.enough')}</span>}</p>
          : <p className="meta" data-testid="item-card-need-sum">{t('icard.notNeeded')}</p>}
        {now.length > 0 && <ul className="ic-needs">{now.map(n => <NeedRow key={n.key + (n.questItem ? ':q' : '')} n={n} have={c.have} onGo={onGo} />)}</ul>}
        {c.plan && (
          <div className="ic-plan" data-testid="item-card-plan">
            <span className="mv-eyebrow">{t('icard.plan')}</span>
            <p>{t('icard.planRow', { need: c.plan.need, have: c.plan.have, missing: c.plan.missing })}{c.plan.found && <> · <Badge tone="success">{t('icard.planFound')}</Badge></>}</p>
            <button type="button" className="link-btn" onClick={() => onGo({ module: 'raid' })}>{t('nav.raidPrep')}<ArrowRight size={12} aria-hidden="true" /></button>
          </div>
        )}
        {later.length > 0 && <>
          <h4 className="meta">{t('icard.later')}</h4>
          <ul className="ic-needs">{later.map(n => <NeedRow key={n.key} n={n} have={c.have} onGo={onGo} />)}</ul>
        </>}
      </section>

      <section className="ic-sec" data-testid="item-card-recycle" aria-labelledby="ic-recy">
        <h3 id="ic-recy">{t('icard.recycle')}</h3>
        <p>{c.recycle.length ? <>{t('icard.recycleInto')} {c.recycle.map(([n, q], i) => <span key={n}>{i > 0 && ', '}{fmt(q)}× <ItemLink name={n} /></span>)}</> : <><span>{t('icard.recycleInto')}</span> <Unknown /></>}</p>
        <p className="meta">{t('icard.salvage')} <Unknown /></p>
        {c.recycleFrom.length > 0 && <>
          <p>{t('icard.recycleFrom', { count: c.recycleFrom.length })}</p>
          <ul className="ic-list">{c.recycleFrom.slice(0, 8).map(x => <li key={x.name}><ItemLink name={x.name} /> <span className="meta">{t('icard.yield', { n: x.qty })}</span></li>)}</ul>
          {c.recycleFrom.length > 8 && <p className="meta">{t('icard.moreSources', { count: c.recycleFrom.length - 8 })}</p>}
        </>}
      </section>

      <section className="ic-sec" data-testid="item-card-areas" aria-labelledby="ic-areas">
        <h3 id="ic-areas">{t('icard.areas')}</h3>
        {c.areas.length ? <AreaBadges areas={c.areas} /> : <p><Unknown /></p>}
        {c.areas.length > 0 && (c.pois.length ? (
          <ul className="ic-list" data-testid="item-card-pois">{c.pois.slice(0, 12).map(p => (
            <li key={p.map + p.id}><button type="button" className="link-btn" onClick={() => onGo({ module: 'maps', sub: p.map })}><MapIcon size={12} aria-hidden="true" />{p.mapName}</button> <span>{p.name || t('icard.poiNoName')}</span> <span className="meta">{p.area}</span></li>
          ))}</ul>
        ) : <p className="meta">{t('icard.noPois')}</p>)}
      </section>

      {c.offers.length > 0 && (
        <section className="ic-sec" aria-labelledby="ic-offers">
          <h3 id="ic-offers">{t('icard.offers')}</h3>
          <ul className="ic-list">{c.offers.map((o, i) => {
            const coins = coinPrice(o);
            return <li key={o.trader + i}><b>{o.trader}</b> <span className="meta">{coins !== null ? t('icard.price', { n: coins }) : o.cost.map(([n, q]) => `${fmt(q)}× ${n}`).join(', ')}</span></li>;
          })}</ul>
        </section>
      )}
    </>
  );
}

function ItemCardDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const s = useAppState();
  const t = useT();
  const today = dayKey(Date.now());
  const c = useMemo(() => itemCard(s, name, t.lang, today), [s, name, t.lang, today]);
  const go = (r: CardNeed['route']) => { onClose(); navigate(r.module, r.sub); };
  return (
    <Dialog title={c.name} size="side" onClose={onClose} initialFocus=".item-card"
      footer={<>
        {c.weapon && <Btn size="sm" variant="ghost" onClick={() => go({ module: 'weapons' })}>Weapons</Btn>}
        <Btn size="sm" variant="ghost" onClick={() => go({ module: 'items' })}>Item Database</Btn>
        <Btn size="sm" onClick={onClose}>{t('common.close')}</Btn>
      </>}>
      <div className="item-card" data-testid="item-card" data-item={c.name} tabIndex={-1}>
        <p className="meta ic-kicker">{t('icard.kicker')}</p>
        <CardBody c={c} onGo={go} />
      </div>
    </Dialog>
  );
}

/* Jedna karta na okno (hlavní okno v plném režimu, overlay). */
export function ItemCardHost() {
  const name = useUi(u => u.itemCard);
  const close = useUi(u => u.closeItemCard);
  return name ? <ItemCardDialog key={name} name={name} onClose={close} /> : null;
}
