/* Okno buddyho Ops (milník 5): malé, bez rámečku, vždy navrchu, průhledné kolem postavičky. Kliknutí otevře nebo
   zavře overlay, tažení přesune okno (poloha se pamatuje pro každý monitor). Stav je jen kopie z hlavního okna;
   samo nic neukládá, polohu posílá hlavnímu oknu. Hlášky se ukážou v bublině, okno se kvůli ní dočasně zvětší. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { OpsCanvas, pixelFactor, type OpsHandle } from './OpsCanvas';
import { createBus } from './bus';
import { startHello } from './handshake';
import { createNative } from './native';
import { buddyWindow, clampTo, defaultSpot, monitorKey, type Rect } from './layout';
import type { BuddyStatus, BuddyView } from './hub';
import { FRAME } from './sprite';
import { formForLevel, partName, type LevelEvent } from '../core/ops';
import { isTauri } from '../storage/tauri';
import { msg, setLang, tm } from '../i18n';
import { useT } from '../i18n/react';

const bus = createBus('buddy');
const native = createNative();
const BUBBLE = { w: 232, h: 52 };
const BUBBLE_MS = 4200;
const SLEEP_MS = 10 * 60_000;

type Win = Awaited<ReturnType<typeof winApi>>;
const winApi = async () => {
  const m = await import('@tauri-apps/api/window');
  const d = await import('@tauri-apps/api/dpi');
  return { win: m.getCurrentWindow(), availableMonitors: m.availableMonitors, primaryMonitor: m.primaryMonitor, PhysicalSize: d.PhysicalSize, PhysicalPosition: d.PhysicalPosition };
};
type Mon = Awaited<ReturnType<Win['availableMonitors']>>[number];
const rectOf = (m: Mon): Rect => ({ x: m.position.x, y: m.position.y, w: m.size.width, h: m.size.height });

export default function BuddyApp() {
  const t = useT();
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
  const activity = useRef(Date.now());
  const gotView = useRef(false);
  /* jazyk pro hlášky v posluchači; posluchače se kvůli změně jazyka nemusí registrovat znovu */
  const lang = useRef(t.lang);
  lang.current = t.lang;

  const wake = useCallback(() => {
    activity.current = Date.now();
    if (ops.current?.anim() === 'sleeping') ops.current.play('idle');
  }, []);
  const say = useCallback((text: string) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  /* zprávy z hlavního okna */
  useEffect(() => {
    const offs = [
      bus.on('view', v => { const bv = v as BuddyView; gotView.current = true; setLang(bv.lang); setView(bv); }),
      bus.on('status', p => {
        const s = p as BuddyStatus;
        wake();
        ops.current?.play(s.anim);
        if (s.msg) say(tm(s.msg));
      }),
      bus.on('event', p => {
        const e = p as LevelEvent;
        wake();
        if (e.kind === 'transform') {
          ops.current?.transform(e.transform, () => say(tm(msg('ops.msg.form', { level: e.level, name: formForLevel(e.level).name[lang.current] }))));
        } else {
          ops.current?.sparkle();
          const text = e.parts.length === 1 ? tm(msg('ops.msg.level', { level: e.level, name: partName(e.parts[0], lang.current) })) : tm(msg('ops.msg.levelMany', { level: e.level, count: e.parts.length }));
          say(text);
        }
      }),
    ];
    /* pozdrav až po registraci posluchačů a opakovaně, dokud nepřijde první view (0.8.0) */
    const stopHello = startHello(bus, 'buddy', () => gotView.current);
    const sleep = setInterval(() => {
      if (Date.now() - activity.current > SLEEP_MS && ops.current?.anim() === 'idle') ops.current.play('sleeping');
    }, 30_000);
    return () => { stopHello(); offs.forEach(f => f()); clearInterval(sleep); };
  }, [say, wake]);

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
      await a.win.setSize(new a.PhysicalSize(L.win.w, L.win.h));
      await a.win.setPosition(new a.PhysicalPosition(L.win.x, L.win.y));
      const dpr = window.devicePixelRatio || 1;
      setOpsAt({ x: L.ops.x / dpr, y: L.ops.y / dpr, below: L.below, right: L.right });
      if (!shown.current) { shown.current = true; await a.win.show(); }
    })();
    return () => { dead = true; };
  }, [view, scale, bubble]);

  /* přesun tažením: konec tažení = chvíli bez pohybu; poloha se uloží vůči monitoru */
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
          if (ops.current?.anim() === 'drag') ops.current.play('idle');
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

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    wake();
    drag.current = { x: e.screenX, y: e.screenY, moving: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.moving || !(e.buttons & 1)) return;
    if (Math.abs(e.screenX - d.x) + Math.abs(e.screenY - d.y) < 4) return;
    d.moving = true;
    setBubble(null);
    ops.current?.play('drag');
    void api.current?.win.startDragging();
    /* tažení bez pohybu okna: po chvíli zpět do klidu */
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => { if (drag.current === d) { drag.current = null; if (ops.current?.anim() === 'drag') ops.current.play('idle'); } }, 1500);
  };
  const onUp = () => {
    const d = drag.current;
    /* tažení končí až chvíli bez pohybu okna (časovač v onMoved) */
    if (d?.moving) return;
    drag.current = null;
    if (d) void native.overlayToggle();
  };

  if (!view) return null;
  return (
    <div className="buddy" onContextMenu={e => e.preventDefault()}>
      {bubble && <div className={'buddy-bubble' + (opsAt.below ? ' below' : '') + (opsAt.right ? ' right' : '')} role="status" data-testid="buddy-bubble">{bubble}</div>}
      <div className="buddy-ops" style={{ left: opsAt.x, top: opsAt.y }} role="button" tabIndex={0} aria-label={t('ops.buddyAria')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerEnter={wake}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void native.overlayToggle(); } }}>
        <OpsCanvas ref={ops} level={view.level} outfit={view.outfit} scale={view.scale} label="Ops" />
      </div>
    </div>
  );
}
