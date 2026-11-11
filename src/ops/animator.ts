/* Časování animací Opse podle manifestu (bez DOM): stav těla, proměna a jiskra. Jednorázové stavy se vrací
   na returnTo, proměna skryje výbavu a po dohrání přejde do klidu s jiskrou. */
import { OPS, type OpsAnim, type TransformSpec } from '../core/ops';

export interface Pose {
  anim: OpsAnim; frame: number;
  transform: { spec: TransformSpec; index: number } | null;
  sparkle: number | null;
}

export class Animator {
  anim: OpsAnim = 'idle';
  frame = 0;
  private t = 0;
  transform: { spec: TransformSpec; index: number; t: number } | null = null;
  sparkle: { index: number; t: number } | null = null;
  /* omezení pohybu: statický snímek, proměna hned, bez jiskry */
  reduced = false;
  private onEnd: (() => void) | null = null;

  play(anim: OpsAnim) { this.anim = anim; this.frame = 0; this.t = 0; }
  startTransform(id: string | null, done?: () => void) {
    const spec = id ? OPS.transforms.find(t => t.id === id) : undefined;
    if (!spec || this.reduced) { this.transform = null; this.play('idle'); done?.(); return; }
    this.onEnd = done ?? null;
    this.transform = { spec, index: 0, t: 0 };
  }
  startSparkle() { if (!this.reduced) this.sparkle = { index: 0, t: 0 }; }

  /* Posun o dt ms. Vrací true, když se změnil zobrazený snímek. */
  tick(dt: number): boolean {
    if (this.reduced) return false;
    dt = Math.min(Math.max(dt, 0), 250);
    let changed = false;
    const tr = this.transform;
    if (tr) {
      tr.t += dt;
      while (this.transform && tr.t >= tr.spec.durationsMs[tr.index]) {
        tr.t -= tr.spec.durationsMs[tr.index]; tr.index++; changed = true;
        if (tr.index >= tr.spec.frameCount) {
          this.transform = null; this.play('idle'); this.startSparkle();
          const cb = this.onEnd; this.onEnd = null; cb?.();
        }
      }
    } else {
      this.t += dt;
      let st = OPS.states[this.anim];
      while (this.t >= st.durationsMs[this.frame]) {
        this.t -= st.durationsMs[this.frame]; this.frame++; changed = true;
        if (this.frame >= st.frameCount) {
          if (st.loop) this.frame = 0;
          else { this.anim = (st.returnTo as OpsAnim) || 'idle'; this.frame = 0; st = OPS.states[this.anim]; }
        }
      }
    }
    const sp = this.sparkle;
    if (sp) {
      const fx = OPS.fx.sparkle;
      sp.t += dt;
      while (this.sparkle && sp.t >= fx.durationsMs[sp.index]) {
        sp.t -= fx.durationsMs[sp.index]; sp.index++; changed = true;
        if (sp.index >= fx.frameCount) this.sparkle = null;
      }
    }
    return changed;
  }

  pose(): Pose {
    return {
      anim: this.anim, frame: this.frame,
      transform: this.transform ? { spec: this.transform.spec, index: this.transform.index } : null,
      sparkle: this.sparkle ? this.sparkle.index : null,
    };
  }
}
