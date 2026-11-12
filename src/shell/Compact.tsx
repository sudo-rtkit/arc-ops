/* Kompaktní režim hlavního okna (0.9.0, návrh docs/design/compact/). Jeden sloupec: lišta (tažení, připnutí,
   rozbalení, minimalizace, zavření), profil, tři sbalitelné sekce (úkoly, nákupy, další vylepšení) a pevná
   spodní část s hlášením a rychlými akcemi. Posouvá se jen střed. Stejný store a stejná data jako plná aplikace;
   změny dat okno nikdy neaktivují (nebere hře fokus). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, Box, Camera, ChevronDown, CircleAlert, CircleCheck, Info, Maximize2, Minus, Pin, Plus, TriangleAlert, X } from 'lucide-react';
import { app, useApp, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { cx } from '../ui/components';
import { DASH, fmt } from '../ui/format';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { activeQuests, compactShopping, isFreshProfile, nextUpgrade } from '../core/compact';
import { MODE_KEY, PIN_KEY, SHORT_BELOW, shortcutFree } from '../core/mainWindow';
import { STATIONS } from '../core/data/stations';
import type { CompactSection } from '../core/types';
import { hotkeyLabel } from '../ops/hotkey';
import { hub } from '../ops/mainHub';
import { expandTo, winNative, windowCtl } from './windowCtl';

const STATION_MINS: Record<string, number> = Object.fromEntries(STATIONS.map(s => [s.id, s.min]));
/* posun středu a fokus se zachovají při přepnutí do plné aplikace a zpět (jen pro tuto relaci) */
let lastScroll = 0;

function useWindowHeight(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => { const on = () => setH(window.innerHeight); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return h;
}

/* Značka ARC OPS: obrys kříže z návrhu. */
const Logo = () => (
  <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden="true" className="cw-logo"><path d="M8 2h8v6h6v8h-6v6H8v-6H2V8h6z" /></svg>
);

/* Mince z návrhu (jedna mince, ne hromádka). */
const Coin = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" className="cw-coin"><circle cx="12" cy="12" r="8" /><path d="M14 8h-4v8h4M8 12h6" /></svg>
);

function Section({ id, title, count, children }: { id: CompactSection; title: string; count: string; children: ReactNode }) {
  const collapsed = useApp(s => !!s.state.mainWindow.collapsed[id]);
  return (
    <details className="cw-section" data-section={id} open={!collapsed}
      onToggle={e => { const open = (e.currentTarget as HTMLDetailsElement).open; if (open === collapsed) app.actions.setCompactCollapsed(id, !open); }}>
      <summary><span><h2>{title}</h2>{count && <span className="cw-tag mono" aria-hidden="true">{count}</span>}</span><ChevronDown size={14} className="cw-chevron" aria-hidden="true" /></summary>
      {children}
    </details>
  );
}

function EmptyRow({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return <div className="cw-empty-row"><span className="meta">{text}</span><button type="button" className="cw-link" onClick={onAction}>{action}</button></div>;
}

function Toast({ fresh, hint, onHint }: { fresh: boolean; hint: string; onHint: () => void }) {
  const t = useT();
  const notices = useApp(s => s.notices);
  const last = notices[notices.length - 1];
  /* hlášení zmizí samo jako v plné aplikaci (chyby zůstávají do zavření) */
  useEffect(() => {
    if (!last || last.tone === 'danger') return;
    const h = setTimeout(() => app.dismiss(last.id), last.tone === 'success' ? 4000 : 6000);
    return () => clearTimeout(h);
  }, [last]);
  let body: ReactNode = null;
  if (hint) body = <><Info size={15} aria-hidden="true" /><span className="grow">{hint}</span><button type="button" className="cw-icon cw-toast-x" aria-label={t('compact.toastClose')} title={t('compact.toastClose')} onClick={onHint}><X size={15} aria-hidden="true" /></button></>;
  else if (last) {
    const Icon = last.tone === 'success' ? CircleCheck : last.tone === 'danger' ? CircleAlert : last.tone === 'warning' ? TriangleAlert : Info;
    body = <><Icon size={15} aria-hidden="true" /><span className="grow">{last.text}</span><button type="button" className="cw-icon cw-toast-x" aria-label={t('compact.toastClose')} title={t('compact.toastClose')} onClick={() => app.dismiss(last.id)}><X size={15} aria-hidden="true" /></button></>;
  } else if (fresh) body = <span>{t('compact.offline')}</span>;
  const tone = hint ? 'info' : last ? last.tone : 'muted';
  return <div className={cx('cw-toast', 'tone-' + tone, !body && 'is-empty')} role="status" aria-live="polite" data-testid="compact-toast">{body}</div>;
}

export default function Compact() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const mw = s.mainWindow;
  const short = useWindowHeight() < SHORT_BELOW;
  const fresh = isFreshProfile(s, STATION_MINS);
  const [hint, setHint] = useState('');
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);

  const quests = useMemo(() => activeQuests(s, t.lang, mw.quests), [s, t.lang, mw.quests]);
  const up = useMemo(() => nextUpgrade(d.needs, d.targets, s.inventory), [d.needs, d.targets, s.inventory]);
  const shop = useMemo(() => compactShopping(up, d.shop), [up, d.shop]);

  /* posun středu zpět po návratu z plné aplikace; fokus na rozbalení jen když okno už fokus má (žádná aktivace) */
  useLayoutEffect(() => {
    const el = content.current;
    if (el) el.scrollTop = lastScroll;
    if (windowCtl.justSwitched() && document.hasFocus() && (document.activeElement === document.body || !document.activeElement)) expandBtn.current?.focus({ preventScroll: true });
    return () => { lastScroll = el?.scrollTop ?? 0; };
  }, []);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const showHint = (text: string) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 6000);
  };

  /* Snímek: stávající cesta buddyho (revize v overlayi a potvrzení zápisu); bez buddyho nebo zkratky jen nápověda */
  const capReason: Key | null = !winNative.available ? 'compact.capture.web' : !s.buddy.enabled ? 'compact.capture.off' : !s.buddy.hotkey ? 'compact.capture.noKey' : null;
  const capture = () => {
    if (capReason) { showHint(t(capReason)); return; }
    void hub.captureFromApp().then(ok => { if (!ok) showHint(t('compact.capture.off')); });
  };

  /* tažení za volnou plochu lišty (tlačítka jsou vyloučena) */
  const onBarDown = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    void winNative.drag().catch(() => undefined);
  };

  const modeKey = shortcutFree(MODE_KEY, s.buddy.hotkey) ? hotkeyLabel(MODE_KEY) : '';
  const pinKey = shortcutFree(PIN_KEY, s.buddy.hotkey) ? hotkeyLabel(PIN_KEY) : '';
  const pinLabel = pinKey ? t('compact.pinKey', { key: pinKey }) : t('compact.pin');
  const expandLabel = modeKey ? t('compact.expandKey', { key: modeKey }) : t('compact.expand');
  const p = s.profile;
  const xpPct = !fresh && p.xpNext > 0 ? Math.min(100, (p.xp / p.xpNext) * 100) : 0;
  const ops = fresh ? 'waiting' : s.buddy.enabled ? 'ready' : 'off';
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={cx('cw', short && 'cw--short', fresh && 'cw--fresh', mw.pin && 'cw--pinned')} data-testid="compact" role="region" aria-label={t('compact.label')}>
      <header className="cw-titlebar" onMouseDown={onBarDown}>
        <div className="cw-brand"><Logo />ARC OPS</div>
        <div className="cw-controls">
          <button type="button" className="cw-icon" aria-pressed={mw.pin} aria-label={t('compact.pin')} title={pinLabel} aria-keyshortcuts={pinKey ? 'Control+Shift+P' : undefined}
            data-testid="compact-pin" onClick={() => void windowCtl.togglePin()}><Pin size={17} aria-hidden="true" /></button>
          <button type="button" ref={expandBtn} className="cw-icon" aria-label={t('compact.expand')} title={expandLabel} aria-keyshortcuts={modeKey ? 'Control+Shift+M' : undefined}
            data-testid="compact-expand" onClick={() => void windowCtl.setMode('full')}><Maximize2 size={17} aria-hidden="true" /></button>
          <button type="button" className="cw-icon" aria-label={t('compact.min')} title={t('compact.min')} onClick={() => void winNative.minimize().catch(() => undefined)}><Minus size={17} aria-hidden="true" /></button>
          <button type="button" className="cw-icon" aria-label={t('compact.close')} title={t('compact.close')} data-testid="compact-close" onClick={() => void windowCtl.requestClose()}><X size={17} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="cw-profile">
        <div className="cw-row cw-spread">
          <div className="cw-level" aria-label={fresh ? t('compact.levelNone') : t('compact.levelAria', { n: p.level })}><small aria-hidden="true">{t('compact.lv')}</small><span aria-hidden="true">{fresh ? DASH : p.level}</span></div>
          <div className={cx('cw-ops', 'ops-' + ops)} data-testid="compact-ops"><span className="cw-dot" aria-hidden="true" />{t(`compact.ops.${ops}` as Key)}</div>
          <div className="cw-coins mono" aria-label={fresh ? t('compact.coinsNone') : t('compact.coinsAria', { n: p.coins })}><Coin /><span aria-hidden="true">{fresh ? DASH : fmt(p.coins)}</span></div>
        </div>
        <div className="cw-xp">
          <div className="cw-track" role="progressbar" aria-label="XP" aria-valuemin={0} aria-valuemax={p.xpNext || 0} aria-valuenow={fresh ? 0 : Math.min(p.xp, p.xpNext || p.xp)}
            aria-valuetext={fresh || !p.xpNext ? t('compact.xpNone') : undefined}><i style={{ width: xpPct + '%' }} /></div>
          <span className="cw-meta mono">{fresh ? 'XP ' + DASH : p.xpNext > 0 ? t('compact.xp', { xp: p.xp, next: p.xpNext }) : t('compact.xpOnly', { xp: p.xp })}</span>
        </div>
      </div>

      <div className="cw-content" ref={content}>
        {fresh ? (
          <div className="cw-empty" data-testid="compact-empty">
            <div className="cw-empty-art" aria-hidden="true"><Box size={26} /></div>
            <h2>{t('compact.empty.title')}</h2>
            <p>{t('compact.empty.text')}</p>
            <button type="button" className="btn primary" onClick={() => void expandTo('profile')}>{t('compact.empty.cta')}<ArrowRight size={16} aria-hidden="true" /></button>
            <span className="cw-meta">{t('compact.empty.hint')}</span>
          </div>
        ) : (
          <>
            <Section id="quests" title={t('compact.quests')} count={pad(quests.length)}>
              {quests.length === 0 ? <EmptyRow text={t('compact.empty.quests')} action={t('compact.empty.questsAction')} onAction={() => void expandTo('quests')} /> : (
                <ul className="cw-list" data-testid="compact-quests">{quests.map(q => (
                  <li key={q.id} className="cw-quest" data-quest={q.id}>
                    <div className="cw-row cw-spread">
                      <span className="cw-quest-title" title={q.trader}>{q.pinned && <Pin size={12} className="cw-pinned" aria-label={t('compact.pinned')} />}{q.name}</span>
                      {q.need > 0
                        ? <span className={cx('mono', q.have > 0 ? 'accent' : 'muted')} aria-label={t('compact.questAria', { name: q.name, have: q.have, need: q.need })}>{q.have}/{q.need}</span>
                        : <span className="cw-meta">{t('compact.objectives', { count: q.objectives })}</span>}
                    </div>
                    {q.need > 0 && <div className="cw-track" aria-hidden="true"><i style={{ width: (q.have / q.need) * 100 + '%' }} /></div>}
                  </li>
                ))}</ul>
              )}
            </Section>
            <Section id="shop" title={t('compact.shop')} count={pad(shop.rows.length)}>
              {shop.rows.length === 0 ? <EmptyRow text={t('compact.empty.shop')} action={t('compact.empty.shopAction')} onAction={() => void expandTo('inventory', 'planner')} /> : (
                <>
                  <div className="cw-table-head" aria-hidden="true"><span>{shop.forUpgrade && up ? t('compact.shopFor', { name: `${up.station.name} ${up.level}` }) : t('compact.shopAll')}</span><span>{t('compact.have')}</span></div>
                  <ul className="cw-list" data-testid="compact-shop">{shop.rows.map(r => {
                    const word = t(`ops.rarity.${r.rarity}` as Key);
                    return (
                      <li key={r.mat} className="cw-mat" data-mat={r.mat} data-rarity={r.rarity} title={word} aria-label={t('compact.matAria', { name: r.mat, rarity: word, have: r.have, need: r.need })}>
                        <i className={cx('cw-rarity', 'r-' + r.rarity)} aria-hidden="true" />
                        <span className="cw-item" aria-hidden="true">{r.mat}<small>{word}</small></span>
                        <span className="mono cw-qty" aria-hidden="true">{fmt(r.have)} <em>/ {fmt(r.need)}</em></span>
                      </li>
                    );
                  })}</ul>
                </>
              )}
            </Section>
            <Section id="upgrade" title={t('compact.upgrade')} count="">
              {!up ? <EmptyRow text={t('compact.empty.upgrade')} action={t('compact.empty.upgradeAction')} onAction={() => void expandTo('workshop')} /> : (
                <div data-testid="compact-upgrade">
                  <div className="cw-upgrade">
                    <strong>{up.station.name} <span className="muted" aria-hidden="true">→</span> {up.level}</strong>
                    <span className={cx('cw-badge mono', up.missing === 0 && 'ok')}>{up.missing > 0 ? t('compact.missing', { count: up.missing }) : t('compact.ready')}</span>
                  </div>
                  {up.missing > 0 && <div className="cw-missing">{up.mats.filter(m => m.missing > 0).map((m, i) => <span key={m.mat}>{i > 0 && ' · '}{m.mat} <b>−{fmt(m.missing)}</b></span>)}</div>}
                  {up.block && <div className="cw-meta cw-block">{up.block}</div>}
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      <footer className="cw-footer">
        <Toast fresh={fresh} hint={hint} onHint={() => setHint('')} />
        {!fresh && (
          <div className="cw-actions">
            <button type="button" className={cx('btn primary', capReason && 'is-off')} aria-disabled={capReason ? true : undefined} data-testid="compact-capture"
              title={capReason ? t(capReason) : s.buddy.hotkey ? t('compact.captureKey', { key: hotkeyLabel(s.buddy.hotkey) }) : undefined} onClick={capture}>
              <Camera size={16} aria-hidden="true" />{t('compact.capture')}{s.buddy.hotkey && !capReason && <span className="cw-key" aria-hidden="true">{hotkeyLabel(s.buddy.hotkey)}</span>}
            </button>
            <button type="button" className="btn" onClick={() => void expandTo('journal', undefined, () => useUi.getState().openRaidForm())}><Plus size={16} aria-hidden="true" />{t('compact.raid')}</button>
            <button type="button" className="btn ghost cw-stash" onClick={() => void expandTo('inventory', 'cleanup')}><Box size={15} aria-hidden="true" />{t('compact.stash')}</button>
          </div>
        )}
      </footer>
    </div>
  );
}
