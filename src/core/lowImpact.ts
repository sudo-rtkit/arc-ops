/* 0.23.0: režim nízké zátěže (Nastavení → Zátěž aplikace, výchozí vypnuto, patří tomuto počítači). Když je zapnutý
   a hra je vidět v popředí, aplikace šetří: widgety se obnovují méně často, animace Opse a tiché emoce automatického
   snímku stojí a rádce „Co dál?“ se přepočítává nejvýš jednou za ADVISOR_MS. Mimo hru vše běží jako dřív.
   Čisté funkce; o hře v popředí ví hub (událost game-visible z hlídací smyčky). */

/* Odstup odeslání stavu oknu widgetů (normálně 3× krok hubu, tj. 360 ms) a kontrola polohy okna widgetů. */
export const WIDGET_PUSH_LOW_MS = 2000;
export const WIDGET_FIT_MS = 3000;
export const WIDGET_FIT_LOW_MS = 10_000;
/* Nejkratší odstup dvou přepočtů rádce během hry v režimu nízké zátěže. */
export const ADVISOR_MS = 60_000;

/* Šetří se právě teď? Jen se zapnutým režimem a hrou v popředí. */
export const calmNow = (lowImpact: boolean, gameFront: boolean): boolean => lowImpact && gameFront;

/* Odstup odeslání stavu oknu widgetů. */
export const widgetPushMs = (baseMs: number, calm: boolean): number => (calm ? Math.max(baseMs * 3, WIDGET_PUSH_LOW_MS) : baseMs * 3);
/* Interval kontroly umístění okna widgetů (nová velikost monitoru, DPI). */
export const widgetFitMs = (calm: boolean): number => (calm ? WIDGET_FIT_LOW_MS : WIDGET_FIT_MS);

/* Přepočítat rádce? Bez šetření vždy (každá změna stavu); při šetření jen poprvé a pak nejdřív po ADVISOR_MS. */
export function advisorDue(lastAt: number | null, now: number, calm: boolean): boolean {
  return !calm || lastAt === null || now - lastAt >= ADVISOR_MS || now < lastAt;
}

/* Kolikrát za sekundu se okno widgetů obnovuje (pro panel Zátěž aplikace): nejvýš jedno odeslání stavu za odstup. */
export const widgetRefreshHz = (pushMs: number): number => (pushMs > 0 ? Math.round((1000 / pushMs) * 10) / 10 : 0);

/* Podíl CPU vlastního procesu mezi dvěma vzorky: čas CPU (µs) / (čas na hodinách × počet jader), v procentech. */
export function cpuPercent(prev: { cpuUs: number; at: number } | null, next: { cpuUs: number; at: number }, cpus: number): number | null {
  if (!prev || next.at <= prev.at || next.cpuUs < prev.cpuUs) return null;
  const wallUs = (next.at - prev.at) * 1000;
  const pct = ((next.cpuUs - prev.cpuUs) / (wallUs * Math.max(1, cpus))) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}
