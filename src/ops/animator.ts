/* Časování animací Opse / Bedňáka 2.0 podle manifestu (bez DOM): stav těla, proměna a jiskra.
   - Jednorázový stav se po dohrání vrátí na další stav ve frontě, jinak na klidový stav (rest): běžně idle,
     během bubliny talk. returnTo:null (dismiss) zůstane na posledním (prázdném) snímku do dalšího příkazu.
   - Smyčky (talk, scanning, thinking, carry, drag, walk, sleep) ukončí až příslušná interakce; play(…, { once })
     přehraje smyčku jen jednou (např. walk po přesunu).
   - Proměna skryje tělo i šatník, po dohrání přejde do level-up s jiskrou. Při omezení pohybu se nic nepřehrává:
     zobrazí se rovnou cílová viditelnost (idle, nebo prázdný snímek po odchodu).
   - 0.20.1: emote() = malé emoce automatického snímku (scan, scan-ok, scan-unsure) s nízkou prioritou podle
     emoteAllowed (src/core/opsEmote.ts); po dohrání zpět do klidu od snímku 0. */
import { OPS, type OpsAnim, type TransformSpec } from '../core/ops';
import { emoteAllowed, type AutoEmote } from '../core/opsEmote';

export interface Pose {
  anim: OpsAnim; frame: number;
  transform: { spec: TransformSpec; index: number } | null;
  sparkle: number | null;
}

/* Klidové stavy, na které se vrací jednorázové animace. */
export type RestAnim = 'idle' | 'talk' | 'sleep';

export class Animator {
  anim: OpsAnim = 'idle';
  frame = 0;
  private t = 0;
  private once = false;
  /* dismiss dohrál: drží poslední (prázdný) snímek */
  private holding = false;
  /* čekající jednorázové stavy (např. probuzení, pak výsledek) */
  queue: OpsAnim[] = [];
  rest: RestAnim = 'idle';
  transform: { spec: TransformSpec; index: number; t: number } | null = null;
  sparkle: { index: number; t: number } | null = null;
  /* omezení pohybu: statický snímek, proměna hned, bez jiskry */
  reduced = false;
  private onEnd: (() => void) | null = null;

  play(anim: OpsAnim, opts: { once?: boolean } = {}) {
    this.anim = anim; this.frame = 0; this.t = 0; this.once = !!opts.once; this.holding = false;
    /* při omezení pohybu odchod rovnou skončí na prázdném snímku, ostatní stavy ukážou první snímek */
    if (this.reduced && anim === 'dismiss') { this.frame = OPS.states.dismiss.frameCount - 1; this.holding = true; }
    else if (this.reduced && !OPS.states[anim].loop) { this.anim = this.rest; this.queue = []; }
  }
  /* Přehraje stav po právě běžícím jednorázovém stavu (smyčku nebo klid přeruší hned). */
  then(anim: OpsAnim) {
    const st = OPS.states[this.anim];
    if (!this.transform && (st.loop || this.anim === 'idle' || this.hidden())) { this.play(anim); return; }
    this.queue.push(anim);
  }
  /* Klidový stav; když právě běží klid nebo jiná klidová smyčka, přepne se hned. */
  setRest(rest: RestAnim) {
    this.rest = rest;
    if (this.transform) return;
    if (this.anim === 'idle' || this.anim === 'talk' || this.anim === 'sleep') { if (this.anim !== rest) this.play(rest); }
  }
  /* 0.20.1: emoce automatického snímku; vrací false, když se zahodila (spánek, tažení, gesto, skrytý…). */
  emote(anim: AutoEmote): boolean {
    if (!emoteAllowed(anim, { anim: this.anim, transform: !!this.transform, hidden: this.holding, queued: this.queue.length > 0, reduced: this.reduced })) return false;
    this.play(anim);
    return true;
  }
  /* Je Ops po odchodu skrytý (dismiss na posledním snímku)? */
  hidden(): boolean { return this.holding; }

  startTransform(id: string | null, done?: () => void) {
    const spec = id ? OPS.transforms.find(t => t.id === id) : undefined;
    this.queue = [];
    if (!spec || this.reduced) { this.transform = null; this.play(this.reduced ? this.rest : 'level-up'); if (!this.reduced) this.startSparkle(); done?.(); return; }
    this.onEnd = done ?? null;
    this.transform = { spec, index: 0, t: 0 };
  }
  startSparkle() { if (!this.reduced) this.sparkle = { index: 0, t: 0 }; }

  private next() {
    const q = this.queue.shift();
    if (q) { this.play(q); return; }
    const ret = OPS.states[this.anim].returnTo;
    if (ret === null && !this.once) { this.frame = OPS.states[this.anim].frameCount - 1; this.t = 0; this.holding = true; return; }
    this.play(this.rest);
  }

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
          this.transform = null; this.play('level-up'); this.startSparkle();
          const cb = this.onEnd; this.onEnd = null; cb?.();
        }
      }
    } else if (!this.holding) {
      this.t += dt;
      let guard = 0;
      while (this.t >= OPS.states[this.anim].durationsMs[this.frame] && guard++ < 200) {
        const st = OPS.states[this.anim];
        this.t -= st.durationsMs[this.frame]; this.frame++; changed = true;
        if (this.frame >= st.frameCount) {
          if (st.loop && !this.once) this.frame = 0;
          else { this.next(); if (this.holding) break; }
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
