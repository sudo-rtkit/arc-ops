/* Hledání všude (0.18.0): paleta na Ctrl+K (místní zkratka okna, žádná globální) a pole v hlavičce postranního
   panelu. Index a řazení počítá jádro (src/core/search.ts); tady je jen zobrazení, klávesnice a nedávná hledání.
   - Enter otevře cíl: kartu předmětu, detail úkolu, modul nebo sekci nastavení, tip rádce.
   - V overlayi běží stejná paleta; fokus bere jen tehdy, když okno fokus už má (nikdy ho nebere hře).
   - Nedávná hledání jsou jen na tomto počítači (localStorage), nejsou ve stavu ani v záloze. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { useAppState, useDerived, navigate } from '../store';
import { useUi } from '../store/ui';
import { cx } from './components';
import { MODULES } from '../shell/modules';
import { RECENT_KEY, buildIndex, flatHits, parseRecent, prepareIndex, pushRecent, searchIndex, type SearchEntry, type SearchGroup } from '../core/search';
import { openTip } from './Advisor';
import { useT } from '../i18n/react';
import { tl, type Key } from '../i18n';

/* Sekce Nastavení (id kotvy v modulu Settings → klíč nadpisu). */
export const SETTINGS_SECTIONS: { id: string; key: Key | null; extra?: Key[] }[] = [
  { id: 'lang', key: 'settings.lang' }, { id: 'window', key: 'win.title' }, { id: 'ops', key: 'ops.title' }, { id: 'voice', key: 'opsVoice.title' },
  { id: 'wardrobe', key: 'ops.wardrobe' }, { id: 'data', key: null, extra: ['settings.dir'] }, { id: 'backup', key: 'settings.exportImport' },
  { id: 'snapshots', key: 'snap.title' }, { id: 'links', key: 'settings.links' }, { id: 'sources', key: 'settings.sources' },
  { id: 'about', key: 'settings.about' }, { id: 'danger', key: 'danger.title' },
];

const readRecent = (): string[] => { try { return parseRecent(localStorage.getItem(RECENT_KEY)); } catch { return []; } };
const writeRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* bez úložiště */ } };

/* Okno má fokus (hráč s ním pracuje); jen tehdy smí paleta přesunout fokus. */
const windowFocused = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

function useIndex() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  return useMemo(() => {
    const lang = t.lang;
    const both = (k: Key) => [tl(lang, k), tl(lang === 'cs' ? 'en' : 'cs', k)];
    const modules = MODULES.map(m => ({ id: m.id, names: [...(m.nameKey ? both(m.nameKey) : []), m.name, ...both(`search.alias.${m.id}` as Key)] }));
    const settings = SETTINGS_SECTIONS.map(x => ({ id: x.id, names: [...(x.key ? both(x.key) : ['Data']), ...(x.extra ?? []).flatMap(both)] }));
    const entries = buildIndex(s, lang, { materials: d.materials.map(m => m.name), tips: d.tips, modules, settings });
    return { entries, index: prepareIndex(entries), byId: new Map(entries.map(e => [e.id, e])) };
  }, [s, d, t.lang]);
}

export function openEntry(e: SearchEntry, tips: ReturnType<typeof useDerived>['tips']): void {
  const ui = useUi.getState();
  writeRecent(pushRecent(readRecent(), e.id));
  if (e.target.kind === 'item') { ui.openItemCard(e.target.name); return; }
  ui.closeSearch();
  if (e.target.kind === 'tip') {
    const id = e.target.id;
    const tip = tips.find(x => x.id === id);
    if (tip) openTip(tip);
    return;
  }
  navigate(e.target.module, e.target.sub);
}

const optId = (base: string, i: number) => `${base}-o${i}`;

function Palette({ initial, onClose }: { initial: string; onClose: () => void }) {
  const t = useT();
  const d = useDerived();
  const { index, byId } = useIndex();
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const base = useId().replace(/:/g, '');

  const groups: SearchGroup[] = useMemo(() => {
    if (q.trim()) return searchIndex(index, q, { perGroup: 6, max: 36 });
    const hits = recent.map(id => byId.get(id)).filter((e): e is SearchEntry => !!e).map(entry => ({ entry, score: 1 }));
    return hits.length ? [{ kind: 'recent' as const, hits }] : [];
  }, [q, index, byId, recent]);
  const flat = flatHits(groups);
  useEffect(() => { setActive(0); }, [q]);

  /* fokus jen v okně, které fokus má; po zavření zpět na předchozí prvek */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    if (windowFocused()) {
      const el = input.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
    return () => { if (windowFocused() && prev?.isConnected) prev.focus?.(); };
  }, []);
  useEffect(() => { box.current?.querySelector(`#${optId(base, active)}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, base]);

  const open = (i: number) => { const h = flat[i]; if (h) openEntry(h.entry, d.tips); };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive(a => (a + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
      return;
    }
    if (e.key === 'Home' && flat.length && e.ctrlKey) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && flat.length && e.ctrlKey) { e.preventDefault(); setActive(flat.length - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); open(active); return; }
    if (e.key === 'Tab') {
      const f = [...(box.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [])];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1) + f.length) % f.length]?.focus();
    }
  };
  const groupName = (k: string) => t(`search.group.${k}` as Key);
  let n = -1;
  const total = flat.length;
  return createPortal(
    <div className="sp-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp" role="dialog" aria-modal="true" aria-label={t('search.title')} ref={box} onKeyDown={onKey} data-testid="search-palette">
        <div className="sp-head">
          <SearchIcon size={18} aria-hidden="true" />
          <input ref={input} className="sp-input" type="text" value={q} onChange={e => setQ(e.target.value.slice(0, 120))} placeholder={t('search.placeholder')}
            role="combobox" aria-expanded={total > 0} aria-controls={base + '-list'} aria-autocomplete="list" aria-activedescendant={total ? optId(base, active) : undefined}
            aria-label={t('search.field')} spellCheck={false} autoComplete="off" data-testid="search-input" />
          <button type="button" className="icon-btn ghost sm" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="sp-list" id={base + '-list'} role="listbox" aria-label={t('search.results')} data-testid="search-results">
          {groups.map(g => (
            <div key={g.kind} role="group" aria-labelledby={`${base}-g-${g.kind}`} className="sp-group" data-group={g.kind}>
              <div className="sp-group-head" id={`${base}-g-${g.kind}`}>{groupName(g.kind)}
                {g.kind === 'recent' && <button type="button" className="link-btn sp-clear" onClick={() => { writeRecent([]); setRecent([]); input.current?.focus(); }}>{t('search.clearRecent')}</button>}
              </div>
              {g.hits.map(h => {
                n++;
                const i = n;
                return (
                  <div key={h.entry.id} id={optId(base, i)} role="option" aria-selected={i === active} className={cx('sp-opt', i === active && 'on')} data-kind={h.entry.kind} data-id={h.entry.id}
                    onMouseMove={() => { if (active !== i) setActive(i); }} onMouseDown={e => e.preventDefault()} onClick={() => open(i)}>
                    <span className="sp-title">{h.entry.title}</span>
                    {h.entry.sub && <span className="sp-sub">{h.entry.sub}</span>}
                    {g.kind === 'recent' && <span className="sp-kind">{groupName(h.entry.kind)}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {!total && <p className="sp-empty" role="status">{q.trim() ? t('search.none', { q: q.trim() }) : t('search.hint')}</p>}
        </div>
        <div className="sp-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> {t('search.keys.move')}</span><span><kbd>Enter</kbd> {t('search.keys.open')}</span><span><kbd>Esc</kbd> {t('search.keys.close')}</span></div>
        <span className="sr-only" role="status" aria-live="polite">{q.trim() ? t('search.count', { count: total }) : ''}</span>
      </div>
    </div>,
    document.body,
  );
}

/* Jedna paleta na okno. */
export function SearchHost() {
  const st = useUi(u => u.search);
  const close = useUi(u => u.closeSearch);
  return st.open ? <Palette key={st.n} initial={st.query} onClose={close} /> : null;
}

export const isSearchKey = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k');

/* Ctrl+K v okně (událost přijde jen oknu s fokusem). before = např. přepnutí z kompaktu do plné aplikace. */
export function useSearchShortcut(enabled: () => boolean, before?: () => Promise<void> | void): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isSearchKey(e) || !enabled()) return;
      e.preventDefault();
      const ui = useUi.getState();
      if (ui.search.open) { ui.closeSearch(); return; }
      void Promise.resolve(before?.()).then(() => useUi.getState().openSearch(''));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled, before]);
}

/* Pole v hlavičce postranního panelu: psaní nebo Enter otevře paletu s dotazem. Je to textové pole, které otevře dialog
   (ne vlastní hledací pole stránky), aby se nepletlo s hledáním v modulech. */
export function SidebarSearch({ compact }: { compact: boolean }) {
  const t = useT();
  const openSearch = useUi(u => u.openSearch);
  if (compact) {
    return (
      <div className="nav-search">
        <button type="button" className="nav-item nav-search-btn" onClick={() => openSearch('')} aria-label={t('search.field')} data-tip={t('search.field')} aria-keyshortcuts="Control+K" data-testid="sidebar-search">
          <SearchIcon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <div className="nav-search">
      <label className="nav-search-field">
        <SearchIcon size={16} aria-hidden="true" />
        <input type="text" className="nav-search-input" value="" aria-haspopup="dialog" placeholder={t('search.sidebar')} aria-label={t('search.field')} aria-keyshortcuts="Control+K" data-testid="sidebar-search"
          onChange={e => openSearch(e.target.value)} onMouseDown={e => { e.preventDefault(); openSearch(''); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); openSearch(''); } }} />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </label>
    </div>
  );
}
