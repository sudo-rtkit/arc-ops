import { useState, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { MODULES, moduleName } from './modules';
import { cx } from '../ui/components';
import { useT } from '../i18n/react';
import { useUi } from '../store/ui';

type Tip = { text: string; x: number; y: number } | null;

/* Tooltip kompaktní navigace: portál do body (position: fixed), aby ho neořízl scrollující .nav.
   Zobrazí se při najetí myší i při klávesnicovém focusu; jméno položky zůstává v aria-label. */
function useNavTip(enabled: boolean) {
  const [tip, setTip] = useState<Tip>(null);
  const show = (el: Element | null) => {
    const t = el?.closest<HTMLElement>('[data-tip]');
    if (!enabled || !t) return setTip(null);
    const r = t.getBoundingClientRect();
    setTip({ text: t.dataset.tip || '', x: r.right + 10, y: r.top + r.height / 2 });
  };
  const hide = () => setTip(null);
  const handlers = {
    onMouseOver: (e: MouseEvent) => show(e.target as Element),
    onMouseLeave: hide,
    onFocus: (e: FocusEvent) => { const el = e.target as HTMLElement; if (el.matches(':focus-visible')) show(el); else hide(); },
    onBlur: hide,
  };
  const node = enabled && tip ? createPortal(<div className="tooltip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>, document.body) : null;
  return { handlers, node, hide };
}

export function BrandMark() {
  /* Jednoduchý lokální znak se čtyřmi krátkými linkami. Není to oficiální logo. */
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <rect x="7" y="7" width="14" height="14" rx="1" strokeWidth="1.75" />
      <path d="M14 1v4M14 23v4M1 14h4M23 14h4" />
    </svg>
  );
}

export function Sidebar({ active, compact, canCollapse, onToggle }: { active: string; compact: boolean; canCollapse: boolean; onToggle: () => void }) {
  const main = MODULES.filter(m => m.id !== 'settings');
  const settings = MODULES.find(m => m.id === 'settings')!;
  let lastGroup = '';
  const tip = useNavTip(compact);
  const t = useT();
  const tour = useUi(u => u.tourTarget);
  return (
    <aside className="sidebar" aria-label={t('nav.main')} {...tip.handlers}>
      <a className="brand" href="#dashboard" aria-label={t('nav.brand')}>
        <BrandMark />
        <span className="brand-text"><b>ARC OPS</b><span>RAIDERS COMPANION</span></span>
      </a>
      <nav className="nav" onScroll={tip.hide}>
        {main.map(m => {
          const head = m.group !== lastGroup;
          lastGroup = m.group;
          const Icon = m.icon;
          const name = moduleName(m, t);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {head && (compact ? (m.group !== 'overview' && <div className="nav-sep" aria-hidden="true" />) : <div className="nav-group">{t(`nav.group.${m.group}`)}</div>)}
              <a href={'#' + m.id} className={cx('nav-item', active === m.id && 'active', tour === m.id && 'tour-target')} data-tour={tour === m.id ? 'target' : undefined} aria-current={active === m.id ? 'page' : undefined}
                data-tip={name} aria-label={compact ? name : undefined}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span>{name}</span>
              </a>
            </div>
          );
        })}
      </nav>
      <div className="nav-foot">
        {canCollapse && (
          <button type="button" className="nav-item" onClick={onToggle} data-tip={t(compact ? 'nav.expand' : 'nav.collapse')} aria-label={t(compact ? 'nav.expand' : 'nav.collapse')}>
            {compact ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />}
            <span>{t('nav.collapse')}</span>
          </button>
        )}
        <a href="#settings" className={cx('nav-item', active === 'settings' && 'active')} aria-current={active === 'settings' ? 'page' : undefined}
          data-tip={settings.name} aria-label={compact ? settings.name : undefined}>
          <settings.icon size={18} strokeWidth={1.75} aria-hidden="true" /><span>{settings.name}</span>
        </a>
        <div className="nav-meta">{t('nav.meta')}</div>
      </div>
      {tip.node}
    </aside>
  );
}
