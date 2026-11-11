/* Vlastní SVG grafy (visual-design.md kap. 8): osa od nuly, explicitní jednotka, textové shrnutí a tabulka dat. */
import { useState, type ReactNode } from 'react';
import { fmt } from './format';
import { tl, type Lang } from '../i18n';
import { useT } from '../i18n/react';

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const short = (v: number, lang: Lang): string => (v >= 1e6 ? tl(lang, 'chart.mil', { n: fmt(v / 1e6, lang) }) : v >= 1e4 ? tl(lang, 'chart.k', { n: fmt(v / 1e3, lang) }) : fmt(v, lang));

export interface ResultPoint { key: string; label: string; value: number; ok: boolean; detail: string }

/* Výsledky raidů: sloupec výdělku, extrakce = kroužek, smrt = křížek na nule. */
export function ResultChart({ points, unit, height = 200, summary, title }: { points: ResultPoint[]; unit: string; height?: number; summary: ReactNode; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 64, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(0, ...points.map(p => p.value)));
  const iw = W - L - R, ih = H - T - B;
  const bw = points.length ? iw / points.length : iw;
  const y = (v: number) => T + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const cur = hover !== null ? points[hover] : null;
  const t = useT();
  return (
    <figure className="chart-box" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12">{short(v, t.lang)}</text>
          </g>
        ))}
        <text x={L - 8} y={H - 6} textAnchor="end" fill="var(--text-muted)" fontSize="12">{unit}</text>
        {points.map((p, i) => {
          const x = L + i * bw, cxp = x + bw / 2;
          const bh = Math.max(0, (p.value / max) * ih);
          return (
            <g key={p.key} tabIndex={0} role="img" aria-label={p.ok ? t('chart.pointOk', { label: p.label, value: fmt(p.value), unit }) : t('chart.pointDead', { label: p.label, unit })}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <rect x={x} y={T} width={bw} height={ih} fill={hover === i ? 'var(--bg-hover)' : 'transparent'} />
              {p.ok && bh > 0 && <rect x={x + bw * 0.2} y={y(p.value)} width={bw * 0.6} height={bh} fill="var(--amber)" rx="1" />}
              {p.ok
                ? <circle cx={cxp} cy={y(p.value)} r="4" fill="var(--bg-panel)" stroke="var(--success)" strokeWidth="2" />
                : <path d={`M${cxp - 4} ${y(0) - 4} l8 8 m0 -8 l-8 8`} stroke="var(--danger)" strokeWidth="2" />}
              {(points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && (
                <text x={cxp} y={H - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="12">{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row between" style={{ minHeight: 20 }}>
        <span className="legend"><span><i style={{ background: 'var(--success)' }} />{t('chart.extract')}</span><span><i style={{ background: 'var(--danger)' }} />{t('chart.death0')}</span><span><i style={{ background: 'var(--amber)', borderRadius: 1 }} />{t('chart.earnings')}</span></span>
        <span className="meta mono" aria-live="polite">{cur ? `${cur.detail} · ${cur.ok ? fmt(cur.value) + ' ' + unit : t('chart.deathLower')}` : ''}</span>
      </div>
      <figcaption className="chart-summary">{summary}</figcaption>
      <details className="data-table">
        <summary>{t('chart.table')}</summary>
        <table className="table"><thead><tr><th>{t('chart.raid')}</th><th>{t('chart.result')}</th><th className="num">{unit}</th></tr></thead>
          <tbody>{points.map(p => <tr key={p.key}><td>{p.detail}</td><td>{p.ok ? t('chart.extract') : t('chart.death')}</td><td className="num">{fmt(p.value)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

export interface LinePoint { key: string; label: string; value: number }

export function LineChart({ points, unit, height = 200, summary, title, color = 'var(--accent)', zero = true }: { points: LinePoint[]; unit: string; height?: number; summary: ReactNode; title: string; color?: string; zero?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 64, R = 16, T = 12, B = 28;
  const vals = points.map(p => p.value);
  const maxV = niceMax(Math.max(0, ...vals));
  const minV = zero ? 0 : Math.min(...vals, 0);
  const iw = W - L - R, ih = H - T - B;
  const x = (i: number) => L + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => T + ih - ((v - minV) / (maxV - minV || 1)) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const cur = hover !== null ? points[hover] : null;
  const t = useT();
  return (
    <figure className="chart-box" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[minV, (minV + maxV) / 2, maxV].map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12">{short(v, t.lang)}</text>
          </g>
        ))}
        <text x={L - 8} y={H - 6} textAnchor="end" fill="var(--text-muted)" fontSize="12">{unit}</text>
        {points.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
        {points.map((p, i) => (
          <g key={p.key} tabIndex={0} role="img" aria-label={`${p.label}: ${fmt(p.value)} ${unit}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <rect x={x(i) - Math.max(6, iw / points.length / 2)} y={T} width={Math.max(12, iw / points.length)} height={ih} fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 4} fill={hover === i ? color : 'var(--bg-panel)'} stroke={color} strokeWidth="2" />
            {(points.length <= 10 || i % Math.ceil(points.length / 10) === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="12">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="meta mono" style={{ minHeight: 18, textAlign: 'right' }} aria-live="polite">{cur ? `${cur.label} · ${fmt(cur.value)} ${unit}` : ''}</div>
      <figcaption className="chart-summary">{summary}</figcaption>
      <details className="data-table">
        <summary>{t('chart.table')}</summary>
        <table className="table"><thead><tr><th>{t('chart.date')}</th><th className="num">{unit}</th></tr></thead>
          <tbody>{points.map(p => <tr key={p.key}><td>{p.label}</td><td className="num">{fmt(p.value)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/* Horizontální bary pro srovnání tras a map v jedné metrice. */
export function HBars({ rows, unit, tone = 'var(--amber)' }: { rows: { key: string; label: ReactNode; value: number; note?: ReactNode }[]; unit: string; tone?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="stack-sm">
      {rows.map(r => (
        <div key={r.key} className="hbar">
          <div className="row between"><span className="wrap">{r.label}</span><span className="mono">{fmt(r.value)} <span className="muted">{unit}</span></span></div>
          <div className="progress" aria-hidden="true"><i style={{ width: (r.value / max * 100).toFixed(1) + '%', background: tone }} /></div>
          {r.note && <span className="meta">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}
