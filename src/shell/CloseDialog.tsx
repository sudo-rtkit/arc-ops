/* Dialog při zavření okna křížkem (0.9.0): skrýt do oznamovací oblasti, nebo ukončit aplikaci. „Zapamatovat volbu“
   ji uloží a příští zavření proběhne potichu (změna v Nastavení → Okno aplikace). Escape nebo křížek dialogu jen
   zavření zruší. */
import { useState } from 'react';
import { useUi } from '../store/ui';
import { Btn, Dialog } from '../ui/components';
import { useT } from '../i18n/react';
import { windowCtl } from './windowCtl';

export function CloseDialog() {
  const open = useUi(s => s.closeAsk);
  if (!open) return null;
  return <CloseDialogBody />;
}

function CloseDialogBody() {
  const t = useT();
  const [remember, setRemember] = useState(false);
  const cancel = () => useUi.setState({ closeAsk: false });
  return (
    <Dialog title={t('close.title')} onClose={cancel} initialFocus="[data-close-tray]"
      footer={<>
        <Btn onClick={() => void windowCtl.chooseClose('quit', remember)} data-testid="close-quit">{t('close.quit')}</Btn>
        <Btn variant="primary" onClick={() => void windowCtl.chooseClose('tray', remember)} data-close-tray data-testid="close-tray">{t('close.tray')}</Btn>
      </>}>
      <p>{t('close.text')}</p>
      <label className="toggle"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} data-testid="close-remember" />{t('close.remember')}</label>
      <p className="meta">{t('close.rememberHint')}</p>
    </Dialog>
  );
}
