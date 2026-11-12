/* Nastavení → „Buddy a zkratka“ a „Šatník Opse“ (milník 5). Přepínač je ve výchozím stavu vypnutý; dokud je
   vypnutý, neběží žádné okno ani zkratka. Zkratka se uloží, až ji systém přijme (RegisterHotKey v Rustu). */
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, RotateCcw, Volume2, X } from 'lucide-react';
import { actions, useApp, useAppState } from '../store';
import { Btn, Panel, Select } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { OPACITY_MAX, OPACITY_MIN, OPS, OPS_SLOTS, collection, formForLevel, partName, resolveOutfit, slotParts, validHotkey } from '../core/ops';
import { OpsCanvas } from '../ops/OpsCanvas';
import { hub } from '../ops/mainHub';
import { hotkeyFrom, hotkeyLabel } from '../ops/hotkey';
import { MODE_KEY, PIN_KEY } from '../core/mainWindow';
import { PERSONALITIES, TUTORIAL_STEPS } from '../core/opsPrefs';
import { line, sayLine } from '../core/opsVoice';
import { restart } from '../core/tutorial';
import { mainSound } from '../ops/mainHub';
import { useUi } from '../store/ui';

function HotkeyField() {
  const t = useT();
  const hotkey = useAppState().buddy.hotkey;
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  useEffect(() => {
    if (!recording) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) { setRecording(false); return; }
      const h = hotkeyFrom(e);
      if (!h) return;
      setRecording(false);
      if (!validHotkey(h)) { setError('ops.hotkey.invalid'); return; }
      void hub.setHotkey(h).then(err => setError(err ? (`ops.${err.replace(':', '.')}` as Key) : null));
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [recording]);
  return (
    <div className="field">
      <span className="field-label" id="ops-hotkey-label">{t('ops.hotkey')}</span>
      <div className="row">
        <kbd className="kbd mono" aria-labelledby="ops-hotkey-label" data-testid="ops-hotkey">{recording ? t('ops.hotkeyRecord') : hotkey ? hotkeyLabel(hotkey) : t('ops.hotkeyNone')}</kbd>
        <Btn size="sm" icon={Keyboard} onClick={() => { setError(null); setRecording(true); }} disabled={recording}>{t('ops.hotkeySet')}</Btn>
        {hotkey && <Btn size="sm" variant="ghost" icon={X} onClick={() => void hub.setHotkey('').then(() => setError(null))}>{t('ops.hotkeyClear')}</Btn>}
      </div>
      {error ? <p className="danger-text" role="alert">{t(error)}</p> : <p className="meta">{t('ops.hotkeyHint')}</p>}
      {(hotkey === MODE_KEY || hotkey === PIN_KEY) && <p className="amber" role="note">{t('ops.hotkeyShadow', { key: hotkeyLabel(hotkey) })}</p>}
    </div>
  );
}

export function OpsPanel() {
  const t = useT();
  const b = useAppState().buddy;
  const kind = useApp(x => x.storageKind);
  const [opacity, setOpacity] = useState(b.opacity);
  useEffect(() => setOpacity(b.opacity), [b.opacity]);
  return (
    <Panel title={t('ops.title')}>
      <label className="toggle"><input type="checkbox" data-testid="ops-switch" checked={b.enabled} onChange={e => actions.setBuddy({ enabled: e.target.checked })} />{t('ops.switch')}</label>
      <p className="secondary-text">{t('ops.explain')}</p>
      <p className="amber" role="note">{t('ops.risk')}</p>
      {kind === 'browser' && <p className="meta">{t('ops.browser')}</p>}
      {!b.enabled ? <p className="meta" data-testid="ops-off">{t('ops.offHint')}</p> : (
        <div className="stack" data-testid="ops-options">
          <HotkeyField />
          <div className="field">
            <span className="field-label">{t('ops.scale')}</span>
            <div className="seg" role="group" aria-label={t('ops.scale')}>
              {([1, 2] as const).map(sc => <button key={sc} type="button" aria-pressed={b.scale === sc} onClick={() => actions.setBuddy({ scale: sc })}>{t(sc === 1 ? 'ops.scale1' : 'ops.scale2')}</button>)}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ops-opacity">{t('ops.opacity')}: <span className="mono">{t('ops.opacityVal', { v: opacity })}</span></label>
            <input id="ops-opacity" type="range" min={OPACITY_MIN} max={OPACITY_MAX} step={1} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))} onPointerUp={() => actions.setBuddy({ opacity })} onKeyUp={() => actions.setBuddy({ opacity })} onBlur={() => actions.setBuddy({ opacity })} />
          </div>
          <label className="toggle"><input type="checkbox" checked={b.autoOpen} onChange={e => actions.setBuddy({ autoOpen: e.target.checked })} />{t('ops.autoOpen')}</label>
          <p className="meta">{t('ops.autoOpenHint')}</p>
        </div>
      )}
    </Panel>
  );
}

export function WardrobePanel() {
  const t = useT();
  const s = useAppState();
  const level = s.profile.level;
  const have = useMemo(() => collection(s.buddy, level), [s.buddy, level]);
  const outfit = useMemo(() => resolveOutfit(level, s.buddy), [level, s.buddy]);
  const form = formForLevel(level);
  const next = OPS.unlocks.find(u => u.level > level && u.unlockedParts.some(p => !have.includes(p)));
  const nextPart = next?.unlockedParts.find(p => !have.includes(p));
  return (
    <Panel title={t('ops.wardrobe')} actions={<Btn size="sm" variant="ghost" onClick={() => actions.resetBuddyOutfit()} disabled={!Object.keys(s.buddy.outfit).length}>{t('ops.autoAll')}</Btn>}>
      <p className="secondary-text">{t('ops.wardrobeHint')}</p>
      <div className="ops-wardrobe">
        <div className="ops-preview">
          <OpsCanvas variant="detail" fit level={level} outfit={outfit} scale={1} label={t('ops.previewAria')} />
          <p data-testid="ops-form">{t('ops.form', { name: form.name[t.lang], level })}</p>
          <p className="meta" data-testid="ops-collection">{t('ops.collection', { have: have.length, total: OPS.parts.length })}</p>
          <p className="meta">{next && nextPart ? t('ops.next', { level: next.level, name: partName(nextPart, t.lang) }) : t('ops.nextMax')}</p>
        </div>
        <div className="ops-slots">
          {OPS_SLOTS.map(slot => {
            const manual = s.buddy.outfit[slot];
            const value = manual === undefined ? 'auto' : manual === null ? '' : manual;
            const parts = slotParts(slot, have);
            return (
              <Select key={slot} label={t(`ops.slot.${slot}` as Key)} value={value}
                onChange={v => actions.setBuddyOutfit(slot, v === '' ? null : v)}
                options={[
                  { value: 'auto', label: t('ops.slotAuto') + (manual === undefined && outfit[slot] ? ` · ${partName(outfit[slot]!, t.lang)}` : '') },
                  { value: '', label: t('ops.slotNone') },
                  ...parts.map(p => ({ value: p.id, label: p.name[t.lang] })),
                ]} />
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/* 0.10.0: povaha Opse, zvuky a průvodce. Patří tomuto počítači (import zálohy je nemění). */
const SAMPLE = line('hint.missing', { mats: '2× Power Cable', station: 'Gear Bench', level: 2, count: 2 });
export function OpsVoicePanel() {
  const t = useT();
  const p = useAppState().opsPrefs;
  const [volume, setVolume] = useState(p.volume);
  useEffect(() => setVolume(p.volume), [p.volume]);
  const sample = useMemo(() => sayLine(SAMPLE, p.personality, t.lang), [p.personality, t.lang]);
  const commit = () => { if (volume !== p.volume) actions.setOpsPrefs({ volume }); };
  const n = TUTORIAL_STEPS.filter(x => x !== 'profile-manual').indexOf(p.tutorial.step === 'profile-manual' ? 'profile' : p.tutorial.step) + 1;
  return (
    <Panel title={t('opsVoice.title')}>
      <div className="stack" data-testid="ops-voice">
        <div className="field">
          <span className="field-label" id="ops-personality-label">{t('opsVoice.personality')}</span>
          <div className="seg" role="group" aria-labelledby="ops-personality-label">
            {PERSONALITIES.map(x => <button key={x} type="button" aria-pressed={p.personality === x} onClick={() => actions.setOpsPrefs({ personality: x })}>{t(`opsVoice.p.${x}` as Key)}</button>)}
          </div>
          <p className="meta">{t('opsVoice.personalityHint')}</p>
          <blockquote className="ops-sample" data-testid="ops-sample"><span className="meta">{t('opsVoice.sample')}</span> {sample}</blockquote>
        </div>
        <label className="toggle"><input type="checkbox" data-testid="ops-sound" checked={p.sound} onChange={e => actions.setOpsPrefs({ sound: e.target.checked })} />{t('opsVoice.sound')}</label>
        <p className="meta">{t('opsVoice.soundHint')}</p>
        <div className="field">
          <label className="field-label" htmlFor="ops-volume">{t('opsVoice.volume')}: <span className="mono">{t('ops.opacityVal', { v: volume })}</span></label>
          <div className="row">
            <input id="ops-volume" type="range" min={0} max={100} step={1} value={volume} disabled={!p.sound}
              onChange={e => setVolume(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
            <Btn size="sm" icon={Volume2} disabled={!p.sound || volume === 0} onClick={() => { commit(); mainSound.play('done', { force: true }); }}>{t('opsVoice.test')}</Btn>
          </div>
        </div>
        <label className="toggle"><input type="checkbox" data-testid="ops-dialogs" checked={p.dialogs} onChange={e => actions.setOpsPrefs({ dialogs: e.target.checked })} />{t('opsVoice.dialogs')}</label>
        <p className="meta">{t('opsVoice.dialogsHint')}</p>
        <div className="field">
          <span className="field-label">{t('opsVoice.tutorial')}</span>
          <p className="meta" data-testid="tour-status">{p.tutorial.status === 'active' ? t('opsVoice.tour.active', { n, total: TUTORIAL_STEPS.length - 1 }) : t(`opsVoice.tour.${p.tutorial.status}` as Key)}</p>
          <div className="row"><Btn size="sm" icon={RotateCcw} data-testid="tour-restart" onClick={() => { useUi.setState({ tourHidden: false }); actions.setOpsPrefs({ tutorial: restart() }); }}>{t('opsVoice.tourRestart')}</Btn></div>
        </div>
      </div>
    </Panel>
  );
}
