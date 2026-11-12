/* Příprava na raid (0.14.0, spec docs/superpowers/specs/2026-11-12-priprava-na-raid-design.md):
   1. cíle (úkoly, další úroveň stanice, projekt, peníze; výchozí výběr z kompaktního okna),
   2. sečtený seznam chybějících předmětů s důvodem a typem místa (Material Planner, bez dvojího počítání),
   3. doporučená mapa s důvody (hráč ji může vždy změnit), 4. loadout, 5. spuštění plánu.
   Uložené jsou jen volby; seznam se vždy přepočítá z aktuálního stavu. Ops při spuštění řekne hlášku jen tady
   v okně aplikace (hráč právě klikl), nad hrou nic nevyskakuje. */
import { useMemo, useRef, useState } from 'react';
import { BookOpen, ClipboardCheck, Map as MapIcon, Play, RotateCcw, Square, Target } from 'lucide-react';
import { actions, app, navigate, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Badge, Btn, Check, Empty, PageHead, Panel, Select, cx } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { fmt, fmtDateTime } from '../ui/format';
import { dayKey } from '../core/util';
import { MAPS } from '../core/data/maps';
import type { RaidGoals, RaidPlan } from '../core/types';
import { evalLine, evaluateRaid, nextRaid, planRaid, savedRaid } from '../core/raidEval';
import {
  defaultGoals, emptyGoals, goalOptions, hasGoals, listSig, raidList, recommendedMap, scoreMaps, validGoals, type MapScore,
} from '../core/raidPrep';
import { AreaBadges } from '../ui/MapView';
import { resolveOutfit } from '../core/ops';
import { line, type LineRef } from '../core/opsVoice';
import { OpsCanvas, type OpsHandle } from '../ops/OpsCanvas';
import { useOpsSpeech } from '../ops/speech';
import { hostSound } from '../shell/host';

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

/* 5 · Po raidu (0.15.0): vyhodnocení aktivního plánu. Ze snímku FINDINGS (loot záznamu raidu od spuštění plánu)
   se ukáže samo, jinak po „Vyhodnotit raid“ podle změny zásoby od spuštění. Jen čte; inventář se nemění.
   Uložení do deníku: k záznamu raidu od spuštění plánu, jinak přes stávající zápis raidu (plán se uloží s ním). */
function RaidEvalPanel({ plan, onSay, onNext }: { plan: RaidPlan; onSay: (l: LineRef) => void; onNext: (n: ReturnType<typeof nextRaid>) => void }) {
  const t = useT();
  const s = useAppState();
  const today = dayKey(Date.now());
  const openForm = useUi(x => x.openRaidForm);
  const [on, setOn] = useState(false);
  const raid = planRaid(s, plan);
  const captured = raid && raid.loot.length ? raid : null;
  const show = !!captured || (on && !!plan.snap);
  const ev = useMemo(() => (show ? evaluateRaid(s, plan, captured, t.lang, today) : null), [show, s, plan, captured, t.lang, today]);
  const next = useMemo(() => (ev ? nextRaid(s, plan, ev, t.lang, today) : null), [ev, s, plan, t.lang, today]);
  const saved = savedRaid(s, plan);
  const mapName = (id: string) => MAPS.find(m => m.id === id)?.name ?? id;
  const run = () => {
    setOn(true);
    if (!plan.snap && !captured) return;
    onSay(evalLine(evaluateRaid(s, plan, captured, t.lang, today)));
  };
  const save = () => {
    if (raid) {
      if (actions.attachRaidPlan(raid.id)) app.notify(t('raid.eval.savedToast'), 'success');
      return;
    }
    openForm({ preset: { map: plan.map, route: plan.route || undefined, loadout: plan.loadout || undefined, type: plan.goals.quests.length ? 'quest' : plan.goals.money ? 'money' : 'other' } });
  };
  const doneText = (d: NonNullable<typeof ev>['done'][number]) => t(`raid.eval.done.${d.kind}` as Key, { name: d.name });
  return (
    <Panel title={t('raid.step.eval')} actions={<Btn size="sm" icon={ClipboardCheck} onClick={run} data-testid="raid-eval">{t('raid.eval.run')}</Btn>}>
      <div className="rp-eval" data-testid="raid-eval-panel">
        {!ev ? (
          on && !plan.snap ? <p className="meta" data-testid="raid-eval-legacy">{t('raid.eval.legacy')}</p> : <p className="meta">{t('raid.eval.intro')}</p>
        ) : (
          <>
            <p className="meta" data-testid="raid-eval-source">{captured ? t('raid.eval.fromRaid', { at: fmtDateTime(Math.max(captured.ts, captured.lootScan?.at ?? 0)) }) : t('raid.eval.fromStock', { at: fmtDateTime(plan.startedAt) })}</p>
            <div className="rp-eval-sum" data-testid="raid-eval-sum" data-kind={ev.kind}>
              <b>{t('raid.eval.sum', { found: ev.found, need: ev.need })}</b>
              {ev.value !== null && <span className="meta">{t('raid.eval.value', { value: ev.value })}</span>}
            </div>
            {ev.done.length > 0 && (
              <div className="rp-eval-done" data-testid="raid-eval-done" role="status">
                <span className="mv-eyebrow">{t('raid.eval.done')}</span>
                <ul>{ev.done.map(d => <li key={d.key}>{doneText(d)}</li>)}</ul>
              </div>
            )}
            {ev.rows.length === 0 ? <p className="muted">{t('raid.eval.empty')}</p> : (
              <div className="table-wrap">
                <table className="table rp-table" data-testid="raid-eval-list">
                  <thead><tr><th>{t('raid.list.item')}</th><th className="num">{t('raid.eval.col.found')}</th><th className="num">{t('raid.eval.col.missing')}</th><th>{t('raid.list.area')}</th></tr></thead>
                  <tbody>{ev.rows.map(r => (
                    <tr key={r.mat} data-mat={r.mat} className={r.missing === 0 ? 'rp-done' : undefined}>
                      <td><b>{r.mat}</b></td>
                      <td className="num mono">{fmt(r.found)} / {fmt(r.need)}</td>
                      <td className="num mono">{r.missing ? fmt(r.missing) + '×' : '✓'}</td>
                      <td><AreaBadges areas={r.areas} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {next && (
              <div className="rp-next" data-testid="raid-next">
                <span className="mv-eyebrow">{t('raid.eval.next')}</span>
                {next.rows.length === 0 && !next.goals.money ? <p>{t('raid.eval.nextEmpty')}</p> : (
                  <>
                    {next.best && <p><b>{next.best.name}</b> <span className="meta">{next.best.reasons.map(r => reasonText(t, r)).join(' · ')}</span></p>}
                    <p className="meta">{t('raid.eval.nextList', { count: next.units, items: next.rows.length })}</p>
                    <Btn size="sm" icon={Play} onClick={() => onNext(next)} data-testid="raid-next-start">{t('raid.eval.nextStart')}</Btn>
                  </>
                )}
              </div>
            )}
            <div className="row rp-eval-save">
              <Btn variant="primary" icon={BookOpen} onClick={save} data-testid="raid-eval-save">{saved ? t('raid.eval.saveAgain') : t('raid.eval.save')}</Btn>
              {saved ? <span className="meta" data-testid="raid-eval-saved">{t('raid.eval.saved', { at: fmtDateTime(saved.ts), map: mapName(saved.map) })}</span>
                : <span className="meta">{raid ? t('raid.eval.saveTo', { at: fmtDateTime(raid.ts), map: mapName(raid.map) }) : t('raid.eval.saveForm')}</span>}
            </div>
            <p className="meta">{t('raid.eval.note')}</p>
          </>
        )}
      </div>
    </Panel>
  );
}

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
    hostSound.play('done');
  };
  /* Další raid z vyhodnocení: stejné cíle, doporučená mapa nad zásobou po raidu, stejný loadout. */
  const nextPlan = (n: ReturnType<typeof nextRaid>) => {
    if (!plan || !n.best) return;
    const now = raidList(s, n.goals, t.lang, today);
    if (!actions.startRaidPlan({ goals: n.goals, map: n.best.id, loadout: plan.loadout, route: n.best.route?.id ?? '', sig: listSig(now) })) return;
    setGoals(n.goals); setMapPick(n.best.id);
    setSaid(x => ({ line: line(now.length ? 'raid.start' : 'raid.startEmpty', { map: n.best!.name, count: now.reduce((a, r) => a + r.missing, 0) }), n: x.n + 1 }));
    hostSound.play('done');
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
      {plan && <RaidEvalPanel key={plan.startedAt} plan={plan} onSay={l => setSaid(x => ({ line: l, n: x.n + 1 }))} onNext={nextPlan} />}
    </div>
  );
}
