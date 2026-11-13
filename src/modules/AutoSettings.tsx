/* 0.20.0: Nastavení → „Automatické snímání obrazovek mimo raid“ (žlutá zóna, výchozí vypnuto, čeká na ověření
   u Embarku) a hlavní vypínač „Vypnout všechna napojení na hru“. Zapnutí snímání vyžaduje potvrzené vysvětlení
   (co se snímá, snímky jen v paměti, ověření u Embarku, vlastní uvážení). Nastavení patří tomuto počítači. */
import { useEffect, useState } from 'react';
import { Pause, Play, PlugZap, Power, ShieldAlert } from 'lucide-react';
import { actions, useAppState } from '../store';
import { Badge, Btn, Dialog, Panel } from '../ui/components';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { AUTO_SCREENS, autoIndicator } from '../core/autoCapture';
import { hotkeyLabel } from '../ops/hotkey';
import { native } from '../ops/mainHub';
import type { AutoStats } from '../ops/native';

function AutoStatsLine() {
  const t = useT();
  const [s, setS] = useState<AutoStats | null>(null);
  useEffect(() => {
    if (!native.available) return;
    let live = true;
    const get = () => { void native.autoStats().then(x => { if (live) setS(x); }, () => undefined); };
    get();
    const h = setInterval(get, 5000);
    return () => { live = false; clearInterval(h); };
  }, []);
  if (!s || !s.ticks) return null;
  const ms = (us: number) => (us / 1000).toFixed(1);
  return <p className="meta mono" data-testid="auto-stats">{t('auto.stats', { ticks: s.ticks, avg: ms(s.totalUs / s.ticks), max: ms(s.maxUs), kb: Math.round(s.stripBytes / 1024), captures: s.captures })}</p>;
}

export function AutoCapturePanel() {
  const t = useT();
  const s = useAppState();
  const a = s.autoCapture;
  const [ask, setAsk] = useState(false);
  const ind = autoIndicator(s);
  const blocked = !s.buddy.enabled || s.gameLink.off;
  const toggle = (on: boolean) => {
    if (!on) { actions.setAutoCapture({ enabled: false }); return; }
    /* vysvětlení se ukáže při každém zapnutí (krátké, jde potvrdit jedním tlačítkem) */
    setAsk(true);
  };
  return (
    <Panel title={t('auto.title')} actions={<Badge tone="amber" title={t('auto.ask.embark')}>{t('auto.badge')}</Badge>}>
      <label className="toggle"><input type="checkbox" data-testid="auto-switch" checked={a.enabled} disabled={blocked && !a.enabled} onChange={e => toggle(e.target.checked)} />{t('auto.switch')}</label>
      <p className="secondary-text">{t('auto.explain')}</p>
      <p className="amber" role="note">{t('auto.borderless')}</p>
      {!s.buddy.enabled && <p className="meta" data-testid="auto-need-ops">{t('auto.needOps')}</p>}
      {s.gameLink.off && <p className="meta">{t('auto.linkOff')}</p>}
      {a.enabled && (
        <div className="stack" data-testid="auto-options">
          <div className="row">
            <Badge tone={ind === 'on' ? 'success' : 'amber'}><span data-testid="auto-state">{t(ind === 'on' ? 'auto.state.on' : 'auto.state.paused')}</span></Badge>
            <Btn size="sm" icon={a.paused ? Play : Pause} data-testid="auto-pause" onClick={() => actions.setAutoCapture({ paused: !a.paused })}>{t(a.paused ? 'auto.resume' : 'auto.pause')}</Btn>
          </div>
          <p className="meta">{t('auto.pauseHint')}</p>
          <fieldset className="field">
            <legend className="field-label">{t('auto.screens')}</legend>
            {AUTO_SCREENS.map(k => (
              <label key={k} className="toggle"><input type="checkbox" data-testid={'auto-screen-' + k} checked={a.screens[k]} onChange={e => actions.setAutoCapture({ screens: { [k]: e.target.checked } })} />{t(`auto.screen.${k}` as Key)}</label>
            ))}
            <p className="meta">{t('auto.screensHint')}</p>
          </fieldset>
          <AutoStatsLine />
        </div>
      )}
      {ask && (
        <Dialog title={t('auto.ask.title')} onClose={() => setAsk(false)} footer={<>
          <Btn variant="ghost" onClick={() => setAsk(false)}>{t('common.cancel')}</Btn>
          <Btn variant="primary" icon={ShieldAlert} data-testid="auto-confirm" onClick={() => { actions.setAutoCapture({ ack: true, enabled: true }); setAsk(false); }}>{t('auto.ask.confirm')}</Btn>
        </>}>
          <div className="stack-sm" data-testid="auto-explain">
            <p>{t('auto.ask.what')}</p>
            <p>{t('auto.ask.memory')}</p>
            <p className="amber"><b>{t('auto.badge')}.</b> {t('auto.ask.embark')}</p>
            <p className="meta">{t('auto.borderless')}</p>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}

export function GameLinkPanel() {
  const t = useT();
  const s = useAppState();
  const g = s.gameLink;
  const sv = g.saved;
  const list = sv ? [
    ...(sv.autoOpen ? [t('link.item.autoOpen')] : []),
    ...(sv.hotkey ? [t('link.item.hotkey', { key: hotkeyLabel(sv.hotkey) })] : []),
    ...(sv.auto ? [t('link.item.auto')] : []),
  ] : [];
  return (
    <Panel title={t('link.title')}>
      {!g.off ? (
        <>
          <Btn icon={PlugZap} data-testid="link-off" onClick={() => actions.setGameLinkOff(true)}>{t('link.off')}</Btn>
          <p className="meta">{t('link.offHint')}</p>
        </>
      ) : (
        <div className="stack-sm" data-testid="link-is-off">
          <p className="amber" role="status">{t('link.isOff')}</p>
          <Btn icon={Power} variant="primary" data-testid="link-restore" onClick={() => actions.setGameLinkOff(false)}>{t('link.restore')}</Btn>
          <p className="meta" data-testid="link-restore-list">{t('link.restoreList', { list: list.length ? list.join(', ') : t('link.item.none') })}</p>
        </div>
      )}
    </Panel>
  );
}
