/* Okno buddyho Ops / Bedňák 2.0 (milník 5, 0.10.0): malé, bez rámečku, vždy navrchu, průhledné kolem postavičky
   (varianta CORNER 96 px). Kliknutí otevře nebo zavře overlay, tažení přesune okno (poloha se pamatuje pro každý
   monitor). Stav je jen kopie z hlavního okna; samo nic neukládá, polohu posílá hlavnímu oknu.
   - Animace podle událostí: příchod a pozdrav při otevření, odchod před zavřením, sken, přemýšlení při čtení,
     nesení při zápisu, úspěch, chyba, level-up s proměnou a jiskrou, spánek bez aktivity, probuzení, tažení a krok.
   - Hlášky v bublině podle povahy (varianty se střídají). Odpověď na akci hráče (výsledek snímku) se ukáže vždy;
     nevyžádané hlášky (level, pozdrav) jen se zapnutými dialogy a když hráč s Opsem právě pracuje.
   - Zvuky hraje jen to okno, které hráč používá: buddy jen krátce po kliknutí na něj (jinak hlavní okno nebo overlay). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { OpsCanvas, pixelFactor, type OpsHandle } from './OpsCanvas';
import { createBus } from './bus';
import { startHello } from './handshake';
import { createNative } from './native';
import { buddyWindow, clampTo, defaultSpot, monitorKey, type Rect } from './layout';
import type { BuddyLevelEvent, BuddyStatus, BuddyView, UiActivity } from './hub';
import { frameOf } from './sprite';
import { createSoundPlayer } from './sound';
import { formForLevel, partName, sleepAfterMs, type OpsAnim } from '../core/ops';
import { BUDDY_TOUCH_MS, type SoundId } from '../core/opsSound';
import { bubbleMs, createMemo, line, lineGesture, sayLine, type LineRef } from '../core/opsVoice';
import { isTauri } from '../storage/tauri';
import { setLang } from '../i18n/core';
import { useLang } from '../i18n/react';
import { BUDDY_TEXT } from '../i18n/buddyText';

const bus = createBus('buddy');
const native = createNative();
const FRAME = frameOf('corner');
export const BUBBLE = { w: 260, h: 76 };
/* nekonečné smyčky stavu (sken, přemýšlení, nesení) bez další zprávy skončí nejpozději po této době */
const LOOP_MAX_MS = 20_000;
const LOOPS: OpsAnim[] = ['scanning', 'thinking', 'carry'];
/* pozdrav jen při prvním otevření v této relaci okna */
let greeted = false;

type Win = Awaited<ReturnType<typeof winApi>>;
const winApi = async () => {
  const m = await import('@tauri-apps/api/window');
  /* 0.16.1: velikost, poloha a tažení jen přes native.place a native.drag (Rust mění jen toto okno) */
  return { win: m.getCurrentWindow(), availableMonitors: m.availableMonitors, primaryMonitor: m.primaryMonitor };
};
type Mon = Awaited<ReturnType<Win['availableMonitors']>>[number];
const rectOf = (m: Mon): Rect => ({ x: m.position.x, y: m.position.y, w: m.size.width, h: m.size.height });

export default function BuddyApp() {
  const uiLang = useLang();
  const [view, setView] = useState<BuddyView | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [opsAt, setOpsAt] = useState({ x: 0, y: 0, below: false, right: false });
  const ops = useRef<OpsHandle>(null);
  const api = useRef<Win | null>(null);
  const placed = useRef<{ x: number; y: number } | null>(null);
  const mon = useRef<Mon | null>(null);
  const expected = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; moving: boolean } | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activity = useRef(Date.now());
  const touchAt = useRef(0);
  const clicks = useRef<number[]>([]);
  const ui = useRef<UiActivity>({ overlayOpen: false, appFocused: false });
  const gotView = useRef(false);
  const memo = useRef(createMemo());
  /* aktuální nastavení pro posluchače (ti se kvůli změně nemusí registrovat znovu) */
  const cur = useRef<BuddyView | null>(null);
  cur.current = view;
  const sound = useRef(createSoundPlayer(() => ({
    on: cur.current?.sound ?? false, volume: cur.current?.volume ?? 0,
    /* overlay a hlavní okno hrají samy; buddy jen po vlastním kliknutí */
    overlayOpen: false, appFocused: false, buddyTouchAt: touchAt.current, gameForeground: false,
  })));

  const touching = () => Date.now() - touchAt.current <= BUDDY_TOUCH_MS;
  const inUse = () => ui.current.overlayOpen || ui.current.appFocused || touching();
  const playSound = useCallback((id: SoundId | null) => {
    /* když hráč používá hlavní okno nebo overlay, zvuk hraje to okno */
    if (!id || ui.current.appFocused || ui.current.overlayOpen) return;
    sound.current.play(id);
  }, []);

  const act = useCallback((anim: OpsAnim, opts?: { once?: boolean }) => {
    const o = ops.current;
    if (!o) return;
    if (loopTimer.current) { clearTimeout(loopTimer.current); loopTimer.current = null; }
    if (o.anim() === 'sleep') { o.play('wake-up'); o.then(anim); }
    else o.play(anim, opts);
    if (LOOPS.includes(anim)) loopTimer.current = setTimeout(() => { if (ops.current && LOOPS.includes(ops.current.anim())) ops.current.play('idle'); }, LOOP_MAX_MS);
  }, []);

  const wake = useCallback((withLine = false) => {
    activity.current = Date.now();
    const o = ops.current;
    if (o?.anim() === 'sleep') {
      o.play('wake-up');
      if (withLine && cur.current?.dialogs) showLine(line('wake'), false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hideBubble = useCallback(() => {
    setBubble(null);
    const o = ops.current;
    if (!o) return;
    o.rest('idle');
    if (['thinking', 'talk'].includes(o.anim())) o.play('idle');
  }, []);
  const say = useCallback((text: string, beep: boolean) => {
    setBubble(text);
    ops.current?.rest('talk');
    if (beep) playSound('beep');
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(hideBubble, bubbleMs(text));
  }, [hideBubble, playSound]);
  /* Hláška podle povahy; nevyžádaná jen se zapnutými dialogy a když hráč s Opsem pracuje. */
  const showLine = useCallback((l: LineRef, solicited: boolean, beep = true): boolean => {
    const v = cur.current;
    if (!v) return false;
    if (!solicited && (!v.dialogs || !inUse())) return false;
    say(sayLine(l, v.personality, v.lang, memo.current), beep);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  /* zprávy z hlavního okna */
  useEffect(() => {
    const offs = [
      bus.on('view', v => { const bv = v as BuddyView; gotView.current = true; setLang(bv.lang); setView(bv); }),
      bus.on('ui', p => { if (p && typeof p === 'object') ui.current = p as UiActivity; }),
      bus.on('status', p => {
        const s = p as BuddyStatus;
        if (s.ui) ui.current = s.ui;
        if (s.anim === 'dismiss') { hideBubble(); ops.current?.play('dismiss'); return; }
        activity.current = Date.now();
        if (s.anim !== 'talk') act(s.anim);
        else if (ops.current?.anim() === 'sleep') ops.current.play('wake-up');
        if (s.sound && s.sound !== 'beep') playSound(s.sound);
        if (s.line) showLine(s.line, s.solicited, s.sound === 'beep' || !s.sound);
      }),
      bus.on('event', p => {
        const e = p as BuddyLevelEvent;
        if (e.ui) ui.current = e.ui;
        wake();
        const v = cur.current, lang = v?.lang ?? 'cs';
        playSound('levelup');
        if (e.kind === 'transform') {
          ops.current?.transform(e.transform, () => showLine(line('level.form', { level: e.level, name: formForLevel(e.level).name[lang] }), false, false));
        } else {
          act('level-up');
          ops.current?.sparkle();
          showLine(e.parts.length === 1 ? line('level.part', { level: e.level, name: partName(e.parts[0], lang) }) : line('level.parts', { level: e.level, count: e.parts.length }), false, false);
        }
      }),
    ];
    /* pozdrav až po registraci posluchačů a opakovaně, dokud nepřijde první view (0.8.0) */
    const stopHello = startHello(bus, 'buddy', () => gotView.current);
    const sleep = setInterval(() => {
      const o = ops.current;
      if (!o || o.anim() !== 'idle') return;
      if (Date.now() - activity.current > sleepAfterMs(cur.current?.game ?? null)) { o.rest('idle'); o.play('sleep'); }
    }, 15_000);
    return () => { stopHello(); offs.forEach(f => f()); clearInterval(sleep); };
  }, [act, hideBubble, playSound, showLine, wake]);

  /* velikost a poloha okna (fyzické pixely) */
  const scale = view?.scale ?? 1;
  useEffect(() => {
    if (!view || !isTauri()) return;
    let dead = false;
    void (async () => {
      const a = (api.current ??= await winApi());
      const k = pixelFactor(scale), size = FRAME * k;
      if (!placed.current || !mon.current) {
        const list = await a.availableMonitors();
        const m = list.find(x => monitorKey(x) === view.monitor) ?? (await a.primaryMonitor()) ?? list[0];
        if (!m) return;
        mon.current = m;
        const rel = view.positions[monitorKey(m)];
        const work = m.workArea ? { x: m.workArea.position.x, y: m.workArea.position.y, w: m.workArea.size.width, h: m.workArea.size.height } : rectOf(m);
        placed.current = clampTo(rel ? { x: m.position.x + rel.x, y: m.position.y + rel.y } : defaultSpot(size, work, m.scaleFactor), size, rectOf(m));
      }
      const m = mon.current, sf = m.scaleFactor || 1;
      placed.current = clampTo(placed.current, size, rectOf(m));
      const L = buddyWindow(placed.current, size, rectOf(m), bubble ? { w: Math.round(BUBBLE.w * sf), h: Math.round(BUBBLE.h * sf) } : null);
      if (dead) return;
      offset.current = L.ops;
      expected.current = { x: L.win.x, y: L.win.y };
      await native.place(L.win);
      const dpr = window.devicePixelRatio || 1;
      setOpsAt({ x: L.ops.x / dpr, y: L.ops.y / dpr, below: L.below, right: L.right });
      /* bez aktivace (0.13.1); win.show() by oknu vzalo fokus */
      if (!shown.current) { shown.current = true; await native.buddyReveal().catch(() => undefined); }
    })();
    return () => { dead = true; };
  }, [view, scale, bubble]);

  /* příchod při otevření okna, poprvé v relaci s pozdravem */
  const arrived = useRef(false);
  useEffect(() => {
    if (!view || arrived.current) return;
    arrived.current = true;
    const o = ops.current;
    if (!o) return;
    /* příchod hraje plátno od startu (initial), pozdrav naváže */
    if (!greeted) { greeted = true; o.then('greet'); setTimeout(() => showLine(line('greet'), false), 900); }
  }, [view, showLine]);

  /* přesun tažením: konec tažení = chvíli bez pohybu; poloha se uloží vůči monitoru, pak krok */
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | null = null;
    void (async () => {
      const a = (api.current ??= await winApi());
      off = await a.win.onMoved(({ payload: p }) => {
        /* Za přesun hráčem se počítá jen pohyb během tažení myší (ne počáteční poloha okna ani vlastní rozvržení). */
        if (!drag.current?.moving) return;
        const e = expected.current;
        if (e && Math.abs(e.x - p.x) <= 1 && Math.abs(e.y - p.y) <= 1) return;
        expected.current = null;
        placed.current = { x: p.x + offset.current.x, y: p.y + offset.current.y };
        if (moveTimer.current) clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(async () => {
          drag.current = null;
          if (ops.current?.anim() === 'drag') ops.current.play('walk', { once: true });
          const list = await a.availableMonitors();
          const size = FRAME * pixelFactor(scale), c = { x: placed.current!.x + size / 2, y: placed.current!.y + size / 2 };
          const m = list.find(x => c.x >= x.position.x && c.x < x.position.x + x.size.width && c.y >= x.position.y && c.y < x.position.y + x.size.height) ?? mon.current;
          if (!m) return;
          mon.current = m;
          bus.send('main', 'moved', { monitor: monitorKey(m), x: placed.current!.x - m.position.x, y: placed.current!.y - m.position.y });
        }, 450);
      });
    })();
    return () => { off?.(); };
  }, [scale]);

  const toggle = () => {
    const v = cur.current;
    /* rychlé opakované klikání: Ops si postěžuje podle povahy (overlay se dál přepíná) */
    const now = Date.now();
    clicks.current = [...clicks.current.filter(x => now - x < 2500), now];
    if (clicks.current.length >= 4 && v) {
      clicks.current = [];
      const g = lineGesture('poke', v.personality);
      if (g) act(g);
      showLine(line('poke'), true);
    }
    sound.current.play(ui.current.overlayOpen ? 'close' : 'open');
    void native.overlayToggle();
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    touchAt.current = Date.now();
    wake(true);
    drag.current = { x: e.screenX, y: e.screenY, moving: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.moving || !(e.buttons & 1)) return;
    if (Math.abs(e.screenX - d.x) + Math.abs(e.screenY - d.y) < 4) return;
    d.moving = true;
    touchAt.current = Date.now();
    setBubble(null);
    ops.current?.rest('idle');
    ops.current?.play('drag');
    void native.drag().catch(() => undefined);
    /* tažení bez pohybu okna: po chvíli zpět do klidu */
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => { if (drag.current === d) { drag.current = null; if (ops.current?.anim() === 'drag') ops.current.play('idle'); } }, 1500);
  };
  const onUp = () => {
    const d = drag.current;
    /* tažení končí až chvíli bez pohybu okna (časovač v onMoved) */
    if (d?.moving) return;
    drag.current = null;
    if (d) toggle();
  };

  if (!view) return null;
  return (
    <div className="buddy" onContextMenu={e => e.preventDefault()}>
      {bubble && <div className={'buddy-bubble' + (opsAt.below ? ' below' : '') + (opsAt.right ? ' right' : '')} role="status" data-testid="buddy-bubble">{bubble}</div>}
      <div className="buddy-ops" style={{ left: opsAt.x, top: opsAt.y }} role="button" tabIndex={0} aria-label={BUDDY_TEXT[uiLang].aria}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerEnter={() => wake()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touchAt.current = Date.now(); toggle(); } }}>
        <OpsCanvas ref={ops} variant="corner" level={view.level} outfit={view.outfit} paint={view.paint} scale={view.scale} label="Ops" initial="appear" />
        {/* 0.20.0: malá tečka, když běží (nebo je pozastavené) automatické snímání */}
        {view.auto && <span className={'buddy-auto auto-' + view.auto} role="img" aria-label={view.auto === 'on' ? BUDDY_TEXT[uiLang].autoOn : BUDDY_TEXT[uiLang].autoPaused} title={view.auto === 'on' ? BUDDY_TEXT[uiLang].autoOn : BUDDY_TEXT[uiLang].autoPaused} data-testid="buddy-auto" />}
      </div>
    </div>
  );
}
