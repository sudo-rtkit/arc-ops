import { useState } from 'react';
import { History } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { profileLimit, type ProfileField } from '../store/app';
import { Empty, NumberField, PageHead, Panel, Progress, Ring, Stepper, Tabs } from '../ui/components';
import { InAppOnly } from '../ui/InAppOnly';
import { inOverlay } from '../shell/host';
import { LineChart } from '../ui/charts';
import { DASH, fmt, fmtDay, fmtDayShort } from '../ui/format';
import { gameTexts } from '../core/gametext';
import { useT } from '../i18n/react';
import { ProgressShot } from '../ui/ProgressShot';
import type { Key } from '../i18n';

type Metric = 'level' | 'coins' | 'xp' | 'rounds' | 'rewardPass';
const METRICS: { id: Metric; label: Key; unit: Key }[] = [
  { id: 'level', label: 'common.level', unit: 'profile.unit.level' }, { id: 'coins', label: 'common.coins', unit: 'profile.unit.coins' },
  { id: 'xp', label: 'profile.xp', unit: 'profile.xp' }, { id: 'rounds', label: 'top.roundsShort', unit: 'profile.unit.rounds' },
  { id: 'rewardPass', label: 'profile.rp', unit: 'profile.unit.rp' },
];

export default function Profile({ sub }: { sub?: string }) {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const p = s.profile;
  const [metric, setMetric] = useState<Metric>('level');
  const field = (f: ProfileField, label: string, hint?: string, suffix?: string) => {
    const [lo, hi] = profileLimit(f);
    return <NumberField label={label} value={p[f]} min={lo} max={hi} hint={hint} suffix={suffix} onCommit={n => actions.setProfile(f, n)} />;
  };
  const m = METRICS.find(x => x.id === metric)!;
  const mLabel = t(m.label), mUnit = t(m.unit);
  const log = s.profileLog;
  const texts = gameTexts(t.lang);
  return (
    <div className="page">
      <PageHead title="Player Profile" sub={t('profile.sub')} />
      <div className="profile-layout">
        <Panel title={t('profile.panel')} className="profile-form">
          <div className="form-grid">
            {field('level', t('common.level'), t('profile.hint.level'))}
            {field('coins', t('common.coins'), t('profile.hint.coins'))}
            {field('xp', t('profile.xp'), t('profile.hint.xp'))}
            {field('xpNext', t('profile.xpNext'), t('profile.hint.xpNext'))}
            {field('rounds', t('common.rounds'), t('profile.hint.rounds'))}
            {field('expBonus', t('profile.exp'), t('profile.hint.exp'))}
            {field('rewardPass', t('profile.rp'), t('profile.hint.rp'))}
          </div>
          <div className="row between">
            <div><span className="field-label">{t('profile.amplified')}</span><p className="meta">{texts.amplified}</p></div>
            <Stepper label={t('profile.amplified')} value={p.amplified} min={0} max={99} onChange={n => actions.setProfile('amplified', n)} />
          </div>
        </Panel>
        <div className="stack">
          <Panel title={t('profile.summary')}>
            <div className="row" style={{ gap: 16 }}>
              <Ring value={p.level} max={75} size={72} label={t('profile.levelOf', { n: p.level })}><span style={{ fontSize: 20 }}>{p.level}</span></Ring>
              <div className="grow">
                <span className="label">{t('common.level')}</span>
                <div className="stat-val mono">{p.level} / 75</div>
                <span className="meta">{p.expBonus ? t('profile.budgetExp', { level: p.level, exp: p.expBonus, budget: d.budget }) : t('profile.budget', { level: p.level, budget: d.budget })}</span>
              </div>
            </div>
            {p.xpNext > 0
              ? <Progress label={t('profile.xpToNext')} value={Math.min(p.xp, p.xpNext)} max={p.xpNext} />
              : <div className="row between"><span className="meta">XP</span><span className="mono meta">{p.xp ? fmt(p.xp) : DASH} {p.xp ? '' : '· ' + t('profile.xpEmpty')}</span></div>}
            <Progress label="Reward Pass" value={p.rewardPass} max={60} tone="amber" />
            <p className="meta">{texts.rewardPassHint}</p>
            <div className="stats-row">
              <div className="stat"><span className="label">{t('common.coins')}</span><span className="stat-val amber">{fmt(p.coins)}</span></div>
              <div className="stat"><span className="label">{t('top.roundsShort')}</span><span className="stat-val">{fmt(p.rounds)}</span></div>
              <div className="stat"><span className="label">Amplified</span><span className="stat-val">{p.amplified}</span></div>
              <div className="stat"><span className="label">{t('top.phase')}</span><span className="stat-val">{d.phases.current > 4 ? 'Endgame' : d.phases.current}</span></div>
            </div>
          </Panel>
        </div>
      </div>
      {inOverlay() ? <InAppOnly route="profile/shot" what="host.why.progressShot" /> : <ProgressShot focus={sub === 'shot'} />}
      <Panel title={t('profile.trend')} actions={<span className="meta">{t('profile.trendMeta')}</span>}>
        <Tabs label={t('profile.metric')} tabs={METRICS.map(x => ({ id: x.id, label: t(x.label) }))} value={metric} onChange={setMetric} />
        {log.length === 0 ? <Empty icon={History}>{t('profile.trendEmpty')}</Empty> : (
          <>
            {log.length === 1 && <p className="meta">{t('profile.trendOne')}</p>}
            <LineChart title={t('profile.trendTitle', { metric: mLabel })} unit={mUnit} color={metric === 'coins' ? 'var(--amber)' : 'var(--accent)'}
              points={log.map(e => ({ key: e.day, label: fmtDayShort(e.day), value: e[metric] }))}
              summary={t('profile.trendSummary', {
                metric: mLabel, from: fmt(log[0][metric]), fromDay: fmtDay(log[0].day), to: fmt(log[log.length - 1][metric]),
                toDay: fmtDay(log[log.length - 1].day), days: t('profile.days', { count: log.length }),
              })} />
          </>
        )}
      </Panel>
    </div>
  );
}
