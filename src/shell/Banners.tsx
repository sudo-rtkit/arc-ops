import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { actions, app, useApp } from '../store';
import { Btn, Dialog, IconBtn } from '../ui/components';
import { fmtDateTime } from '../ui/format';
import { backupFileName } from '../core/backup';
import { useT, type TFn } from '../i18n/react';
import type { LoadInfo } from '../store/app';
import { launchInfo } from '../ops/native';
import { AutoWrites } from '../ui/AutoReview';
import { navigate } from '../store';

/* Hlášení úložiště se zobrazí v jazyce UI podle zdroje dat (text z úložiště je jen česká pojistka). */
const loadWarning = (t: TFn, load: LoadInfo): string =>
  t(load.source === 'bak' ? 'load.warn.bak' : load.source === 'snapshot' ? 'load.warn.snapshot' : 'load.warn.none');

export function Banners() {
  const save = useApp(s => s.save);
  const load = useApp(s => s.load);
  const updatedAt = useApp(s => s.state.meta.updatedAt);
  const [hideLoad, setHideLoad] = useState(false);
  const [details, setDetails] = useState(false);
  /* 0.8.0: start při běžící hře – okno se otevřelo minimalizované bez fokusu; nenápadné upozornění do zavření */
  const [bgStart, setBgStart] = useState(false);
  useEffect(() => { let live = true; void launchInfo().then(i => { if (live) setBgStart(i.gameRunning); }); return () => { live = false; }; }, []);
  const t = useT();
  return (
    <>
      {/* 0.20.0: automatické zápisy raidů (jen v okně aplikace, žádné vyskakovací okno nad hrou) */}
      <AutoWrites onOpenReview={() => navigate('journal')} />
      {bgStart && (
        <div className="banner info" role="status" data-testid="bg-start">
          <Info size={18} aria-hidden="true" />
          <span className="banner-text">{t('banner.bgStart')}</span>
          <IconBtn label={t('banner.hide')} icon={X} ghost onClick={() => setBgStart(false)} />
        </div>
      )}
      {save === 'error' && (
        <div className="banner danger" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span className="banner-text">{t('banner.unsaved')}</span>
          <Btn size="sm" onClick={() => void actions.retrySave()}>{t('banner.retry')}</Btn>
          <Btn size="sm" onClick={() => void actions.exportBackup(backupFileName(new Date(), t.lang))}>{t('settings.export')}</Btn>
        </div>
      )}
      {load && load.warning && !hideLoad && (load.source === 'bak' || load.source === 'snapshot') && (
        <div className="banner amber" role="status">
          <TriangleAlert size={18} aria-hidden="true" />
          <span className="banner-text">{updatedAt ? t('banner.loadedFrom', { at: fmtDateTime(updatedAt) }) : t('banner.loaded')} {loadWarning(t, load)}</span>
          <Btn size="sm" onClick={() => setDetails(true)}>{t('banner.details')}</Btn>
          <IconBtn label={t('banner.hide')} icon={X} ghost onClick={() => setHideLoad(true)} />
        </div>
      )}
      {load && load.warning && !hideLoad && load.source === 'none' && (
        <div className="banner danger" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span className="banner-text">{t('banner.loadFailed')}</span>
          <a className="btn sm" href="#settings">{t('banner.restoreOrImport')}</a>
          <IconBtn label={t('banner.hide')} icon={X} ghost onClick={() => setHideLoad(true)} />
        </div>
      )}
      {details && load && (
        <Dialog title={t('banner.recoveryTitle')} onClose={() => setDetails(false)} footer={<Btn onClick={() => setDetails(false)}>{t('common.close')}</Btn>}>
          <p>{loadWarning(t, load)}</p>
          <p>{t('banner.source')} <b>{load.source === 'bak' ? t('banner.sourceBak') : t('banner.sourceSnap', { name: load.recoveredFrom || '' })}</b>.</p>
          <p className="secondary-text">{t('banner.corruptA')} <span className="mono">state.corrupt-…json</span>. {t('banner.corruptB')}</p>
        </Dialog>
      )}
    </>
  );
}

export function Toasts() {
  const notices = useApp(s => s.notices);
  return (
    <div className="toasts" aria-live="polite">
      {notices.map(n => <Toast key={n.id} id={n.id} text={n.text} tone={n.tone} />)}
    </div>
  );
}
function Toast({ id, text, tone }: { id: string; text: string; tone: string }) {
  const t = useT();
  useEffect(() => {
    if (tone === 'danger') return;
    const h = setTimeout(() => app.dismiss(id), tone === 'success' ? 4000 : 6000);
    return () => clearTimeout(h);
  }, [id, tone]);
  const Icon = tone === 'success' ? CircleCheck : tone === 'danger' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info;
  return (
    <div className={'toast ' + tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span className="grow">{text}</span>
      <IconBtn label={t('banner.closeNotice')} icon={X} ghost onClick={() => app.dismiss(id)} />
    </div>
  );
}
