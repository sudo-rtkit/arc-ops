/* Ops na plátně: skládá se v nativní mřížce varianty (CORNER 96 px, DETAIL 128 px) a zobrazí se celým násobkem
   fyzických pixelů, takže pixely zůstanou ostré. 256 px detail = 128 px kompozice zvětšená přesně 2×.
   - fit=false (okno buddyho): k = měřítko × zaokrouhlené DPI (okno má přesně tuto fyzickou velikost),
   - fit=true (vložené do stránky): k = dolní celá část z měřítko × DPI, aby Ops nebyl větší než návrh.
   Animace podle manifestu; při omezení pohybu je Ops statický. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Animator, type RestAnim } from './animator';
import { drawOps, frameOf, preload } from './sprite';
import type { OpsAnim, OpsVariantId } from '../core/ops';
import type { AutoEmote } from '../core/opsEmote';

export interface OpsHandle {
  play(anim: OpsAnim, opts?: { once?: boolean }): void;
  /* po právě běžícím jednorázovém stavu */
  then(anim: OpsAnim): void;
  rest(rest: RestAnim): void;
  transform(id: string | null, done?: () => void): void;
  sparkle(): void;
  /* 0.20.1: tichá emoce automatického snímku (false = zahozena podle pravidel) */
  emote(anim: AutoEmote): boolean;
  anim(): OpsAnim;
  hidden(): boolean;
}

export const pixelFactor = (scale: number, dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, fit = false): number =>
  fit ? Math.max(1, Math.floor(Math.max(1, Math.round(scale)) * dpr + 1e-6)) : Math.max(1, Math.round(scale)) * Math.max(1, Math.round(dpr));

interface Props {
  variant?: OpsVariantId;
  level: number;
  form?: string;
  outfit: Record<string, string | null>;
  /* celý násobek mřížky varianty v logických pixelech */
  scale: number;
  fit?: boolean;
  label: string;
  className?: string;
  /* výchozí stav při startu */
  initial?: OpsAnim;
  /* klidový stav (idle, nebo talk během bubliny) */
  restAnim?: RestAnim;
  still?: boolean;
  /* 0.23.0: režim nízké zátěže při hře v popředí: animace stojí (poslední snímek zůstane) */
  paused?: boolean;
  /* 0.11.0: nátěr (paleta) Opse; bez něj původní vzhled */
  paint?: string;
}

export const OpsCanvas = forwardRef<OpsHandle, Props>(function OpsCanvas({ variant = 'corner', level, outfit, scale, fit = false, label, className, initial = 'idle', restAnim = 'idle', still, paint, paused, form }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef(new Animator());
  const view = useRef({ level, outfit, variant, paint, form });
  view.current = { level, outfit, variant, paint, form };
  const dirty = useRef(true);
  const pausedRef = useRef(!!paused);
  pausedRef.current = !!paused;

  useImperativeHandle(ref, () => ({
    play: (a, o) => { anim.current.play(a, o); dirty.current = true; },
    then: a => { anim.current.then(a); dirty.current = true; },
    rest: r => { anim.current.setRest(r); dirty.current = true; },
    transform: (id, done) => { anim.current.startTransform(id, done); dirty.current = true; },
    sparkle: () => { anim.current.startSparkle(); dirty.current = true; },
    emote: a => { const ok = anim.current.emote(a); if (ok) dirty.current = true; return ok; },
    anim: () => anim.current.anim,
    hidden: () => anim.current.hidden(),
  }), []);

  useEffect(() => { anim.current.play(initial); dirty.current = true; }, [initial]);
  useEffect(() => { anim.current.setRest(restAnim); dirty.current = true; }, [restAnim]);
  useEffect(() => { if (anim.current.transform) anim.current.startTransform(null); dirty.current = true; }, [form]);
  useEffect(() => { dirty.current = true; void preload(variant, level, outfit, form).then(() => { dirty.current = true; }); }, [variant, level, outfit, paint, form]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const F = frameOf(variant);
    const off = document.createElement('canvas');
    off.width = off.height = F;
    const octx = off.getContext('2d');
    const ctx = c.getContext('2d');
    if (!octx || !ctx) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0, last = 0, k = 0;
    const loop = (ts: number) => {
      const a = anim.current;
      a.reduced = !!still || !!mq?.matches;
      if (last && !pausedRef.current && a.tick(ts - last)) dirty.current = true;
      last = ts;
      const nk = pixelFactor(scale, window.devicePixelRatio || 1, fit);
      if (nk !== k) {
        k = nk;
        c.width = c.height = F * k;
        const css = (F * k) / (window.devicePixelRatio || 1);
        c.style.width = c.style.height = css + 'px';
        dirty.current = true;
      }
      if (dirty.current) {
        dirty.current = false;
        drawOps(octx, view.current.variant, view.current.level, view.current.outfit, a.pose(), view.current.paint, view.current.form);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(off, 0, 0, c.width, c.height);
        c.dataset.anim = a.transform ? 'transform' : a.anim;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scale, still, variant, fit]);

  return <canvas ref={canvas} className={className} role="img" aria-label={label} data-testid="ops-canvas" data-form={form || 'auto'} data-variant={variant} data-paint={paint || 'original'} />;
});
