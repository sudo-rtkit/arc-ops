/* Původ hodnoty v UI (0.21.0): malá tečka s popiskem (title + aria-label) vedle hodnoty a jeden podrobný přehled
   v Nastavení. Barva tečky jen doplňuje text: ruční = tlumená, ze snímku = akcent, nepotvrzená = jantarová. */
import type { Key } from '../i18n';
import { useT, type TFn } from '../i18n/react';
import { useAppState } from '../store';
import { PROV_SOURCES, provSummary, type ProvRec, type ProvSource } from '../core/provenance';
import { Panel, cx } from './components';
import { DASH, fmtDateTime } from './format';

const srcLabel = (t: TFn, src: ProvSource): string => t(`prov.src.${src}` as Key);
const when = (t: TFn, at: number): string => (at > 0 ? fmtDateTime(at, t.lang) : t('prov.timeUnknown'));

/* „Ze snímku (zkratka) 13. 11. 2026 15:02 · jistota 97 % · potvrzeno“; ruční zadání bez jistoty a potvrzení.
   Bez záznamu = výchozí hodnota. */
export function provText(t: TFn, rec: ProvRec | null): string {
  if (!rec) return srcLabel(t, 'default');
  const parts = [`${srcLabel(t, rec.src)} ${when(t, rec.at)}`];
  if (rec.conf !== undefined) parts.push(t('prov.conf', { conf: rec.conf }));
  if (rec.src !== 'manual') parts.push(t(rec.ver ? 'prov.verified' : 'prov.unverified'));
  if (rec.prev) parts.push(t('prov.prev', { text: `${srcLabel(t, rec.prev.src)} ${when(t, rec.prev.at)}` }));
  return parts.join(' · ');
}

const tone = (rec: ProvRec | null): string => {
  if (!rec) return 'default';
  if (!rec.ver) return 'unverified';
  return rec.src === 'manual' ? 'manual' : rec.src === 'migration' || rec.src === 'backup-import' ? 'other' : 'shot';
};

/* Tečka s popiskem. Bez záznamu se nevykreslí (výchozí hodnota), ledaže showDefault. */
export function ProvDot({ rec, showDefault, className }: { rec: ProvRec | null; showDefault?: boolean; className?: string }) {
  const t = useT();
  if (!rec && !showDefault) return null;
  const text = provText(t, rec);
  return <span className={cx('prov-dot', 'prov-' + tone(rec), className)} role="img" title={text} aria-label={t('prov.aria', { text })} data-testid="prov-dot" data-src={rec?.src ?? 'default'} />;
}

/* Podrobný přehled v Nastavení: oblasti, zdroje, nepotvrzené, poslední zápisy. */
export function ProvenancePanel() {
  const s = useAppState();
  const t = useT();
  const rows = provSummary(s);
  const log = [...s.provenance.log].reverse().slice(0, 12);
  return (
    <Panel title={t('prov.panel.title')} id="provenance">
      <p className="secondary-text">{t('prov.panel.text')}</p>
      <div className="table-wrap">
        <table className="table" data-testid="prov-summary">
          <thead><tr><th>{t('prov.col.area')}</th><th className="num">{t('prov.col.values')}</th><th>{t('prov.col.sources')}</th><th className="num">{t('prov.col.unverified')}</th><th>{t('prov.col.latest')}</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.d} data-domain={r.d}>
              <td>{t(`prov.dom.${r.d}` as Key)}</td>
              <td className="num">{r.total}</td>
              <td className="wrap meta">{r.total ? PROV_SOURCES.filter(x => r.bySrc[x]).map(x => `${srcLabel(t, x)} ${r.bySrc[x]}`).join(' · ') : DASH}</td>
              <td className={cx('num', r.unverified > 0 && 'amber')}>{r.unverified || DASH}</td>
              <td className="meta">{r.latest ? fmtDateTime(r.latest, t.lang) : DASH}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <h3 className="label">{t('prov.log.title')}</h3>
      {log.length === 0 ? <p className="meta">{t('prov.log.empty')}</p> : (
        <ul className="prov-log" data-testid="prov-log">{log.map((e, i) => (
          <li key={i}><span className="mono meta">{fmtDateTime(e.at, t.lang)}</span> {srcLabel(t, e.src)} · {t('prov.log.count', { count: e.n })} · <span className="meta">{e.dom.map(d => t(`prov.dom.${d}` as Key)).join(', ')}</span></li>
        ))}</ul>
      )}
    </Panel>
  );
}
