/* 0.20.0: automatické zápisy raidů a fronta „Ke kontrole“.
   - AutoWrites: upozornění na automatické zápisy s tlačítkem Zpět. Není to vyskakovací okno ani zvuk: ukáže se jen
     v okně Ops, které hráč sám otevře (hlavní okno, kompakt, overlay), a zůstane, dokud ho nepotvrdí.
   - ReviewPanel: nejisté údaje (mapa, loadout, loot, snímek obrazovky) se vyřizují najednou tlačítkem „Uložit vše“.
   Komponenty běží v hlavním okně i v overlayi (akce autoUndo, autoSeen a reviewApply jdou přes relay). */
import { useMemo, useState } from 'react';
import { Bot, Check as CheckIcon, ClipboardCheck, Trash2, Undo2 } from 'lucide-react';
import { actions, useAppState } from '../store';
import { Badge, Btn, Panel, Select } from './components';
import { fmtDate, fmtTime } from './format';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { unseenWrites, type ReviewEdit, type ReviewItem } from '../core/autoCapture';
import { MAPS } from '../core/data/maps';

export function AutoWrites({ compact = false, onOpenReview }: { compact?: boolean; onOpenReview?: () => void }) {
  const t = useT();
  const s = useAppState();
  const list = unseenWrites(s.autoLog);
  if (!list.length) return null;
  const review = s.review.filter(x => x.kind !== 'screen').length;
  return (
    <section className={'auto-writes' + (compact ? ' compact' : '')} aria-label={t('auto.write.title')} data-testid="auto-writes">
      {list.slice(0, compact ? 2 : 5).map(w => {
        const raid = s.raids.find(r => r.id === w.raidId);
        return (
          <div key={w.id} className="banner info auto-write" role="status" data-testid="auto-write">
            <Bot size={18} aria-hidden="true" />
            <span className="banner-text">
              <b>{t('auto.write.title')}</b>{raid ? ` · ${fmtDate(raid.ts)} ${fmtTime(raid.ts)}` : ''}{' '}
              {w.survived === false ? t('auto.write.knocked') : t('auto.write.survived', { count: w.items })}
              {w.review > 0 && <> {t('auto.write.review', { count: w.review })}</>}
            </span>
            <Btn size="sm" icon={Undo2} data-testid="auto-undo" onClick={() => actions.autoUndo(w.id)}>{t('auto.write.undo')}</Btn>
            <Btn size="sm" variant="ghost" icon={CheckIcon} data-testid="auto-ok" onClick={() => actions.autoSeen([w.id])}>{t('auto.write.ok')}</Btn>
          </div>
        );
      })}
      {review > 0 && onOpenReview && <Btn size="sm" variant="ghost" icon={ClipboardCheck} onClick={onOpenReview}>{t('auto.write.open')} ({review})</Btn>}
    </section>
  );
}

type Draft = { map?: string; survived?: boolean; rows?: { on: boolean; name: string; qty: number }[]; drop?: boolean };

export function ReviewPanel() {
  const t = useT();
  const s = useAppState();
  const items = s.review;
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [done, setDone] = useState<number | null>(null);
  const raidOf = (x: ReviewItem) => (x.raidId ? s.raids.find(r => r.id === x.raidId) : undefined);
  const initial = useMemo(() => Object.fromEntries(items.map(x => {
    const r = raidOf(x);
    const d: Draft = {};
    if (x.kind === 'map') d.map = r?.map ?? MAPS[0].id;
    if (x.kind === 'outcome') d.survived = r?.ok ?? true;
    if (x.kind === 'loot') d.rows = (x.rows ?? []).map(row => ({ on: !!row.guess && row.qty !== null, name: row.guess, qty: row.qty ?? 1 }));
    /* 0.24.0: nepoznaná výbava: návrh je jen nabídka, nic není zaškrtnuté, dokud to hráč neudělá.
       0.25.0: jistě poznaná výbava ze snímku ze zkratky (sure) je zaškrtnutá, hráč ji jen potvrdí */
    if (x.kind === 'loadout') d.rows = (x.rows ?? []).map(row => ({ on: !!row.sure, name: row.guess, qty: 1 }));
    return [x.id, d];
  })), [items, s.raids]); // eslint-disable-line react-hooks/exhaustive-deps
  /* po vyřízení všeho zůstane jen potvrzení */
  if (!items.length) return done !== null ? <p className="meta" role="status" data-testid="review-done">{t('review.saved', { count: done })}</p> : null;
  const get = (id: string): Draft => ({ ...initial[id], ...draft[id] });
  const set = (id: string, patch: Draft) => setDraft(d => ({ ...d, [id]: { ...get(id), ...patch } }));
  const saveAll = () => {
    const edits: ReviewEdit[] = items.flatMap((x): ReviewEdit[] => {
      const d = get(x.id);
      if (d.drop) return [{ id: x.id, kind: 'dismiss' }];
      if (x.kind === 'map' && d.map) return [{ id: x.id, kind: 'map', map: d.map }];
      if (x.kind === 'outcome' && d.survived !== undefined) return [{ id: x.id, kind: 'outcome', survived: d.survived }];
      if (x.kind === 'loot') return [{ id: x.id, kind: 'loot', rows: (d.rows ?? []).filter(r => r.on && r.name.trim() && r.qty > 0).map(r => ({ name: r.name.trim(), qty: r.qty })) }];
      if (x.kind === 'loadout') {
        const rows = (d.rows ?? []).filter(r => r.on && r.name.trim()).map(r => ({ name: r.name.trim(), qty: 1 }));
        return [rows.length ? { id: x.id, kind: 'gear', rows } : { id: x.id, kind: 'dismiss' }];
      }
      /* snímek obrazovky: vyřízený je až po revizi v Ops; „Ponechat“ = zůstane ve frontě */
      return [];
    });
    const n = actions.reviewApply(edits);
    setDraft({});
    setDone(typeof n === 'number' ? n : edits.length);
  };
  const date = (x: ReviewItem) => { const r = raidOf(x); return r ? `${fmtDate(r.ts)} ${fmtTime(r.ts)}` : fmtDate(x.at); };
  return (
    <Panel title={t('review.title')} actions={<Badge tone="amber"><span data-testid="review-count">{t('review.count', { count: items.length })}</span></Badge>}>
      <div className="stack" data-testid="review">
        <p className="secondary-text">{t('review.sub')}</p>
        {items.map(x => {
          const d = get(x.id);
          return (
            <article key={x.id} className={'review-item' + (d.drop ? ' muted' : '')} data-testid={'review-' + x.kind}>
              <header className="row">
                <b>{x.kind === 'screen' ? t('review.kind.screen', { screen: t(`auto.screen.${x.screen === 'findings' || x.screen === 'knockedOut' ? 'result' : x.screen}` as Key) }) : t(`review.kind.${x.kind}` as Key, { date: date(x) })}</b>
                <span className="grow" />
                <Btn size="sm" variant="ghost" icon={Trash2} aria-pressed={!!d.drop} data-testid="review-drop" onClick={() => set(x.id, { drop: !d.drop })}>{t(d.drop ? 'review.keep' : 'review.dismiss')}</Btn>
              </header>
              {x.kind === 'map' && !d.drop && (
                <Select label={t('common.map')} value={d.map ?? ''} onChange={v => set(x.id, { map: v })} options={MAPS.map(m => ({ value: m.id, label: m.name }))} />
              )}
              {x.kind === 'outcome' && !d.drop && (
                <div className="seg" role="group" aria-label={t('chart.result')}>
                  <button type="button" aria-pressed={d.survived === true} onClick={() => set(x.id, { survived: true })}>{t('review.outcome.survived')}</button>
                  <button type="button" aria-pressed={d.survived === false} onClick={() => set(x.id, { survived: false })}>{t('review.outcome.knocked')}</button>
                </div>
              )}
              {x.kind === 'loadout' && (x.slots ?? []).length > 0 && <p className="meta">{t('review.unknownSlots', { list: (x.slots ?? []).map(sl => t(`review.slot.${sl}` as Key)).join(', ') })}</p>}
              {x.kind === 'loadout' && (x.rows ?? []).some(r => r.sure) && <p className="meta">{t('review.gear.fromShot')}</p>}
              {(x.kind === 'loot' || (x.kind === 'loadout' && (d.rows ?? []).length > 0)) && !d.drop && (
                <table className="table compact-table">
                  <thead><tr><th>{t('review.loot.add')}</th><th>{t(x.kind === 'loadout' ? 'review.gear.name' : 'review.loot.name')}</th>{x.kind === 'loot' && <th className="num">{t('review.loot.qty')}</th>}</tr></thead>
                  <tbody>{(d.rows ?? []).map((row, i) => {
                    const src = x.rows?.[i];
                    const upd = (p: Partial<typeof row>) => set(x.id, { rows: (d.rows ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)) });
                    return (
                      <tr key={i}>
                        <td><input type="checkbox" aria-label={t('review.loot.add')} checked={row.on} onChange={e => upd({ on: e.target.checked })} /></td>
                        <td>
                          <input className="input" value={row.name} placeholder={t('review.loot.unknown')} aria-label={t(x.kind === 'loadout' ? 'review.gear.name' : 'review.loot.name')} onChange={e => upd({ name: e.target.value, on: !!e.target.value.trim() })} />
                          {src && src.guess && <span className="meta"> {src.sure ? t('review.gear.sure') : t(x.kind === 'loadout' ? 'review.gear.guess' : 'review.loot.guess', { score: Math.round(src.score * 100) })}</span>}
                        </td>
                        {x.kind === 'loot' && <td className="num"><input className="input num" type="number" min={1} max={99999} value={row.qty} aria-label={t('review.loot.qty')} onChange={e => upd({ qty: Math.max(1, Math.min(99999, Number(e.target.value) || 1)) })} /></td>}
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
              {x.kind === 'screen' && (
                <p className="meta">{t('review.screenHint')}</p>
              )}
            </article>
          );
        })}
        <div className="row">
          <Btn variant="primary" icon={CheckIcon} data-testid="review-save" onClick={saveAll}>{t('review.saveAll')}</Btn>
          {done !== null && <span className="meta" role="status" data-testid="review-done">{t('review.saved', { count: done })}</span>}
        </div>
      </div>
    </Panel>
  );
}
