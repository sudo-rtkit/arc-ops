import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Loader, Minimize2 } from 'lucide-react';
import { actions, navigate, useApp, useAppState, useDerived } from '../store';
import { NumberField, Ring, cx } from '../ui/components';
import { MODE_KEY, shortcutFree } from '../core/mainWindow';
import { hotkeyLabel } from '../ops/hotkey';
import { windowCtl } from './windowCtl';
import { fmt } from '../ui/format';
import { profileLimit } from '../store/app';
import { useT } from '../i18n/react';

function SaveState() {
  const save = useApp(s => s.save);
  const t = useT();
  if (save === 'error') return <span className="save-state error" role="status"><CircleAlert size={16} aria-hidden="true" />{t('save.error')}</span>;
  if (save === 'saving') return <span className="save-state" role="status"><Loader size={16} className="spin" aria-hidden="true" />{t('save.saving')}</span>;
  return <span className="save-state saved" role="status"><CircleCheck size={16} aria-hidden="true" />{t('save.saved')}</span>;
}

function QuickProfile({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-quick]')) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const f = (field: 'level' | 'coins' | 'rounds', label: string) => {
    const [lo, hi] = profileLimit(field);
    return <NumberField label={label} value={s.profile[field]} min={lo} max={hi} onCommit={n => actions.setProfile(field, n)} />;
  };
  return (
    <div className="popover" ref={ref} role="dialog" aria-label={t('top.quick')} style={{ top: 'calc(100% + 4px)', left: 0 }}>
      {f('level', t('common.level'))}
      {f('coins', t('common.coins'))}
      {f('rounds', t('common.rounds'))}
      <div className="row between"><a className="link-btn" href="#profile" onClick={onClose}>{t('top.fullProfile')}</a><button className="btn sm" type="button" onClick={onClose}>{t('common.done')}</button></div>
    </div>
  );
}

/* 0.9.0: pojmenované tlačítko zpět do kompaktního okna; fokus po návratu z kompaktu (jen když okno fokus má) */
function CompactButton() {
  const t = useT();
  const hotkey = useAppState().buddy.hotkey;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (windowCtl.justSwitched() && document.hasFocus() && (document.activeElement === document.body || !document.activeElement)) ref.current?.focus({ preventScroll: true });
  }, []);
  const key = shortcutFree(MODE_KEY, hotkey) ? hotkeyLabel(MODE_KEY) : '';
  return (
    <button type="button" ref={ref} className="btn sm ghost tb-compact" data-testid="to-compact" title={key ? t('top.compactTip', { key }) : undefined}
      aria-keyshortcuts={key ? 'Control+Shift+M' : undefined} onClick={() => void windowCtl.setMode('compact')}>
      <Minimize2 size={18} strokeWidth={1.75} aria-hidden="true" />{t('top.compact')}
    </button>
  );
}

export function TopBar() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [quick, setQuick] = useState(false);
  const free = d.budget - d.used;
  const ph = d.phases.current;
  const phase = d.phases.list.find(p => p.n === ph);
  return (
    <header className="topbar">
      <div className="tb-group" style={{ position: 'relative' }}>
        <button type="button" className="tb-item tb-level" data-quick onClick={() => setQuick(q => !q)} aria-expanded={quick} aria-label={t('top.levelAria', { n: s.profile.level })}>
          <Ring value={s.profile.level} max={75} label={`Level ${s.profile.level} / 75`}>{s.profile.level}</Ring>
          <span><span className="label">{t('common.level')}</span><span className="val" style={{ display: 'block' }}>{s.profile.level} / 75</span></span>
        </button>
        <button type="button" className="tb-item" data-quick onClick={() => setQuick(q => !q)} aria-label={t('top.coinsAria', { n: s.profile.coins })}>
          <span className="label">{t('common.coins')}</span><span className="val amber">{fmt(s.profile.coins)}</span>
        </button>
        <button type="button" className="tb-item" data-quick onClick={() => setQuick(q => !q)} aria-label={t('top.roundsAria', { n: s.profile.rounds })}>
          <span className="label"><span className="long-label">{t('common.rounds')}</span><span className="short-label">{t('top.roundsShort')}</span></span><span className="val">{fmt(s.profile.rounds)}</span>
        </button>
        {quick && <QuickProfile onClose={() => setQuick(false)} />}
      </div>
      <div className="tb-group">
        <button type="button" className="tb-item" onClick={() => navigate('skills')} aria-label={t('top.skillAria', { used: d.used, budget: d.budget })}>
          <span className="label"><span className="long-label">{t('top.skill')}</span><span className="short-label">{t('top.skillShort')}</span></span>
          <span className={cx('val', free < 0 ? 'danger' : free > 0 && 'accent')}>{d.used} / {d.budget}{free < 0 ? ' · ' + t('top.over') : free > 0 ? ' · ' + t('top.free', { count: free }) : ''}</span>
        </button>
        <button type="button" className="tb-item" onClick={() => navigate('dashboard', 'phases')} title={phase ? phase.name : 'Endgame'} aria-label={t('top.phaseAria', { phase: phase ? ph + ', ' + phase.name : 'Endgame' })}>
          <span className="label">{t('top.phase')}</span>
          <span className="val">{phase ? <>{t('top.phaseN', { n: ph })}<span className="long-label phase-name"> · {phase.name}</span></> : 'Endgame'}</span>
        </button>
      </div>
      <div className="tb-spacer" />
      <SaveState />
      <CompactButton />
    </header>
  );
}
