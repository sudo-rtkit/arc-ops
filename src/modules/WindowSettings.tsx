/* Nastavení → „Okno aplikace“ (0.9.0): chování křížku (zeptat se / skrýt do oznamovací oblasti / ukončit),
   kompaktní režim a počet úkolů v něm. Volba křížku jde kdykoli změnit, i zpět na „Pokaždé se zeptat“. */
import { Minimize2 } from 'lucide-react';
import { actions, useApp, useAppState } from '../store';
import { Btn, Panel, Select } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { CLOSE_ACTIONS, MODE_KEY, PIN_KEY, QUESTS_MAX, QUESTS_MIN } from '../core/mainWindow';
import { hotkeyLabel } from '../ops/hotkey';
import { windowCtl } from '../shell/windowCtl';

export function WindowPanel() {
  const t = useT();
  const mw = useAppState().mainWindow;
  const kind = useApp(x => x.storageKind);
  const counts = Array.from({ length: QUESTS_MAX - QUESTS_MIN + 1 }, (_, i) => QUESTS_MIN + i);
  return (
    <Panel title={t('win.title')}>
      <div className="field">
        <span className="field-label" id="win-close-label">{t('win.close')}</span>
        <div className="seg" role="group" aria-labelledby="win-close-label" data-testid="win-close">
          {CLOSE_ACTIONS.map(a => <button key={a} type="button" aria-pressed={mw.close === a} onClick={() => actions.setCloseAction(a)}>{t(`win.close.${a}` as Key)}</button>)}
        </div>
        <p className="meta">{t('win.closeHint')}</p>
      </div>
      <div className="field">
        <span className="field-label">{t('win.compact')}</span>
        <p className="secondary-text">{t('win.compactHint', { mode: hotkeyLabel(MODE_KEY), pin: hotkeyLabel(PIN_KEY) })}</p>
        <div className="row">
          <div style={{ width: 220 }}><Select label={t('win.quests')} value={String(mw.quests)} onChange={v => actions.setCompactQuests(Number(v))} options={counts.map(n => ({ value: String(n), label: String(n) }))} /></div>
          <Btn icon={Minimize2} onClick={() => void windowCtl.setMode('compact')} data-testid="win-to-compact">{t('win.toCompact')}</Btn>
        </div>
        {kind === 'browser' && <p className="meta">{t('win.browser')}</p>}
      </div>
    </Panel>
  );
}
