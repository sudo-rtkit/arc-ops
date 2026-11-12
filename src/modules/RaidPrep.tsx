/* Příprava na raid (0.14.0, spec docs/superpowers/specs/2026-11-12-priprava-na-raid-design.md):
   1. cíle (úkoly, další úroveň stanice, projekt, peníze; výchozí výběr z kompaktního okna),
   2. sečtený seznam chybějících předmětů s důvodem a typem místa (Material Planner, bez dvojího počítání),
   3. doporučená mapa s důvody (hráč ji může vždy změnit), 4. loadout, 5. spuštění plánu.
   Uložené jsou jen volby; seznam se vždy přepočítá z aktuálního stavu. Ops při spuštění řekne hlášku jen tady
   v okně aplikace (hráč právě klikl), nad hrou nic nevyskakuje. */
import { useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Play, RotateCcw, Square, Target } from 'lucide-react';
import { actions, navigate, useAppState, useDerived } from '../store';
import { Badge, Btn, Check, Empty, PageHead, Panel, Select, cx } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt, fmtDateTime } from '../ui/format';
import { dayKey } from '../core/util';
import { MAPS } from '../core/data/maps';
import type { RaidGoals } from '../core/types';
import {
  defaultGoals, emptyGoals, goalOptions, hasGoals, listSig, raidList, recommendedMap, scoreMaps, validGoals, type MapScore,
} from '../core/raidPrep';
import { AreaBadges } from '../ui/MapView';
import { resolveOutfit } from '../core/ops';
import { line, type LineRef } from '../core/opsVoice';
import { OpsCanvas, type OpsHandle } from '../ops/OpsCanvas';
import { useOpsSpeech } from '../ops/speech';
import { mainSound } from '../ops/mainHub';

function OpsSays({ said }: { said: { line: LineRef | null; n: number } }) {
  const s = useAppState();
  const t = useT();
  const ops = useRef<OpsHandle | null>(null);
  const sp = useOpsSpeech(said.line, s.opsPrefs.personality, t.lang, { ops, nonce: said.n });
  return (
    <div className="rp-ops" data-testid="raid-ops">
      <OpsCanvas ref={ops} variant="detail" fit scale={1} level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} paint={s.games.paint}
        label={t('ops.previewAria')} restAnim={sp.talking ? 'talk' : 'idle'} />
      <p className={cx('rp-speech', !sp.text && 'muted')} role="status" aria-label={t('ops.speechAria')} data-testid="ops-line">{sp.text || t('raid.opsIdle')}</p>
    </div>
  );
}

const reasonText = (t: ReturnType<typeof useT>, r: MapScore['reasons'][number]) => t(r.key as Key, r.params);

export default function RaidPrep() {
  const t = useT();
  const s = useAppState();
  const d = useDerived();
  const today = dayKey(Date.now());
  const plan = s.raidPlan;
  const opts = useMemo(() => goalOptions(s, t.lang, today), [s, t.lang, today]);
  const [goals, setGoals] = useState<RaidGoals>(() => (plan ? validGoals(s, plan.goals, t.lang, today) : defaultGoals(s, t.lang)));
  const [mapPick, setMapPick] = useState<string | null>(plan?.map ?? null);
  const [loadout, setLoadout] = useState(plan?.loadout ?? '');
  const [said, setSaid] = useState<{ line: LineRef | null; n: number }>({ line: null, n: 0 });
  const [showAllQuests, setShowAllQuests] = useState(false);

  const g = useMemo(() => validGoals(s, goals, t.lang, today), [s, goals, t.lang, today]);
  const rows = useMemo(() => raidList(s, g, t.lang, today), [s, g, t.lang, today]);
  const scores = useMemo(() => scoreMaps(s, g, t.lang), [s, g, t.lang]);
  const rec = recommendedMap(scores);
  const mapId = mapPick ?? rec?.id ?? MAPS[0].id;
  const chosen = scores.find(x => x.id === mapId);
  const route = chosen?.route ?? null;
  const planRows = useMemo(() => (plan ? raidList(s, plan.goals, t.lang, today) : []), [s, plan, t.lang, today]);
  const stale = !!plan && plan.sig !== listSig(planRows);
  const units = rows.reduce((a, r) => a + r.missing, 0);

  const toggle = (k: 'quests' | 'stations' | 'projects', id: string, on: boolean) =>
    setGoals(x => ({ ...x, [k]: on ? [...x[k].filter(v => v !== id), id] : x[k].filter(v => v !== id) }));
  const start = () => {
    const ok = actions.startRaidPlan({ goals: g, map: mapId, loadout, route: route?.id ?? '', sig: listSig(rows) });
    if (!ok) return;
    const name = MAPS.find(m => m.id === mapId)?.name ?? mapId;
    setSaid(x => ({ line: line(rows.length ? 'raid.start' : 'raid.startEmpty', { map: name, count: units }), n: x.n + 1 }));
    mainSound.play('done');
  };
  const quests = showAllQuests ? opts.quests : opts.quests.filter(q => q.pinned || q.started || g.quests.includes(q.id)).concat(
    opts.quests.filter(q => !(q.pinned || q.started || g.quests.includes(q.id))).slice(0, Math.max(0, 8 - opts.quests.filter(q => q.pinned || q.started || g.quests.includes(q.id)).length)));
  const mapName = (id: string) => MAPS.find(m => m.id === id)?.name ?? id;

  return (
    <div className="page rp-page">
      <PageHead title={t('nav.raidPrep')} sub={t('raid.sub')} />
      <div className="rp-top">
        {plan ? (
          <section className="rp-active" data-testid="raid-active" aria-label={t('raid.active.title')}>
            <i className="mv-dot" aria-hidden="true" />
            <div className="grow">
              <b>{t('raid.active.title')}</b> <span className="meta">{t('raid.active.since', { at: fmtDateTime(plan.startedAt) })}</span>
              <p>{t('raid.active.text', { map: mapName(plan.map), count: planRows.reduce((a, r) => a + r.missing, 0), items: planRows.length })}</p>
              {stale && <p className="meta" data-testid="raid-stale">{t('raid.stale')}</p>}
            </div>
            <div className="row">
              <Btn icon={MapIcon} onClick={() => navigate('maps', plan.map)}>{t('raid.openMap')}</Btn>
              <Btn icon={Square} onClick={() => actions.endRaidPlan()} data-testid="raid-end">{t('raid.end')}</Btn>
            </div>
          </section>
        ) : <p className="meta rp-intro">{t('raid.intro')}</p>}
        <OpsSays said={said} />
      </div>

      <Panel title={t('raid.step.goals')} actions={<>
        <Btn size="sm" icon={RotateCcw} onClick={() => setGoals(defaultGoals(s, t.lang))}>{t('raid.goals.default')}</Btn>
        <Btn size="sm" onClick={() => setGoals(emptyGoals())}>{t('raid.goals.none')}</Btn>
      </>}>
        <div className="rp-goals" data-testid="raid-goals">
          <fieldset>
            <legend>{t('raid.goals.quests')}</legend>
            {opts.quests.length === 0 ? <p className="meta">{t('raid.goals.noQuests')}</p> : quests.map(q => (
              <Check key={q.id} checked={g.quests.includes(q.id)} onChange={v => toggle('quests', q.id, v)}
                note={[q.pinned ? t('raid.goals.pinned') : '', q.started ? t('raid.goals.started') : '', q.maps.length ? q.maps.map(mapName).join(', ') : t('raid.goals.anyMap')].filter(Boolean).join(' · ')}>
                {q.name}
              </Check>
            ))}
            {opts.quests.length > quests.length && <button type="button" className="btn sm ghost" onClick={() => setShowAllQuests(true)}>{t('raid.goals.allQuests', { count: opts.quests.length })}</button>}
          </fieldset>
          <fieldset>
            <legend>{t('raid.goals.stations')}</legend>
            {opts.stations.length === 0 ? <p className="meta">{t('raid.goals.noStations')}</p> : opts.stations.map(x => (
              <Check key={x.id} checked={g.stations.includes(x.id)} onChange={v => toggle('stations', x.id, v)} note={x.block ?? undefined}>{x.name} {x.level}</Check>
            ))}
            <legend className="rp-sub">{t('raid.goals.projects')}</legend>
            {opts.projects.length === 0 ? <p className="meta">{t('raid.goals.noProjects')}</p> : opts.projects.map(x => (
              <Check key={x.id} checked={g.projects.includes(x.id)} onChange={v => toggle('projects', x.id, v)}>{x.label}</Check>
            ))}
            <legend className="rp-sub">{t('raid.goals.other')}</legend>
            <Check checked={g.money} onChange={v => setGoals(x => ({ ...x, money: v }))} note={t('raid.goals.moneyNote')}>{t('raid.goal.money')}</Check>
          </fieldset>
        </div>
      </Panel>

      <Panel title={t('raid.step.list')} actions={<span className="mono meta" data-testid="raid-list-sum">{t('raid.list.sum', { count: units, items: rows.length })}</span>} flush>
        {!hasGoals(g) ? <Empty icon={Target}>{t('raid.list.noGoals')}</Empty> : rows.length === 0 ? <Empty icon={Target}>{t('raid.list.empty')}</Empty> : (
          <div className="table-wrap">
            <table className="table rp-table" data-testid="raid-list">
              <thead><tr><th>{t('raid.list.item')}</th><th className="num">{t('raid.list.missing')}</th><th>{t('raid.list.why')}</th><th>{t('raid.list.area')}</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.mat} data-mat={r.mat}>
                  <td><b>{r.mat}</b><small className="meta"> {t('raid.list.have', { have: r.have, need: r.need })}</small></td>
                  <td className="num mono">{fmt(r.missing)}×</td>
                  <td className="wrap">{r.reasons.map(x => `${fmt(x.qty)}× ${x.label}`).join(', ')}</td>
                  <td><AreaBadges areas={r.areas} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="meta rp-note">{t('raid.list.note')}</p>
      </Panel>

      <div className="rp-grid">
        <Panel title={t('raid.step.map')}>
          {rec && (
            <div className="rp-rec" data-testid="raid-rec">
              <span className="mv-eyebrow">{t('raid.map.recommended')}</span>
              <h3>{rec.name}</h3>
              <p className="meta">{rec.reasons.map(r => reasonText(t, r)).join(' · ')}</p>
            </div>
          )}
          <ol className="rp-maps" data-testid="raid-maps">{scores.map(m => (
            <li key={m.id} className={cx(m.id === mapId && 'on', m.locked && 'locked')}>
              <label>
                <input type="radio" name="rp-map" checked={m.id === mapId} onChange={() => setMapPick(m.id)} />
                <span className="grow"><b>{m.name}</b>{m.id === rec?.id && <Badge tone="accent">{t('raid.map.recBadge')}</Badge>}
                  <small>{m.reasons.map(r => reasonText(t, r)).join(' · ')}</small></span>
                <span className="mono rp-score" aria-label={t('raid.map.scoreAria', { n: m.score })}>{m.score > 0 ? '+' : ''}{m.score}</span>
              </label>
            </li>
          ))}</ol>
          {mapPick && mapPick !== rec?.id && <button type="button" className="btn sm ghost" onClick={() => setMapPick(null)}>{t('raid.map.auto')}</button>}
          <p className="meta">{t('raid.map.note')}</p>
        </Panel>
        <Panel title={t('raid.step.loadout')}>
          <Select label={t('raid.loadout.label')} value={loadout} onChange={setLoadout}
            options={[{ value: '', label: t('raid.loadout.none') }, ...s.loadouts.map(l => ({ value: l.id, label: l.name + (l.purpose ? ` · ${l.purpose}` : '') }))]} />
          {s.loadouts.length === 0 && <p className="meta">{t('raid.loadout.empty')} <a href="#weapons/loadouts">{t('raid.loadout.create')}</a></p>}
          {route && <p className="rp-route" data-testid="raid-route"><b>{t('raid.loadout.route', { name: route.name })}</b> {route.loadout || t('common.notSpecified')}</p>}
          <hr className="divider" />
          <Btn variant="primary" icon={Play} onClick={start} disabled={!hasGoals(g)} data-testid="raid-start">{plan ? t('raid.restart') : t('raid.start')}</Btn>
          <p className="meta">{t('raid.start.note', { map: mapName(mapId), loadout: loadout ? d.loadoutName(loadout) : t('raid.loadout.none') })}</p>
        </Panel>
      </div>
    </div>
  );
}
