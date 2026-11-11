/* Sdílené komponenty podle visual-design.md kap. 6. */
import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, ExternalLink as ExternalLinkIcon, Minus, Plus, Search as SearchIcon, X, type LucideIcon } from 'lucide-react';
import type { Origin } from '../core/types';
import { clampInt } from '../core/util';
import { fmt, parseNumberInput } from './format';
import { useT } from '../i18n/react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

/* ----- Panel ----- */
export function Panel({ title, actions, children, className, flush, id, headExtra }: {
  title?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; flush?: boolean; id?: string; headExtra?: ReactNode;
}) {
  return (
    <section className={cx('panel', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {headExtra}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={cx('panel-body', flush && 'flush')}>{children}</div>
    </section>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="titles"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/* ----- Tlačítka ----- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: LucideIcon };
export function Btn({ variant = 'secondary', size = 'md', icon: Icon, children, className, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={cx('btn', variant !== 'secondary' && variant, size !== 'md' && size, className)} {...rest}>
      {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden="true" />}{children}
    </button>
  );
}
export function IconBtn({ label, icon: Icon, ghost, size = 'sm', className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon; ghost?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button type={type} aria-label={label} title={label} className={cx('icon-btn', ghost && 'ghost', size === 'md' && 'md', className)} {...rest}>
      <Icon size={size === 'md' ? 18 : 16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/* ----- Badge ----- */
export type Tone = 'accent' | 'amber' | 'orange' | 'success' | 'danger' | 'muted';
export function Badge({ tone, children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return <span className={cx('badge', tone && tone !== 'muted' && tone, className)} title={title}>{children}</span>;
}
export function OriginBadge({ origin, edited }: { origin: Origin; edited?: boolean }) {
  const t = useT();
  const label = t(origin === 'denik' ? 'origin.denik' : origin === 'reserse' ? 'origin.reserse' : 'origin.vlastni');
  return (
    <span className="row" style={{ gap: 4 }}>
      <Badge tone={origin === 'reserse' ? 'amber' : origin === 'vlastni' ? 'accent' : undefined}>{label}</Badge>
      {edited && <Badge tone="accent">{t('common.edited')}</Badge>}
    </span>
  );
}

/* ----- Progress ----- */
export function Progress({ value, max, tone, label, showValue = true, valueText }: { value: number; max: number; tone?: 'amber' | 'success' | 'danger'; label?: ReactNode; showValue?: boolean; valueText?: string }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const text = valueText ?? `${fmt(value)} / ${fmt(max)}`;
  return (
    <div className="progress-row">
      {showValue && <div className="row"><span className="meta">{label}</span><span className="mono meta">{text}</span></div>}
      <div className={cx('progress', tone)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text} aria-label={typeof label === 'string' ? label : undefined}>
        <i style={{ width: (p * 100).toFixed(1) + '%' }} />
      </div>
    </div>
  );
}

export function Ring({ value, max, size = 40, children, label }: { value: number; max: number; size?: number; children?: ReactNode; label: string }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
      </svg>
      <span className="ring-val">{children}</span>
    </div>
  );
}

/* ----- Číselné pole: potvrzení Enter/blur, Escape vrátí; ořez s nápovědou ----- */
function useNumberDraft(value: number, min: number, max: number, onCommit: (n: number) => void, decimals = false) {
  const [draft, setDraft] = useState<string | null>(null);
  const [clamped, setClamped] = useState(false);
  const lang = useT().lang;
  const commit = () => {
    if (draft === null) return;
    /* Oddělovače podle jazyka: v angličtině je „125,400“ tisíc, ne desetinné číslo. */
    const raw = draft.trim() === '' ? 0 : parseNumberInput(draft, lang);
    let n = decimals ? Math.max(min, Math.min(max, Number.isFinite(raw) ? Math.round(raw * 2) / 2 : min)) : clampInt(raw, min, max);
    if (!Number.isFinite(n)) n = min;
    setClamped(Number.isFinite(raw) && raw !== n && draft.trim() !== '');
    setDraft(null);
    if (n !== value) onCommit(n);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { commit(); }
    if (e.key === 'Escape') { setDraft(null); setClamped(false); }
  };
  return { shown: draft ?? String(value), setDraft, commit, onKeyDown, clamped, setClamped };
}

export function Stepper({ value, onChange, min, max, label, step = 1, wide, hideLabel = true, disabled }: {
  value: number; onChange: (n: number) => void; min: number; max: number; label: string; step?: number; wide?: boolean; hideLabel?: boolean; disabled?: boolean;
}) {
  const d = useNumberDraft(value, min, max, onChange);
  const id = useId();
  const t = useT();
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>{label}</label>
      <div className={cx('stepper', wide && 'wide')}>
        <IconBtn label={t('stepper.minus', { label })} icon={Minus} disabled={disabled || value <= min} onClick={() => { d.setClamped(false); onChange(Math.max(min, value - step)); }} />
        <input id={id} className="input" inputMode="numeric" value={d.shown} disabled={disabled}
          onChange={e => d.setDraft(e.target.value)} onBlur={d.commit} onKeyDown={d.onKeyDown} aria-describedby={d.clamped ? id + '-h' : undefined} />
        <IconBtn label={t('stepper.plus', { label })} icon={Plus} disabled={disabled || value >= max} onClick={() => { d.setClamped(false); onChange(Math.min(max, value + step)); }} />
      </div>
      {d.clamped && <span id={id + '-h'} className="hint">{t('stepper.clamped', { min, max })}</span>}
    </div>
  );
}

export function NumberField({ label, value, onCommit, min, max, hint, decimals, suffix }: {
  label: string; value: number; onCommit: (n: number) => void; min: number; max: number; hint?: ReactNode; decimals?: boolean; suffix?: string;
}) {
  const d = useNumberDraft(value, min, max, onCommit, decimals);
  const id = useId();
  const t = useT();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}{suffix && <span className="muted"> ({suffix})</span>}</label>
      <input id={id} className="input num-input" inputMode="decimal" value={d.shown} aria-describedby={d.clamped || hint ? id + '-h' : undefined}
        onChange={e => d.setDraft(e.target.value)} onBlur={d.commit} onKeyDown={d.onKeyDown} />
      {d.clamped ? <span id={id + '-h'} className="hint">{t('stepper.clamped', { min, max })}</span> : hint && <span id={id + '-h'} className="hint">{hint}</span>}
    </div>
  );
}

/* Textové pole s potvrzením při opuštění (poznámky se neukládají po každém písmenu). */
export function TextField({ label, value, onCommit, multiline, placeholder, maxLength, hideLabel, rows }: {
  label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number; hideLabel?: boolean; rows?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  const props = {
    id, value: draft ?? value, placeholder, maxLength,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>{label}</label>
      {multiline
        ? <textarea className="textarea" rows={rows} {...props} onKeyDown={e => { if (e.key === 'Escape') setDraft(null); }} />
        : <input className="input" {...props} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null); }} />}
    </div>
  );
}

export function Select({ label, value, onChange, options, hideLabel, id: idIn }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; hideLabel?: boolean; id?: string;
}) {
  const gen = useId();
  const id = idIn || gen;
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>{label}</label>
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </div>
  );
}

/* ----- Checkbox řádek ----- */
export function Check({ checked, onChange, children, note, prefix }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; note?: ReactNode; prefix?: ReactNode }) {
  return (
    <label className={cx('check-row', checked && 'done')}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="check-text">{prefix}<span>{children}</span>{note && <small>{note}</small>}</span>
    </label>
  );
}

/* ----- Taby (role tablist, šipky, Home/End) ----- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = tabs.length - 1;
    if (j >= 0) { e.preventDefault(); onChange(tabs[j].id); refs.current[j]?.focus(); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={el => { refs.current[i] = el; }} role="tab" type="button" className="tab" aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={e => onKey(e, i)}>{t.label}</button>
      ))}
    </div>
  );
}

/* ----- Dialog: zachytí focus, Escape zavře, focus se vrátí spouštěči ----- */
export function Dialog({ title, onClose, children, footer, size, initialFocus, footNote }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'side'; initialFocus?: string; footNote?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const t = useT();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const first = (initialFocus && el.querySelector<HTMLElement>(initialFocus)) || el.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])') || el;
    first.focus();
    return () => { prev?.focus?.(); };
  }, [initialFocus]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Tab') {
      const f = [...ref.current!.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('dialog', size)} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1} onKeyDown={onKey}>
        <div className="dialog-head"><h2 id={titleId}>{title}</h2><IconBtn label={t('common.close')} icon={X} ghost onClick={onClose} data-close /></div>
        <div className="dialog-body">{children}</div>
        {(footer || footNote) && <div className="dialog-foot">{footNote && <span className="foot-note">{footNote}</span>}{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* Potvrzovací dialog; bezpečná akce dostane focus jako první. */
export function Confirm({ title, children, confirmLabel, danger = true, onConfirm, onClose, busy }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  const t = useT();
  return (
    <Dialog title={title} onClose={onClose} initialFocus="[data-safe]"
      footer={<><Btn data-safe onClick={onClose}>{t('common.cancel')}</Btn><Btn variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Btn></>}>
      {children}
    </Dialog>
  );
}

/* Tlačítko, které před akcí otevře potvrzení. */
export function ConfirmButton({ children, title, text, confirmLabel, onConfirm, variant = 'secondary', icon, size, disabled }: {
  children: ReactNode; title: string; text: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<unknown>; variant?: BtnProps['variant']; icon?: LucideIcon; size?: BtnProps['size']; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Btn variant={variant} icon={icon} size={size} disabled={disabled} onClick={() => setOpen(true)}>{children}</Btn>
      {open && <Confirm title={title} confirmLabel={confirmLabel} busy={busy} onClose={() => setOpen(false)}
        onConfirm={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setOpen(false); } }}>{text}</Confirm>}
    </>
  );
}

/* ----- Prázdný stav ----- */
export function Empty({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return <div className="empty">{Icon && <Icon size={24} strokeWidth={1.75} aria-hidden="true" />}<div>{children}</div>{action}</div>;
}

/* ----- Hledání ----- */
export function Search({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const id = useId();
  const t = useT();
  return (
    <div className="field search">
      <label htmlFor={id} className="field-label">{label}</label>
      <SearchIcon size={16} aria-hidden="true" />
      <input id={id} className="input" type="search" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onChange(''); }} />
      {value && <IconBtn className="clear" ghost label={t('common.clearSearch')} icon={X} onClick={() => onChange('')} />}
    </div>
  );
}

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return <span className="err" role="alert" id={id}><CircleAlert size={14} aria-hidden="true" />{children}</span>;
}

/* Neuvedený herní údaj */
export function NA() { const t = useT(); return <span className="muted">{t('common.notSpecified')}</span>; }
export const orNA = (v: string | null | undefined): ReactNode => (v && v.trim() ? v : <NA />);

/* Externí odkaz: otevře se v prohlížeči jen na kliknutí a je označený „vyžaduje internet“. Otevírání dodá store. */
let openExternal: (url: string) => void = () => undefined;
export const setExternalOpener = (fn: (url: string) => void) => { openExternal = fn; };
export function ExtLink({ url, children }: { url: string; children: ReactNode }) {
  const t = useT();
  return (
    <button type="button" className="link-btn" title={url} onClick={() => openExternal(url)}>
      {children} <ExternalLinkIcon size={14} aria-hidden="true" /><span className="meta">{t('common.needsInternet')}</span>
    </button>
  );
}
