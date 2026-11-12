/* Zvuky Opse (0.10.0): vlastní krátké zvuky syntetizované ve Web Audio (žádné soubory, nic ze hry, offline).
   Retro-futuristické cvaknutí, servo, teplý reléový puls a tiché rádiové prasknutí; řeč = krátké nepravidelné
   pípnutí. Každé okno má vlastní přehrávač; zda smí hrát, rozhoduje čistá funkce soundAllowed (core/opsSound.ts).
   AudioContext vzniká až při prvním zvuku nebo prvním kliknutí v okně (pravidla automatického přehrávání). */
import { soundAllowed, soundGain, type SoundContext, type SoundId } from '../core/opsSound';

type Ctx = Omit<SoundContext, 'now'>;
type AC = AudioContext;

function tone(ac: AC, out: AudioNode, at: number, f0: number, f1: number, dur: number, type: OscillatorType, peak = 1) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AC, out: AudioNode, at: number, dur: number, hp: number, peak = 1) {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    /* deterministický šum (žádná náhoda mezi spuštěními) */
    let x = 12345;
    for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff - 1) * (i % 7 === 0 ? 1 : 0.35); }
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(out);
  s.start(at); s.stop(at + dur + 0.02);
}

/* Jeden zvuk do výstupu (zesílení už je nastavené). */
export function synth(ac: AC, out: AudioNode, id: SoundId, rnd: () => number = Math.random): void {
  const t = ac.currentTime + 0.01;
  switch (id) {
    case 'scan': /* servo nahoru a cvak závěrky */
      noise(ac, out, t, 0.03, 3000, 0.5);
      tone(ac, out, t + 0.02, 420, 1300, 0.22, 'sawtooth', 0.18);
      tone(ac, out, t + 0.24, 1800, 1800, 0.04, 'square', 0.25);
      break;
    case 'done': /* teplý reléový puls */
      noise(ac, out, t, 0.02, 2000, 0.35);
      tone(ac, out, t + 0.01, 660, 660, 0.09, 'triangle', 0.7);
      tone(ac, out, t + 0.1, 990, 990, 0.12, 'triangle', 0.6);
      break;
    case 'unsure': /* tázavé dvojí pípnutí dolů */
      tone(ac, out, t, 620, 560, 0.1, 'triangle', 0.55);
      tone(ac, out, t + 0.13, 520, 430, 0.14, 'triangle', 0.5);
      break;
    case 'error': /* tiché rádiové prasknutí a bzučení */
      noise(ac, out, t, 0.16, 900, 0.55);
      tone(ac, out, t + 0.03, 150, 110, 0.18, 'square', 0.12);
      noise(ac, out, t + 0.2, 0.05, 1500, 0.3);
      break;
    case 'levelup': /* dvojitý reléový puls a krátké arpeggio */
      noise(ac, out, t, 0.02, 2000, 0.35);
      tone(ac, out, t + 0.01, 660, 660, 0.08, 'triangle', 0.6);
      noise(ac, out, t + 0.1, 0.02, 2000, 0.35);
      tone(ac, out, t + 0.11, 660, 660, 0.08, 'triangle', 0.6);
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, out, t + 0.24 + i * 0.07, f, f, 0.12, 'square', 0.16));
      break;
    case 'open': /* suchá západka */
      noise(ac, out, t, 0.025, 2500, 0.6);
      tone(ac, out, t + 0.015, 300, 520, 0.07, 'triangle', 0.4);
      break;
    case 'close':
      tone(ac, out, t, 520, 280, 0.08, 'triangle', 0.4);
      noise(ac, out, t + 0.07, 0.025, 2500, 0.55);
      break;
    case 'win': /* krátká vzestupná dvojice */
      noise(ac, out, t, 0.02, 2000, 0.3);
      tone(ac, out, t + 0.01, 523, 523, 0.08, 'triangle', 0.55);
      tone(ac, out, t + 0.1, 784, 784, 0.14, 'triangle', 0.55);
      break;
    case 'record': /* trojí reléový puls nahoru */
      [587, 740, 988].forEach((f, i) => { noise(ac, out, t + i * 0.09, 0.015, 2200, 0.25); tone(ac, out, t + 0.01 + i * 0.09, f, f, 0.08, 'triangle', 0.5); });
      tone(ac, out, t + 0.3, 1175, 1175, 0.16, 'square', 0.14);
      break;
    case 'unlock': /* servo, cvak zámku a jiskra */
      tone(ac, out, t, 300, 700, 0.14, 'sawtooth', 0.14);
      noise(ac, out, t + 0.15, 0.03, 2600, 0.55);
      [1047, 1319, 1568].forEach((f, i) => tone(ac, out, t + 0.2 + i * 0.06, f, f, 0.09, 'square', 0.13));
      break;
    case 'beep': { /* řeč: 3 krátké nepravidelné tóny */
      let at = t;
      for (let i = 0; i < 3; i++) {
        const f = 700 + Math.floor(rnd() * 6) * 110;
        const d = 0.035 + rnd() * 0.03;
        tone(ac, out, at, f, f * (rnd() < 0.5 ? 0.9 : 1.1), d, 'square', 0.14);
        at += d + 0.02 + rnd() * 0.03;
      }
      break;
    }
  }
}

export interface SoundPlayer {
  /* Zahraje, když to pravidla dovolí; vrací, zda hrál. force = náhled v Nastavení (jen hlasitost a zapnutí). */
  play(id: SoundId, opts?: { force?: boolean }): boolean;
  /* zvuky přehrané v tomto okně (pro E2E v prohlížeči) */
  log: SoundId[];
}

export function createSoundPlayer(context: () => Ctx): SoundPlayer {
  let ac: AC | null = null;
  const log: SoundId[] = [];
  const ensure = (): AC | null => {
    if (typeof window === 'undefined') return null;
    if (!ac) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      try { ac = new C(); } catch { return null; }
    }
    if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
    return ac;
  };
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { if (ac) ensure(); }, { capture: true });
  return {
    log,
    play(id, opts = {}) {
      const c = context();
      const ok = opts.force ? c.on && c.volume > 0 : soundAllowed({ ...c, now: Date.now() });
      if (!ok) return false;
      log.push(id);
      if (log.length > 50) log.shift();
      const a = ensure();
      if (!a) return true;
      try {
        const g = a.createGain();
        g.gain.value = soundGain(c.volume);
        g.connect(a.destination);
        synth(a, g, id);
        setTimeout(() => g.disconnect(), 1500);
      } catch { /* bez zvuku */ }
      return true;
    },
  };
}
