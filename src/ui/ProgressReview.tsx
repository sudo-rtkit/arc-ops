/* Revize postupu ze snímku (0.10.1): profil, dílna, úkol nebo skill tree. Stejná komponenta v overlayi (snímek ze
   zkratky) i v hlavním okně (vložený soubor). Každá hodnota má jistotu: jistá je vybraná, nejistou musí hráč potvrdit,
   nečitelná je „?“ a nikdy se nezapíše. Zapisuje se až tlačítkem a jen vybrané řádky (onWrite). */
import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../store';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import type { ProgressRead } from '../core/vision/progress';
import { proposeProgress, type Conf, type ProgressApply, type ProgressProposal } from '../core/progressImport';
import { fmt } from './format';
import { cx } from './components';

type Variant = 'ov' | 'app';
interface Row { key: string; label: string; read: string; now: string; conf: Conf; same: boolean; note?: string; set: (a: ProgressApply) => void }

const CLS: Record<Variant, Record<'table' | 'btn' | 'primary' | 'banner' | 'muted' | 'tag' | 'card', string>> = {
  ov: { table: 'ov-table', btn: 'ov-btn', primary: 'ov-btn primary', banner: 'ov-banner', muted: 'ov-muted', tag: 'ov-tag', card: 'ov-card ov-review' },
  app: { table: 'table', btn: 'btn sm', primary: 'btn sm primary', banner: 'pr-banner', muted: 'meta', tag: 'badge', card: 'pr-card' },
};
const TONES: Record<Variant, Record<'ok' | 'warn' | 'muted', string>> = { ov: { ok: 'ok', warn: 'warn', muted: 'muted' }, app: { ok: 'success', warn: 'amber', muted: '' } };
const CONF_TONE: Record<Conf, 'ok' | 'warn' | 'muted'> = { high: 'ok', medium: 'warn', unknown: 'muted' };

export const screenTitleKey = (p: ProgressProposal): Key =>
  `progress.screen.${p.kind === 'stations' ? (p.source === 'overview' ? 'workshop' : 'station') : p.kind}` as Key;

export function ProgressReview({ read, id, variant, writing, onWrite, onDiscard }: {
  read: ProgressRead; id: number; variant: Variant; writing: boolean;
  onWrite: (input: ProgressApply) => void; onDiscard?: () => void;
}) {
  const t = useT();
  const s = useAppState();
  const c = CLS[variant];
  const tone = (x: 'ok' | 'warn' | 'muted') => TONES[variant][x];
  const TONE = (cf: Conf) => tone(CONF_TONE[cf]);
  /* návrh se počítá jednou pro snímek (stav aplikace v okamžiku čtení) */
  const p = useMemo(() => proposeProgress(read, s, t.lang), [id, t.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  useEffect(() => { setSel({}); setOk({}); }, [id]);

  const num = (v: number | null) => (v === null ? '?' : fmt(v));
  const rows: Row[] = [];
  if (p.kind === 'profile') {
    for (const k of ['level', 'xp', 'xpNext', 'coins'] as const) {
      const f = p[k];
      rows.push({ key: k, label: t(`progress.field.${k}` as Key), read: num(f.value), now: fmt(p.now[k]), conf: f.conf, same: f.value === p.now[k],
        set: a => { if (f.value !== null) a.profile = { ...a.profile, [k]: f.value }; } });
    }
  } else if (p.kind === 'stations') {
    for (const r of p.rows) rows.push({ key: r.id, label: r.name, read: num(r.value), now: String(r.now), conf: r.conf, same: r.value === r.now,
      note: r.value === null ? undefined : `${r.min}–${r.max}`, set: a => { if (r.value !== null) a.stations = { ...a.stations, [r.id]: r.value }; } });
  } else if (p.kind === 'skills' && p.skill && p.skill.id) {
    const k = p.skill;
    rows.push({ key: k.id!, label: k.name, read: k.current.value === null ? '?' : `${k.current.value}/${k.max}`, now: `${k.now}/${k.max}`,
      conf: k.conf === 'unknown' ? 'unknown' : k.current.conf === 'unknown' ? 'unknown' : k.conf === 'medium' || k.current.conf === 'medium' ? 'medium' : 'high',
      same: k.current.value === k.now, note: k.next !== null ? t('progress.skill.next', { n: k.next }) : k.current.value !== null && k.current.value === k.max ? t('progress.skill.max') : undefined,
      set: a => { if (k.current.value !== null) a.skills = { ...a.skills, [k.id!]: k.current.value }; } });
  } else if (p.kind === 'quest' && p.questId) {
    const q = p.questId;
    if (p.done && p.open) rows.push({ key: 'undone', label: t('progress.quest.undone'), read: t('progress.quest.notDone'), now: t('progress.quest.doneNow'), conf: p.conf, same: false,
      set: a => { a.questUndone = [q]; } });
    if (!p.pinned) rows.push({ key: 'pin', label: t('progress.quest.pin'), read: t('progress.quest.pinYes'), now: t('progress.quest.pinNo'), conf: p.conf, same: false,
      set: a => { a.questPin = [q]; } });
  }
  /* jistá změna je vybraná předem, nejistá až po potvrzení, připnutí jen na přání */
  const isOn = (r: Row) => {
    if (r.conf === 'unknown' || r.same) return false;
    if (r.conf === 'medium' && !ok[r.key]) return false;
    return sel[r.key] ?? r.key !== 'pin';
  };
  const chosen = rows.filter(isOn);
  const write = () => {
    if (!chosen.length || writing) return;
    const a: ProgressApply = {};
    for (const r of chosen) r.set(a);
    onWrite(a);
  };
  const confText = (cf: Conf) => t(`progress.conf.${cf}` as Key);

  return (
    <div className={c.card} data-testid="progress-review" data-kind={p.kind}>
      <div className="pr-head">
        <div>
          <h3>{t(screenTitleKey(p))}</h3>
          <p className={c.muted}>{t('progress.sub')}</p>
        </div>
        {onDiscard && <button type="button" className={c.btn} onClick={onDiscard}>{t('progress.discard')}</button>}
      </div>

      {p.kind === 'quest' && (
        <div className="pr-quest" data-testid="progress-quest">
          {p.questId ? <p><b>{p.title}</b>{p.trader && <span className={c.muted}> · {p.trader}</span>} <span className={cx(c.tag, TONE(p.conf))}>{confText(p.conf)}</span></p>
            : <p className={c.banner + ' warn'}>{t('progress.quest.unknown', { name: p.title || '?' })}</p>}
          {p.objectives.length > 0 && (
            <ul className="pr-objectives">{p.objectives.map((o, i) => (
              <li key={i} data-checked={String(o.checked)}><span aria-hidden="true">{o.checked === true ? '☑' : o.checked === false ? '☐' : '?'}</span>
                <span>{o.text ?? t('progress.quest.objective', { n: i + 1 })}</span>
                <span className="sr-only">{o.checked === true ? t('progress.quest.ticked') : o.checked === false ? t('progress.quest.unticked') : t('progress.conf.unknown')}</span></li>
            ))}</ul>
          )}
          {p.questId && !p.countMatch && <p className={c.muted}>{t('progress.quest.countDiff')}</p>}
          <p className={c.muted}>{t('progress.quest.rule')}</p>
          {p.questId && p.done && !p.open && <p className={c.muted}>{t('progress.quest.doneKept')}</p>}
        </div>
      )}

      {p.kind === 'skills' && (
        <div className="pr-skills">
          <table className={c.table} data-testid="progress-totals">
            <thead><tr><th>{t('progress.col.branch')}</th><th className="num">{t('progress.col.read')}</th><th className="num">{t('progress.col.now')}</th><th>{t('progress.col.status')}</th></tr></thead>
            <tbody>{(['c', 'm', 's'] as const).map(b => {
              const x = p.totals[b];
              const st = x.read === null ? 'unknown' : x.read === x.now ? 'match' : 'differs';
              return (
                <tr key={b} data-branch={b}><td>{t(`progress.branch.${b}` as Key)}</td><td className="num">{num(x.read)}</td><td className="num">{x.now}</td>
                  <td><span className={cx(c.tag, tone(st === 'match' ? 'ok' : st === 'differs' ? 'warn' : 'muted'))}>{t(`progress.total.${st}` as Key)}</span></td></tr>
              );
            })}</tbody>
          </table>
          <p className={c.muted}>{t('progress.skill.totalsRule')}</p>
          {!p.skill && <p className={c.muted}>{t('progress.skill.noTip')}</p>}
          {p.skill && !p.skill.id && <p className={c.banner + ' warn'}>{t('progress.skill.unknown', { name: p.skill.name || '?' })}</p>}
        </div>
      )}

      {p.kind === 'stations' && p.source === 'detail' && p.rows.length === 0 && <p className={c.banner + ' warn'}>{t('progress.station.unknown', { name: p.title || '?' })}</p>}
      {p.kind === 'stations' && p.source === 'overview' && <p className={c.muted}>{t('progress.station.overviewRule')}</p>}

      {rows.length > 0 && (
        <table className={c.table} data-testid="progress-rows">
          <thead><tr><th><span className="sr-only">{t('progress.col.pick')}</span></th><th>{t('progress.col.field')}</th><th className="num">{t('progress.col.read')}</th><th className="num">{t('progress.col.now')}</th><th>{t('progress.col.status')}</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.key} data-row={r.key} data-conf={r.conf} className={cx(r.conf === 'medium' && 'unsure', (r.conf === 'unknown' || r.same) && 'off')}>
              <td><input type="checkbox" checked={isOn(r)} disabled={r.conf === 'unknown' || r.same || (r.conf === 'medium' && !ok[r.key])}
                aria-label={t('progress.rowAria', { name: r.label })} onChange={e => setSel(x => ({ ...x, [r.key]: e.target.checked }))} /></td>
              <td><b>{r.label}</b>{r.note && <em className={c.muted}> · {r.note}</em>}
                {r.conf === 'medium' && !ok[r.key] && !r.same && <> <button type="button" className={variant === 'ov' ? 'ov-link' : 'btn ghost sm'} onClick={() => setOk(x => ({ ...x, [r.key]: true }))}>{t('progress.confirm')}</button></>}</td>
              <td className="num mono" data-testid="progress-read">{r.read}</td>
              <td className="num mono">{r.now}</td>
              <td><span className={cx(c.tag, r.same ? tone('muted') : TONE(r.conf))}>{r.same ? t('progress.same') : confText(r.conf)}</span></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {p.kind === 'stations' && p.resources && p.resources.length > 0 && (
        <div className="pr-resources">
          <h4>{t('progress.station.resources')}</h4>
          <table className={c.table} data-testid="progress-resources">
            <thead><tr><th>{t('progress.col.material')}</th><th className="num">{t('progress.col.game')}</th><th className="num">{t('progress.col.app')}</th></tr></thead>
            <tbody>{p.resources.map((r, i) => (
              <tr key={i}><td>{r.name ?? t('progress.station.resourceN', { n: i + 1 })}</td><td className="num">{num(r.have)} / {num(r.need)}</td><td className="num">{r.name ? fmt(r.stock) : '—'}</td></tr>
            ))}</tbody>
          </table>
          <p className={c.muted}>{p.recipeMatch ? t('progress.station.recipeOk') : t('progress.station.recipeDiff')}</p>
        </div>
      )}

      <footer className="pr-foot">
        <p className={c.muted} data-testid="progress-selected">{rows.length ? t('progress.selected', { count: chosen.length }) : t('progress.nothing')}</p>
        <button type="button" className={c.primary} disabled={writing || !chosen.length} onClick={write} data-testid="progress-write">
          {writing ? t('progress.writing') : t('progress.write', { count: chosen.length })}
        </button>
      </footer>
      <p className={c.muted}>{t('progress.writeHint')}</p>
    </div>
  );
}
