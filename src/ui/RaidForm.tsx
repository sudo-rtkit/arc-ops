/* Jeden formulář raidu pro Dashboard, Money Runs i Raid Journal. Milník 2: loadout, výbava, loot, ztráty a splněné cíle. */
import { useState, type FormEvent } from 'react';
import { Check as CheckIcon, Skull } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { useUi } from '../store/ui';
import { Btn, Check, Dialog, FieldError, Select } from './components';
import { InAppOnly } from './InAppOnly';
import { inOverlay } from '../shell/host';
import { ItemList } from './ItemList';
import { LootScan } from './LootScan';
import { MAPS } from '../core/data/maps';
import { raidTypes } from '../core/runs';
import { loadoutGear } from '../core/loadouts';
import { lootDelta, lootState } from '../core/raidItems';
import { isDone, sortGoals } from '../core/goals';
import { evaluateRaid } from '../core/raidEval';
import { dayKey } from '../core/util';
import { fmt, fromLocalInput, toLocalInput } from './format';
import type { ItemQty, RaidType } from '../core/types';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

export function RaidFormHost() {
  const form = useUi(s => s.raidForm);
  if (!form) return null;
  return <RaidForm key={form.editId || 'new'} />;
}

function RaidForm() {
  const form = useUi(s => s.raidForm)!;
  const close = useUi(s => s.closeRaidForm);
  const t = useT();
  const state = useAppState();
  const d = useDerived();
  const ROUTES = d.routes;
  const editing = form.editId ? state.raids.find(r => r.id === form.editId) : undefined;
  const p = form.preset || {};
  const firstRoute = p.route !== undefined ? ROUTES.find(r => r.id === p.route) : undefined;
  const [map, setMap] = useState(editing?.map || p.map || firstRoute?.map || 'buried');
  const [type, setType] = useState<RaidType>(editing?.type || p.type || 'money');
  const [route, setRoute] = useState(editing?.route ?? p.route ?? '');
  const [ok, setOk] = useState(editing ? editing.ok : true);
  const [coins, setCoins] = useState(editing ? String(editing.coins) : '');
  const [min, setMin] = useState(editing ? String(editing.min) : p.min !== undefined ? String(p.min) : '');
  const [when, setWhen] = useState(toLocalInput(editing?.ts || Date.now()));
  const [notes, setNotes] = useState(editing?.notes || '');
  const presetLoadout = !editing && p.loadout ? state.loadouts.find(l => l.id === p.loadout) : undefined;
  const [loadout, setLoadout] = useState(editing?.loadout ?? presetLoadout?.id ?? '');
  const [gear, setGear] = useState<ItemQty[]>(editing?.gear || (presetLoadout ? loadoutGear(presetLoadout, d.weaponName) : []));
  const [loot, setLoot] = useState<ItemQty[]>(editing?.loot || []);
  const [lost, setLost] = useState<ItemQty[]>(editing?.lost || []);
  const [goals, setGoals] = useState<string[]>(editing?.goals || []);
  const [applyLoot, setApplyLoot] = useState(false);
  /* 0.15.0: nový záznam během aktivního plánu: plán a jeho vyhodnocení se uloží se záznamem (výchozí zapnuto) */
  const plan = !editing ? state.raidPlan : null;
  const [withPlan, setWithPlan] = useState(true);
  const planEval = plan ? evaluateRaid(state, plan, { id: '', loot, lootApplied: [] }, t.lang, dayKey(Date.now())) : null;
  /* Chyba validace nese klíč slovníku, takže se po změně jazyka přeloží i otevřená hláška. */
  const [err, setErr] = useState<{ field: 'coins' | 'min'; key: Key } | null>(null);
  const [sent, setSent] = useState(false);

  const routes = ROUTES.filter(r => r.map === map);
  const knownRoute = d.allRoutes.find(r => r.id === route);
  const openGoals = sortGoals(state.goals).filter(g => !isDone(g) || goals.includes(g.id));
  const mats = d.materials.map(m => m.name);
  const gearNames = [...new Set([...d.weapons.map(w => w.name), ...state.loadouts.flatMap(l => [l.augment, l.shield, ...l.items.map(i => i.name)]).filter(Boolean)])];
  const applied = editing?.lootApplied || [];
  const lstate = lootState(loot, applied);
  const delta = lootDelta(loot, applied);
  const currentLoadout = state.loadouts.find(l => l.id === loadout);
  const pickLoadout = (id: string) => {
    setLoadout(id);
    const l = state.loadouts.find(x => x.id === id);
    if (l && gear.length === 0) setGear(loadoutGear(l, d.weaponName));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sent) return;
    const c = coins.trim() === '' ? 0 : Number(coins.replace(/\s/g, ''));
    const m = min.trim() === '' ? 0 : Number(min.replace(',', '.'));
    if (ok && (!Number.isFinite(c) || c < 0 || c > 1e8)) return setErr({ field: 'coins', key: 'raid.err.coins' });
    if (!Number.isFinite(m) || m < 0 || m > 120) return setErr({ field: 'min', key: 'raid.err.min' });
    setSent(true);
    const data = { map, type, route, ok, coins: ok ? Math.round(c) : 0, min: Math.round(m * 2) / 2, notes, ts: fromLocalInput(when), loadout, gear, loot, lost, goals };
    if (editing) actions.updateRaid(editing.id, data, { applyLoot });
    else { actions.addRaid(data, { applyLoot, withPlan: !!plan && withPlan }); useUi.getState().timerReset(); }
    close();
  };

  return (
    <Dialog title={editing ? t('raid.edit') : t('raid.log')} onClose={close} size="wide"
      footNote={editing ? t('raid.editNote') : t('raid.newNote')}
      footer={<><Btn onClick={close}>{t('common.cancel')}</Btn><Btn variant="primary" type="submit" form="raid-form" disabled={sent}>{t('raid.save')}</Btn></>}>
      <form id="raid-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Select label={t('common.map')} value={map} onChange={v => { setMap(v); if (knownRoute && knownRoute.map !== v) setRoute(''); }} options={MAPS.map(m => ({ value: m.id, label: m.name }))} />
          <Select label={t('raid.type')} value={type} onChange={v => setType(v as RaidType)} options={raidTypes().map(([v, l]) => ({ value: v, label: l }))} />
          <Select label={t('common.route')} value={route} onChange={setRoute} options={[
            { value: '', label: t('raid.noRoute') },
            ...routes.map(r => ({ value: r.id, label: r.name })),
            ...(route && !knownRoute ? [{ value: route, label: route }] : []),
            ...(knownRoute && (knownRoute.map !== map || !routes.some(r => r.id === route)) ? [{ value: route, label: knownRoute.name + ' ' + t(knownRoute.map !== map ? 'raid.otherMap' : 'raid.hiddenRoute') }] : []),
          ]} />
        </div>
        <div className="field">
          <span className="field-label" id="raid-result">{t('chart.result')}</span>
          <div className="seg" role="group" aria-labelledby="raid-result">
            <button type="button" className="good" aria-pressed={ok} onClick={() => setOk(true)}><CheckIcon size={16} aria-hidden="true" />{t('chart.extract')}</button>
            <button type="button" className="bad" aria-pressed={!ok} onClick={() => setOk(false)}><Skull size={16} aria-hidden="true" />{t('chart.death')}</button>
          </div>
          {!ok && <span className="hint">{t('raid.deathHint')}</span>}
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="raid-coins">{t('raid.coins')}</label>
            <input id="raid-coins" className="input num-input" inputMode="numeric" value={ok ? coins : '0'} disabled={!ok} placeholder="0"
              aria-invalid={err?.field === 'coins' || undefined} aria-describedby={err?.field === 'coins' ? 'raid-err' : undefined}
              onChange={e => setCoins(e.target.value)} />
            {ok && coins && Number.isFinite(Number(coins.replace(/\s/g, ''))) && <span className="hint mono">{fmt(Number(coins.replace(/\s/g, '')))}</span>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="raid-min">{t('raid.min')}</label>
            <input id="raid-min" className="input num-input" inputMode="decimal" value={min} placeholder="0" onChange={e => setMin(e.target.value)}
              aria-invalid={err?.field === 'min' || undefined} aria-describedby={err?.field === 'min' ? 'raid-min-hint raid-err' : 'raid-min-hint'} />
            <span className="hint" id="raid-min-hint">{t('raid.minHint')}</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="raid-when">{t('raid.when')}</label>
            <input id="raid-when" className="input" type="datetime-local" lang={t.lang} value={when} onChange={e => setWhen(e.target.value)} />
          </div>
        </div>
        <div className="form-grid">
          <Select label="Loadout" value={loadout} onChange={pickLoadout} options={[
            { value: '', label: t('journal.noLoadout') },
            ...state.loadouts.map(l => ({ value: l.id, label: l.name })),
            ...(loadout && !currentLoadout ? [{ value: loadout, label: t('common.deletedLoadout') }] : []),
          ]} />
        </div>
        <div className="cols-2">
          <div className="stack-sm">
            <ItemList label={t('loadout.gear')} items={gear} onChange={setGear} suggestions={gearNames} empty={t('raid.noGear')} />
            {currentLoadout && <div><Btn size="sm" onClick={() => setGear(loadoutGear(currentLoadout, d.weaponName))}>{t('raid.gearFromLoadout')}</Btn></div>}
          </div>
          <div className="stack-sm">
            <ItemList label={t('journal.lostGear')} items={lost} onChange={setLost} suggestions={[...gear.map(g => g.name), ...gearNames]} empty={t('raid.nothingLost')} />
            {!ok && gear.length > 0 && <div><Btn size="sm" onClick={() => setLost(gear.map(g => ({ ...g })))}>{t('raid.lostAll')}</Btn></div>}
          </div>
        </div>
        <div className="stack-sm raid-form-loot">
          <ItemList label={t('raid.loot')} items={loot} onChange={setLoot} suggestions={mats} empty={t('raid.noLoot')} />
          {inOverlay() ? <InAppOnly compact route="journal" what="host.why.lootScan" /> : <LootScan gear={gear} loot={loot} onLoot={setLoot} />}
          {lstate !== 'none' && lstate !== 'applied' && (
            <Check checked={applyLoot} onChange={setApplyLoot}
              note={lstate === 'changed'
                ? t('raid.onlyDiff', { list: Object.entries(delta).map(([k, v]) => (v > 0 ? '+' : '') + v + ' ' + k).join(', ') })
                : t('raid.applyHint')}>
              {lstate === 'pending' ? t('raid.applyLoot') : t('raid.applyChanges')}
            </Check>
          )}
          {lstate === 'applied' && <span className="meta">{t('raid.applied')}</span>}
        </div>
        {openGoals.length > 0 && (
          <fieldset className="item-list">
            <legend className="field-label">{t('raid.goals')}</legend>
            {openGoals.map(g => (
              <Check key={g.id} checked={goals.includes(g.id)} onChange={v => setGoals(v ? [...goals, g.id] : goals.filter(x => x !== g.id))}
                note={isDone(g) && g.doneRaid !== editing?.id ? t('raid.doneElsewhere') : undefined}>{g.title}</Check>
            ))}
          </fieldset>
        )}
        {plan && planEval && (
          <div data-testid="raid-form-plan">
            <Check checked={withPlan} onChange={setWithPlan}
              note={t('raid.form.planNote', { map: MAPS.find(m => m.id === plan.map)?.name ?? plan.map, found: planEval.found, need: planEval.need })}>{t('raid.form.plan')}</Check>
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="raid-notes">{t('common.note')}</label>
          <textarea id="raid-notes" className="textarea" value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} />
        </div>
        {err && <FieldError id="raid-err">{t(err.key)}</FieldError>}
      </form>
    </Dialog>
  );
}
