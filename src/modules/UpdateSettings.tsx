/* 0.33.0: Nastavení → Aktualizace (jen hlavní okno). Ve výchozím stavu vypnuto. Přepínač zapne automatickou kontrolu
   (nejvýš jednou denně, nikdy při hře v popředí); tlačítko Zkontrolovat teď funguje i s vypnutou kontrolou, protože
   je to výslovná akce hráče. Síť je jen v Rustu (pevná adresa api.github.com, nejvýš jednou za 10 minut).
   Poznámky k vydání jsou jen prostý text; stránka vydání se otevře jen tlačítkem přes open_external. */
import { useEffect, useState } from 'react';
import { EyeOff, RefreshCw, ExternalLink } from 'lucide-react';
import { actions, useAppState } from '../store';
import { updates } from '../ops/mainHub';
import { newerRelease } from '../core/update';
import { openRelease } from '../ui/updateUi';
import { APP_VERSION } from '../core/whatsnew';
import { Btn, Panel } from '../ui/components';
import { fmtDateTime } from '../ui/format';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

export function UpdatePanel() {
  const t = useT();
  const p = useAppState().update;
  const [busy, setBusy] = useState(updates.busy());
  useEffect(() => updates.subscribe(setBusy), []);
  const r = p.lastResult;
  const newer = newerRelease(p);
  const published = (at: string) => { const ts = Date.parse(at); return Number.isFinite(ts) ? fmtDateTime(ts) : ''; };
  return (
    <Panel title={t('update.title')} actions={<RefreshCw size={16} aria-hidden="true" />} id="update">
      <div className="stack-sm" data-testid="update-settings">
        <label className="toggle"><input type="checkbox" checked={p.enabled} onChange={e => actions.setUpdateCheck(e.target.checked)} data-testid="update-toggle" />{t('update.toggle')}</label>
        <p className="secondary-text">{t('update.intro')}</p>
        <p className="meta">{t('update.offHint')}</p>
        <div className="row">
          <Btn size="sm" icon={RefreshCw} disabled={busy} onClick={() => void updates.check(true)} data-testid="update-check">{busy ? t('update.checking') : t('update.checkNow')}</Btn>
          <span className="meta" data-testid="update-current">{t('update.current', { v: APP_VERSION })}</span>
        </div>
        <p className="meta" data-testid="update-last">{p.lastCheck ? t('update.lastCheck', { at: fmtDateTime(p.lastCheck) }) : t('update.never')}</p>
        {r && !r.ok && <p className="amber" role="status" data-testid="update-result" data-state="error" data-error={r.error}>{t(`update.err.${r.error}` as Key)}</p>}
        {r && r.ok && !newer && <p role="status" data-testid="update-result" data-state="latest">{t('update.upToDate')}</p>}
        {newer && (
          <div className="stack-sm" role="status" data-testid="update-result" data-state="newer" data-version={newer.latest}>
            <p><b>{t('update.available', { v: newer.latest })}</b>{newer.publishedAt && published(newer.publishedAt) ? <span className="meta"> · {t('update.published', { at: published(newer.publishedAt) })}</span> : null}</p>
            {newer.name && <p className="meta" data-testid="update-name">{newer.name}</p>}
            <div className="row">
              <Btn size="sm" variant="primary" icon={ExternalLink} onClick={() => openRelease(newer)} data-testid="update-open">{t('update.open')}</Btn>
              {p.skippedVersion !== newer.latest && <Btn size="sm" variant="ghost" icon={EyeOff} onClick={() => actions.updateSkip(newer.latest)} data-testid="update-skip">{t('update.skip')}</Btn>}
            </div>
            {p.skippedVersion === newer.latest && <p className="meta" data-testid="update-skipped">{t('update.skipped', { v: newer.latest })}</p>}
            <p className="meta">{t('update.howTo')}</p>
            {newer.notes && (
              <details data-testid="update-notes">
                <summary>{t('update.notes')}</summary>
                {/* jen prostý text (React ho escapuje), žádné HTML ani odkazy */}
                <p className="secondary-text" style={{ whiteSpace: 'pre-line' }}>{newer.notes}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
