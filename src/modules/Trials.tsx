import { useRef, type KeyboardEvent } from 'react';
import { History, Star } from 'lucide-react';
import { actions, useAppState } from '../store';
import { Empty, PageHead, Panel, Progress, Stepper, TextField } from '../ui/components';
import { gameTexts } from '../core/gametext';
import { starSum } from '../core/week';
import { useT } from '../i18n/react';

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.min(3, value + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.max(0, value - 1);
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = 3;
    if (n >= 0) { e.preventDefault(); onChange(n); refs.current[n]?.focus(); }
  };
  return (
    <div className="stars" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      <button type="button" role="radio" aria-checked={value === 0} tabIndex={value === 0 ? 0 : -1} ref={el => { refs.current[0] = el; }}
        className="star-zero" onClick={() => onChange(0)}>0</button>
      {[1, 2, 3].map(k => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={t('trials.stars', { count: k })} tabIndex={value === k ? 0 : -1}
          ref={el => { refs.current[k] = el; }} className="star-btn" onClick={() => onChange(value === k ? k - 1 : k)}>
          <Star size={22} aria-hidden="true" fill={value >= k ? 'var(--amber)' : 'none'} color={value >= k ? 'var(--amber)' : 'var(--text-muted)'} />
        </button>
      ))}
      <span className="sr-only">{value === 0 ? t('trials.stars', { count: 0 }) : ''}</span>
    </div>
  );
}

export default function Trials() {
  const s = useAppState();
  const t = useT();
  const tr = s.trials;
  const sum = starSum(tr.stars);
  const texts = gameTexts(t.lang);
  return (
    <div className="page">
      <PageHead title="Weekly Trials" sub={t('trials.sub')} />
      <Panel title={`Trials · ${tr.week || '—'}`} actions={<span className="trials-sum amber">{sum} / 15 ★</span>}>
        <Progress value={sum} max={15} tone="amber" showValue={false} label={t('trials.progress')} />
        <p className="meta">{texts.trialsHint} {t('trials.hintArchive')}</p>
        <div className="trial-rows">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="trial-row">
              <div className="trial-name"><TextField label={t('trials.nameLabel', { n: i + 1 })} hideLabel value={tr.names[i]} placeholder={t('trials.namePh', { n: i + 1 })} onCommit={v => actions.setTrialName(i, v)} maxLength={80} /></div>
              <Stars label={t('trials.starsLabel', { n: i + 1 })} value={tr.stars[i]} onChange={n => actions.setStarsExact(i, n)} />
              <div className="trial-note"><TextField label={t('trials.noteLabel', { n: i + 1 })} hideLabel value={tr.notes[i]} placeholder={t('common.note')} onCommit={v => actions.setTrialNote(i, v)} maxLength={500} /></div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Reward Pass" actions={<span className="mono meta">{t('trials.rpLevel', { n: s.profile.rewardPass })}</span>}>
        <div className="row"><Stepper label={t('trials.rpStepper')} value={s.profile.rewardPass} min={0} max={60} onChange={n => actions.setProfile('rewardPass', n)} /><div className="grow"><Progress value={s.profile.rewardPass} max={60} tone="amber" showValue={false} label="Reward Pass" /></div></div>
        <p className="meta">{texts.rewardPassHint}</p>
      </Panel>
      <Panel title={t('trials.history')} flush>
        {tr.history.length === 0 ? <Empty icon={History}>{t('trials.historyEmpty')}</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('trials.week')}</th><th className="num">{t('trials.starsCol')}</th><th>{t('trials.challenges')}</th></tr></thead>
            <tbody>{tr.history.slice().reverse().map(h => (
              <tr key={h.week}><td className="mono">{h.week}</td><td className="num amber">{starSum(h.stars)} / 15</td>
                <td className="wrap">{h.names.map((n, i) => (n || h.stars[i] ? `${n || t('trials.namePh', { n: i + 1 })} (${h.stars[i]}★)${h.notes[i] ? ' – ' + h.notes[i] : ''}` : null)).filter(Boolean).join(' · ') || '—'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}
