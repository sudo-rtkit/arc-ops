/* 0.23.0: Nastavení → „Zátěž aplikace“. Měří jen vlastní proces aplikace (Rust app_load: GetCurrentProcess,
   GetProcessTimes, GetProcessMemoryInfo; nic jiného se neotevírá ani nečte), asi každé 2 s a jen dokud je panel
   zobrazený a okno viditelné. Dál ukazuje měření automatického snímání (ops_autostats), počet oken widgetů a jak
   často se obnovují, a přepínač režimu nízké zátěže. Vliv na FPS hry se změřit nedá, aniž by aplikace sahala do hry;
   panel místo toho popisuje ruční postup. */
import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { actions, useAppState } from '../store';
import { Badge, Panel } from '../ui/components';
import { useT } from '../i18n/react';
import { hub, native } from '../ops/mainHub';
import type { AutoStats, OwnLoad } from '../ops/native';
import type { PerfInfo } from '../ops/hub';
import { cpuPercent, widgetRefreshHz } from '../core/lowImpact';

export const SAMPLE_MS = 2000;
const mb = (b: number) => (b / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/* Paměť JavaScriptu tohoto okna (jen Chromium / WebView2; jinde není). */
const jsHeap = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return m && typeof m.usedJSHeapSize === 'number' ? m.usedJSHeapSize : null;
};

export function AppLoadPanel() {
  const t = useT();
  const s = useAppState();
  const low = s.opsPrefs.lowImpact;
  const [load, setLoad] = useState<OwnLoad | null>(null);
  const [cpu, setCpu] = useState<number | null>(null);
  const [auto, setAuto] = useState<AutoStats | null>(null);
  const [perf, setPerf] = useState<PerfInfo>(() => hub.perfInfo());
  const [heap, setHeap] = useState<number | null>(() => jsHeap());
  const prev = useRef<{ cpuUs: number; at: number } | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => {
      setPerf(hub.perfInfo());
      setHeap(jsHeap());
      if (!native.available || document.visibilityState !== 'visible') return;
      void native.appLoad?.().then(x => {
        if (!live || !x) return;
        const at = performance.now(), next = { cpuUs: x.cpuUs, at };
        setCpu(cpuPercent(prev.current, next, x.cpus));
        prev.current = next;
        setLoad(x);
      }, () => undefined);
      void native.autoStats().then(x => { if (live) setAuto(x); }, () => undefined);
    };
    tick();
    const h = setInterval(tick, SAMPLE_MS);
    return () => { live = false; clearInterval(h); };
  }, []);
  const ms = (us: number) => (us / 1000).toFixed(1);
  return (
    <Panel title={t('perf.title')} actions={<Gauge size={16} aria-hidden="true" />}>
      <div className="stack-sm" data-testid="perf-panel">
        <p className="secondary-text">{t('perf.intro')}</p>
        {!native.available ? <p className="meta" data-testid="perf-na">{t('perf.na')}</p> : (
          <dl className="dl" data-testid="perf-process">
            <dt>{t('perf.cpu')}</dt><dd className="mono" data-testid="perf-cpu">{cpu === null ? t('perf.measuring') : `${cpu.toLocaleString(undefined, { maximumFractionDigits: 1 })} %`}</dd>
            <dt>{t('perf.ram')}</dt><dd className="mono" data-testid="perf-ram">{load ? `${mb(load.workingSet)} MB` : t('perf.measuring')}</dd>
            <dt>{t('perf.private')}</dt><dd className="mono">{load ? `${mb(load.privateBytes)} MB` : t('perf.measuring')}</dd>
            <dt>{t('perf.peak')}</dt><dd className="mono">{load ? `${mb(load.peakWorkingSet)} MB` : t('perf.measuring')}</dd>
          </dl>
        )}
        <p className="meta">{t('perf.webview')}{heap !== null && <> {t('perf.jsHeap', { mb: mb(heap) })}</>}</p>
        <dl className="dl">
          <dt>{t('perf.auto')}</dt>
          <dd className="mono" data-testid="perf-auto">{auto && auto.ticks ? t('auto.stats', { ticks: auto.ticks, avg: ms(auto.totalUs / auto.ticks), max: ms(auto.maxUs), kb: Math.round(auto.stripBytes / 1024), captures: auto.captures }) : t('perf.autoNone')}</dd>
          <dt>{t('perf.widgets')}</dt>
          <dd className="mono" data-testid="perf-widgets">{t('perf.widgetsVal', { count: perf.widgetWindows, hz: perf.widgetWindows ? widgetRefreshHz(perf.widgetPushMs) : 0, ms: perf.widgetPushMs })}</dd>
        </dl>
        <label className="toggle"><input type="checkbox" data-testid="perf-low" checked={low} onChange={e => actions.setLowImpact(e.target.checked)} />{t('perf.low')}</label>
        <p className="meta">{t('perf.lowNote')}</p>
        {low && <p data-testid="perf-low-state"><Badge tone={perf.calm ? 'success' : undefined}>{t(perf.calm ? 'perf.lowOn' : 'perf.lowWait')}</Badge></p>}
        <div className="stack-sm" data-testid="perf-fps">
          <b>{t('perf.fpsTitle')}</b>
          <p className="meta">{t('perf.fps')}</p>
        </div>
      </div>
    </Panel>
  );
}
