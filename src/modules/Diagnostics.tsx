/* 0.28.0: Nastavení → Diagnostika. Posledních ~50 záznamů místního deníku chyb (úroveň, čas, okno, zpráva), export
   přes systémový dialog (jako export zálohy), vymazání deníku a krátké vysvětlení, že vše zůstává na tomto počítači.
   Číst, exportovat a mazat smí jen hlavní okno (Rust: main_label_ok / main_window). Mimo aplikaci pro Windows jen
   vysvětlení. */
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { app } from '../store';
import { Badge, Btn, ConfirmButton, Panel, type Tone } from '../ui/components';
import { fmtDateTime } from '../ui/format';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';
import { diagAvailable, diagClear, diagRead, type DiagEntry, type DiagLevel } from '../shell/diagLog';
import { exportDiagnostics } from '../ui/diagUi';

const TONE: Record<DiagLevel, Tone> = { error: 'danger', warn: 'amber', info: 'muted' };
const WINDOWS = ['main', 'buddy', 'overlay', 'widgets', 'app'];
const winKey = (w: string): Key => (WINDOWS.includes(w) ? `diag.win.${w}` : 'diag.win.other') as Key;
const levelKey = (l: string): Key => (l === 'error' || l === 'warn' || l === 'info' ? `diag.level.${l}` : 'diag.level.info') as Key;

export function DiagnosticsPanel() {
  const t = useT();
  const available = diagAvailable();
  const [entries, setEntries] = useState<DiagEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (!available) return;
    void diagRead().then(list => { setEntries([...list].reverse()); setFailed(false); }, () => setFailed(true));
  }, [available]);
  useEffect(load, [load]);
  return (
    <Panel title={t('diag.title')} actions={<ShieldCheck size={16} aria-hidden="true" />}>
      <div className="stack-sm" data-testid="diag-panel">
        <p className="secondary-text" data-testid="diag-intro">{t('diag.intro')}</p>
        <p className="meta" data-testid="diag-privacy">{t('diag.privacy')}</p>
        {!available ? <p className="meta" data-testid="diag-na">{t('diag.na')}</p> : (
          <>
            <div className="row">
              <Btn variant="primary" icon={Download} onClick={() => void exportDiagnostics()} data-testid="diag-export">{t('diag.export')}</Btn>
              <Btn icon={RefreshCw} onClick={load}>{t('diag.refresh')}</Btn>
              <ConfirmButton variant="ghost" icon={Trash2} disabled={!entries?.length} title={t('diag.clearTitle')} text={t('diag.clearText')} confirmLabel={t('diag.clear')}
                onConfirm={() => { void diagClear().then(() => { app.notify(t('diag.cleared')); load(); }, () => app.notify(t('diag.loadFailed'), 'danger')); }}>{t('diag.clear')}</ConfirmButton>
            </div>
            <p className="meta">{t('diag.exportHint')}</p>
            {failed && <p className="meta" role="alert">{t('diag.loadFailed')}</p>}
            {entries && !entries.length && <p className="meta" data-testid="diag-empty">{t('diag.empty')}</p>}
            {entries && entries.length > 0 && (
              <div className="table-wrap tall">
                <table className="table" data-testid="diag-entries" aria-label={t('diag.last')}>
                  <thead><tr><th>{t('diag.col.level')}</th><th>{t('diag.col.time')}</th><th>{t('diag.col.window')}</th><th>{t('diag.col.message')}</th></tr></thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={`${e.ts}-${i}`}>
                        <td><Badge tone={TONE[e.level] ?? 'muted'}>{t(levelKey(e.level))}</Badge></td>
                        <td className="mono">{fmtDateTime(e.ts)}</td>
                        <td>{t(winKey(e.window))}</td>
                        <td className="mono wrap" title={e.stack || undefined}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
