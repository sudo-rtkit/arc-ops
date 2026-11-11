/* Vlastní tier list S–D pro zbraně a předměty (milník 4). Přetahování myší (HTML drag & drop) i klávesnicí:
   šipka nahoru/dolů = tier, doleva/doprava = pořadí, Delete = vyřadit. Ukládá se do stavu (tierList) a do zálohy. */
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { actions, app, useAppState, useDerived } from '../store';
import { ConfirmButton, Panel, Search, cx } from '../ui/components';
import { TIER_IDS, type TierId } from '../core/types';
import { tierOf } from '../core/tierlist';
import { ITEM_DATA } from '../core/itemdb';
import { useT } from '../i18n/react';

type Mode = 'weapons' | 'items';
const POOL_MAX = 40;
const MIME = 'text/plain';
/* Aktuální žebříček hned po akci (komponenta se překreslí až potom). */
const tiersNow = (mode: Mode) => app.store.getState().state.tierList[mode];

export default function TierList() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const [mode, setMode] = useState<Mode>('weapons');
  const [q, setQ] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const [over, setOver] = useState<TierId | 'pool' | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const lists = s.tierList[mode];
  const nameOf = (id: string) => (mode === 'weapons' ? d.weaponName(id) : id);

  /* Po přesunu klávesnicí zůstane fokus na přesunuté položce (v novém řádku je to nový prvek). */
  useEffect(() => {
    if (!focusId) return;
    const el = board.current?.querySelector<HTMLElement>(`[data-tl-id="${CSS.escape(focusId)}"]`);
    el?.focus();
    setFocusId(null);
  }, [focusId, lists]);

  const pool = useMemo(() => {
    const ranked = new Set(TIER_IDS.flatMap(x => lists[x]));
    const ql = q.trim().toLowerCase();
    if (mode === 'weapons') return d.weapons.filter(w => !ranked.has(w.id) && (!ql || w.name.toLowerCase().includes(ql))).map(w => w.id);
    /* předměty: bez hledání vlastněné předměty, s hledáním katalog čísel (ARC Tracker) */
    const owned = [...Object.keys(s.inventory), ...Object.values(s.items).map(i => i.key)];
    const names = ql ? ITEM_DATA.map(r => r.n).filter(n => n.toLowerCase().includes(ql)) : owned;
    return [...new Set(names)].filter(n => !ranked.has(n)).sort((a, b) => a.localeCompare(b)).slice(0, POOL_MAX);
  }, [mode, lists, q, d.weapons, s.inventory, s.items]);

  const announce = (id: string, tier: TierId | null) => setLive(tier ? t('tl.moved', { name: nameOf(id), tier }) : t('tl.removed', { name: nameOf(id) }));
  const place = (id: string, tier: TierId | null, index?: number) => { actions.tierPlace(mode, id, tier, index); announce(id, tier); };

  const onKey = (e: KeyboardEvent, id: string) => {
    const how = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key as 'ArrowUp'];
    if (how) {
      e.preventDefault();
      actions.tierMove(mode, id, how);
      setFocusId(id);
      const after = tierOf(tiersNow(mode), id);
      announce(id, after);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && tierOf(lists, id)) {
      e.preventDefault();
      place(id, null);
      setFocusId(null);
    }
  };
  const onDragStart = (e: DragEvent, id: string) => { e.dataTransfer.setData(MIME, id); e.dataTransfer.effectAllowed = 'move'; };
  const dropProps = (target: TierId | 'pool') => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== target) setOver(target); },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData(MIME);
      if (!id) return;
      if (target === 'pool') { place(id, null); return; }
      /* pozice podle položky, na kterou se pustilo (před ni), jinak na konec */
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-tl-id]');
      const at = chip ? lists[target].indexOf(chip.dataset.tlId || '') : -1;
      place(id, target, at >= 0 ? at : undefined);
    },
  });
  const chip = (id: string, tier: TierId | null) => (
    <button key={id} type="button" className="tl-chip" draggable data-tl-id={id} onDragStart={e => onDragStart(e, id)} onKeyDown={e => onKey(e, id)}
      aria-label={tier ? t('tl.itemAria', { name: nameOf(id), tier }) : t('tl.poolAria', { name: nameOf(id) })}>{nameOf(id)}</button>
  );

  return (
    <Panel title={t('tl.title')} actions={<ConfirmButton size="sm" variant="ghost" icon={Trash2} disabled={!TIER_IDS.some(x => lists[x].length)} title={t('tl.clear')}
      text={t('tl.clearText')} confirmLabel={t('tl.clear')} onConfirm={() => actions.tierClear(mode)}>{t('tl.clear')}</ConfirmButton>}>
      <p className="meta">{t('tl.hint')}</p>
      <div className="seg" role="group" aria-label={t('tl.mode')}>
        {(['weapons', 'items'] as Mode[]).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setQ(''); }}>{t(m === 'weapons' ? 'tl.weapons' : 'tl.items')}</button>)}
      </div>
      <div className="tier-list tl-board" ref={board} data-testid="tier-board" data-mode={mode}>
        {TIER_IDS.map(tier => (
          <div key={tier} className={cx('tier-row tl-row', over === tier && 'over')} data-tier={tier} {...dropProps(tier)}>
            <span className={cx('tier-label', 't-' + tier)} aria-hidden="true">{tier}</span>
            <div className="tier-items" role="list" aria-label={`Tier ${tier}`}>
              {lists[tier].length ? lists[tier].map(id => <span key={id} role="listitem" style={{ display: 'contents' }}>{chip(id, tier)}</span>)
                : <span className="meta tl-empty">{t('tl.dropHere')}</span>}
            </div>
          </div>
        ))}
        <div className={cx('tl-pool', over === 'pool' && 'over')} data-tier="pool" {...dropProps('pool')}>
          <div className="row between">
            <span className="note-head">{t('tl.pool')}</span>
            <Search label={t('tl.poolSearch')} value={q} onChange={setQ} />
          </div>
          {mode === 'items' && <p className="meta">{t('tl.poolHint', { n: POOL_MAX })}</p>}
          <div className="tier-items" role="list" aria-label={t('tl.pool')}>
            {pool.map(id => <span key={id} role="listitem" style={{ display: 'contents' }}>{chip(id, null)}</span>)}
          </div>
        </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="tier-live">{live}</div>
    </Panel>
  );
}
