/* 0.20.1: malé tiché emoce Opse k automatickému snímku obrazovky (docs/design/buddy/bednak2/README.md,
   „Automatic capture scan emotes“). Náhrada velké animace scanning, kterou 0.20.0 nad hrou záměrně nehraje:
   - scan (9 snímků, 1 s): automatický snímek začal,
   - scan-ok (5 snímků, 0,4 s): výsledek je rozpoznaný a automaticky zapsaný,
   - scan-unsure (5 snímků, 0,5 s): něco šlo do fronty „Ke kontrole“.
   Jen LED v hledí: bez zvuku, bubliny, změny fokusu a aktivace okna. Čisté funkce bez DOM. */
import type { OpsAnim } from './ops';

export const AUTO_EMOTES = ['scan', 'scan-ok', 'scan-unsure'] as const;
export type AutoEmote = typeof AUTO_EMOTES[number];
export const isAutoEmote = (v: unknown): v is AutoEmote => typeof v === 'string' && (AUTO_EMOTES as readonly string[]).includes(v);

/* Zpráva hlavní okno → buddy / overlay (bus typ 'emote'); id = číslo snímku z Rustu (v prohlížeči záporné). */
export interface EmoteMsg { anim: AutoEmote; id: number }
export const emoteMsg = (p: unknown): EmoteMsg | null => {
  const o = p as { anim?: unknown; id?: unknown } | null;
  return o && typeof o === 'object' && isAutoEmote(o.anim) && Number.isSafeInteger(o.id) ? { anim: o.anim, id: Number(o.id) } : null;
};

/* Jak dopadl automatický snímek (hub.handleAutoCapture). */
export type AutoOutcome = 'off' | 'empty' | 'loadout' | 'result' | 'dup' | 'screen';
/* Závěrečná emoce podle výsledku: loadout a výsledek raidu bez nejistých údajů jsou zapsané (ok); obrazovka mimo raid
   nebo výsledek s něčím ke kontrole = nejisté. Prázdný, vypnutý nebo opakovaný snímek nic nehraje (scan sám skončí). */
export function emoteFor(outcome: AutoOutcome, review = 0): AutoEmote | null {
  switch (outcome) {
    case 'loadout': return 'scan-ok';
    case 'result': return review > 0 ? 'scan-unsure' : 'scan-ok';
    case 'screen': return 'scan-unsure';
    default: return null;
  }
}

/* Stav Opse, nad kterým se rozhoduje (Animator). */
export interface EmoteGate {
  anim: OpsAnim;
  /* běží proměna */
  transform: boolean;
  /* skrytý po odchodu (dismiss na posledním snímku) */
  hidden: boolean;
  /* čeká jednorázový stav ve frontě (např. probuzení → výsledek) */
  queued: boolean;
  /* omezení pohybu */
  reduced: boolean;
}
/* Smí emoce běžet? Nízká priorita: jen nad klidem (idle) nebo jinou emocí. Nikdy nepřeruší tažení, krok, gesto,
   řeč, ruční scanning, proměnu ani odchod; spícího nebo skrytého Opse nebudí (emoce se zahodí, po probuzení se
   nepřehrává). Opakovaný scan nad běžícím scanem se sloučí (nerestartuje), stejná výsledná emoce taky.
   Při omezení pohybu se nehraje nic (README dovoluje vynechat i krátké podržení výsledku). */
export function emoteAllowed(e: AutoEmote, g: EmoteGate): boolean {
  if (g.reduced || g.transform || g.hidden || g.queued) return false;
  if (g.anim === 'idle') return true;
  if (!isAutoEmote(g.anim)) return false;
  /* scan → scan-ok / scan-unsure nahradí; nový scan po výsledku je nový snímek */
  return g.anim !== e;
}
