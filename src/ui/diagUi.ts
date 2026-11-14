/* 0.28.0: export diagnostiky z hlavního okna (panel Nastavení → Diagnostika a upozornění na nečekané ukončení).
   Hlavička exportu dostane jen true/false zapnutých volitelných funkcí (diagFeatures); cestu vybere hráč
   v systémovém dialogu, název navrhne Rust. Zavření upozornění platí do konce relace okna (sessionStorage). */
import { app } from '../store';
import { t } from '../i18n';
import { diagAvailable, diagExport, diagFeatures } from '../shell/diagLog';

export async function exportDiagnostics(): Promise<boolean> {
  if (!diagAvailable()) { app.notify(t('diag.na'), 'info'); return false; }
  try {
    const ok = await diagExport(diagFeatures(app.store.getState().state), t('dialog.diagTitle'), t('dialog.diagFilter'));
    if (ok) app.notify(t('diag.exported'), 'success');
    return ok;
  } catch {
    app.notify(t('diag.exportFailed'), 'danger');
    return false;
  }
}

const KEY = 'arcops.uncleanSeen';
export const uncleanDismissed = (): boolean => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
export const dismissUnclean = (): void => { try { sessionStorage.setItem(KEY, '1'); } catch { /* bez úložiště */ } };
