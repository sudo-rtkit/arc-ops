/* „Co je nového“ (0.19.0): karta nahoře v obsahu hlavního okna po aktualizaci. Není modální, nic neblokuje a sama
   nebere fokus (hra může běžet); fokus dostane jen po otevření z Nastavení (to je akce hráče). Body nejnovější verze
   jsou rozbalené, starší verze pod „Starší verze“. Pravidla verzí v core/whatsnew.ts, texty v core/data/whatsnew.ts.
   Během průvodce prvním spuštěním se neukazuje (průvodce má přednost, karta přijde po něm). */
import { useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { useUi } from '../store/ui';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { APP_VERSION, allReleases, pendingReleases, type WhatsNewLink } from '../core/whatsnew';
import type { WhatsNewRelease } from '../core/data/whatsnew';
import { Btn } from '../ui/components';
import { useTourShown } from './Tutorial';

/* Sama se karta ukáže jen v aplikaci (v automatizovaném prohlížeči testů jen na výslovné přání testu). */
const autoShow = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const w = window as unknown as { __arcopsWhatsNew?: boolean };
  return !navigator.webdriver || w.__arcopsWhatsNew === true;
};

export const openWhatsNew = (): void => { useUi.setState({ whatsNewOpen: true }); document.querySelector('.content')?.scrollTo(0, 0); };

function follow(link: WhatsNewLink): void {
  switch (link) {
    case 'search': useUi.getState().openSearch(); return;
    case 'advisor': navigate('dashboard'); return;
    case 'itemCard': navigate('items'); return;
    case 'overlayApp': case 'opsSettings': navigate('settings', 'ops'); return;
    case 'loadouts': navigate('weapons', 'loadouts'); return;
    case 'appLoad': navigate('settings', 'load'); return;
    default: navigate(link);
  }
}

function Release({ r, lang }: { r: WhatsNewRelease; lang: 'cs' | 'en' }) {
  const t = useT();
  const close = () => { actions.whatsNewSeen(); useUi.setState({ whatsNewOpen: false }); };
  return (
    <div className="whatsnew-release" data-version={r.version}>
      <h3><span className="mono whatsnew-v">{t('whatsNew.version', { v: r.version })}</span> {r.title[lang]}</h3>
      <ul>
        {r.items.map((it, i) => (
          <li key={i}>
            <span>{it.text[lang]}</span>
            {it.link && (
              <button type="button" className="whatsnew-link" data-link={it.link} onClick={() => { close(); follow(it.link!); }}>
                {t(`whatsNew.link.${it.link}` as Key)}<ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WhatsNew() {
  const t = useT();
  const s = useAppState();
  const open = useUi(u => u.whatsNewOpen);
  const tour = useTourShown();
  const card = useRef<HTMLElement>(null);
  const seen = s.whatsNew.seen;
  const pending = pendingReleases(seen);
  const list = open ? allReleases() : pending;
  const shown = open || (pending.length > 0 && !tour && autoShow());
  /* fokus jen po otevření z Nastavení */
  useEffect(() => { if (open) card.current?.focus({ preventScroll: true }); }, [open]);
  if (!shown || !list.length) return null;
  const lang = t.lang;
  const [first, ...older] = list;
  const close = () => { actions.whatsNewSeen(); useUi.setState({ whatsNewOpen: false }); };
  return (
    <div className="whatsnew-wrap">
      <section ref={card} tabIndex={-1} className="panel whatsnew" aria-label={t('whatsNew.label')} data-testid="whatsnew" data-mode={open ? 'all' : 'pending'}>
        <div className="panel-head">
          <h2><Sparkles size={16} aria-hidden="true" />{t('whatsNew.title')}</h2>
          <span className="meta">{!open && seen ? t('whatsNew.since', { from: seen }) : t('whatsNew.all')}</span>
          <div className="panel-actions">
            <button type="button" className="tour-x" aria-label={t('whatsNew.close')} title={t('whatsNew.close')} onClick={close}><X size={15} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="panel-body">
          <Release r={first} lang={lang} />
          {older.length > 0 && (
            <details className="whatsnew-older">
              <summary>{t('whatsNew.older', { count: older.length })}</summary>
              {older.map(r => <Release key={r.version} r={r} lang={lang} />)}
            </details>
          )}
          <div className="row whatsnew-foot">
            <Btn size="sm" variant="primary" onClick={close} data-testid="whatsnew-ok">{t('whatsNew.ok')}</Btn>
            <span className="meta mono">ARC Raiders Companion {APP_VERSION}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
