/* 0.16.0: část modulu, která v overlayi nejde (výběr souboru, dialogy, zálohy, snímek mapy). Místo ní ukáže
   krátké vysvětlení a tlačítko „Otevřít v aplikaci“: hlavní okno se otevře na stejném místě (overlay se zavře). */
import { AppWindow } from 'lucide-react';
import { Btn } from './components';
import { useT } from '../i18n/react';
import { openInApp } from '../shell/host';
import type { Key } from '../i18n';

export function InAppOnly({ route, what, compact }: { route: string; what: Key; compact?: boolean }) {
  const t = useT();
  return (
    <div className={compact ? 'in-app-only compact' : 'in-app-only'} data-testid="in-app-only" data-route={route}>
      <p><b>{t('host.inAppOnly')}</b> <span className="meta">{t(what)}</span></p>
      <Btn size="sm" icon={AppWindow} onClick={() => openInApp(route)} data-testid="in-app-open">{t('host.openInApp')}</Btn>
    </div>
  );
}
