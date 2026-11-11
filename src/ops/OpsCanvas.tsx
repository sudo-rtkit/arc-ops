/* Ops na plátně: skládá se v 64 × 64 a zobrazí se celým násobkem fyzických pixelů (k = měřítko × zaokrouhlené
   DPI), takže pixely zůstanou ostré. Animace podle manifestu; při omezení pohybu je Ops statický. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Animator } from './animator';
import { FRAME, drawOps, preload } from './sprite';
import type { OpsAnim } from '../core/ops';

export interface OpsHandle {
  play(anim: OpsAnim): void;
  transform(id: string | null, done?: () => void): void;
  sparkle(): void;
  anim(): OpsAnim;
}

export const pixelFactor = (scale: number, dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1): number =>
  Math.max(1, Math.round(scale)) * Math.max(1, Math.round(dpr));

interface Props {
  level: number;
  outfit: Record<string, string | null>;
  /* celý násobek mřížky 64 px v logických pixelech */
  scale: number;
  label: string;
  className?: string;
  /* výchozí stav při startu */
  initial?: OpsAnim;
  still?: boolean;
}

export const OpsCanvas = forwardRef<OpsHandle, Props>(function OpsCanvas({ level, outfit, scale, label, className, initial = 'idle', still }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef(new Animator());
  const view = useRef({ level, outfit });
  view.current = { level, outfit };
  const dirty = useRef(true);

  useImperativeHandle(ref, () => ({
    play: a => { anim.current.play(a); dirty.current = true; },
    transform: (id, done) => { anim.current.startTransform(id, done); dirty.current = true; },
    sparkle: () => { anim.current.startSparkle(); dirty.current = true; },
    anim: () => anim.current.anim,
  }), []);

  useEffect(() => { anim.current.play(initial); }, [initial]);
  useEffect(() => { dirty.current = true; void preload(level, outfit).then(() => { dirty.current = true; }); }, [level, outfit]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const off = document.createElement('canvas');
    off.width = off.height = FRAME;
    const octx = off.getContext('2d');
    const ctx = c.getContext('2d');
    if (!octx || !ctx) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0, last = 0, k = 0;
    const loop = (ts: number) => {
      const a = anim.current;
      a.reduced = !!still || !!mq?.matches;
      if (last && a.tick(ts - last)) dirty.current = true;
      last = ts;
      const nk = pixelFactor(scale);
      if (nk !== k) {
        k = nk;
        c.width = c.height = FRAME * k;
        const css = (FRAME * k) / (window.devicePixelRatio || 1);
        c.style.width = c.style.height = css + 'px';
        dirty.current = true;
      }
      if (dirty.current) {
        dirty.current = false;
        drawOps(octx, view.current.level, view.current.outfit, a.pose());
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(off, 0, 0, c.width, c.height);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scale, still]);

  return <canvas ref={canvas} className={className} role="img" aria-label={label} data-testid="ops-canvas" />;
});
