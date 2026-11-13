/* Průvodce prvním spuštěním (0.10.0) podle docs/superpowers/specs/2026-11-12-buddy-hlavni-aplikace-tutorial-poznamka.md.
   Čistá data a přechody: každý krok má hlášku Opse (podle povahy), gesto, na co ukazuje a odpovědi. Průvodce
   nikdy neblokuje aplikaci (není to modální dialog), jde přeskočit v každém kroku, po přerušení pokračuje
   od uloženého kroku a v Nastavení se spustí znovu. Prázdný profil ani inventář mu nevadí. */
import type { OpsAnim } from './ops';
import type { LineKey } from '../i18n/opsLines';
import type { OpsPrefs, TutorialStep } from './types';
import { TUTORIAL_STEPS } from './opsPrefs';

export type ReplyId = 'start' | 'know' | 'shot' | 'manual' | 'backup' | 'later' | 'done' | 'setKey' | 'next' | 'show' | 'skipTour' | 'tryCompact' | 'settings' | 'finish' | 'resume';
export interface Reply { id: ReplyId; primary?: boolean; disabled?: boolean }
export interface StepDef {
  id: TutorialStep;
  line: LineKey;
  /* gesto při zobrazení kroku (v kompaktním okně se ukazuje nahoru na tlačítko rozbalení) */
  gesture: OpsAnim;
  /* modul v postranním panelu, na který krok ukazuje */
  target: string | null;
  replies: Reply[];
}

export const STEPS: Record<TutorialStep, StepDef> = {
  welcome: { id: 'welcome', line: 'tut.welcome', gesture: 'greet', target: null, replies: [{ id: 'start', primary: true }, { id: 'know' }] },
  /* 0.10.1: profil jde načíst ze snímku obrazovky RAIDER (Profil → Načíst ze snímku, nebo zkratka ve hře) */
  profile: { id: 'profile', line: 'tut.profile', gesture: 'point-left', target: 'profile', replies: [{ id: 'shot' }, { id: 'manual', primary: true }, { id: 'backup' }, { id: 'later' }] },
  'profile-shot': { id: 'profile-shot', line: 'tut.profileShot', gesture: 'point-left', target: 'profile', replies: [{ id: 'done', primary: true }, { id: 'manual' }] },
  'profile-manual': { id: 'profile-manual', line: 'tut.profileManual', gesture: 'point-left', target: 'profile', replies: [{ id: 'done', primary: true }] },
  capture: { id: 'capture', line: 'tut.capture', gesture: 'point-up', target: null, replies: [{ id: 'next', primary: true }, { id: 'setKey' }] },
  'tour-inventory': { id: 'tour-inventory', line: 'tut.inventory', gesture: 'point-left', target: 'inventory', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-workshop': { id: 'tour-workshop', line: 'tut.workshop', gesture: 'point-left', target: 'workshop', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-quests': { id: 'tour-quests', line: 'tut.quests', gesture: 'point-left', target: 'quests', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-builds': { id: 'tour-builds', line: 'tut.builds', gesture: 'point-left', target: 'skills', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  /* 0.19.0: novější funkce, každá jednou větou; „Přeskočit prohlídku“ jde i tady */
  'tour-advisor': { id: 'tour-advisor', line: 'tut.advisor', gesture: 'point-left', target: 'dashboard', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-raid': { id: 'tour-raid', line: 'tut.raid', gesture: 'point-left', target: 'raid', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-map': { id: 'tour-map', line: 'tut.map', gesture: 'point-left', target: 'maps', replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-search': { id: 'tour-search', line: 'tut.search', gesture: 'point-up', target: null, replies: [{ id: 'next', primary: true }, { id: 'show' }, { id: 'skipTour' }] },
  'tour-compact': { id: 'tour-compact', line: 'tut.compact', gesture: 'point-up', target: null, replies: [{ id: 'next', primary: true }, { id: 'tryCompact' }] },
  buddy: { id: 'buddy', line: 'tut.buddy', gesture: 'point-down', target: 'settings', replies: [{ id: 'next', primary: true }, { id: 'settings' }] },
  end: { id: 'end', line: 'tut.end', gesture: 'success', target: null, replies: [{ id: 'finish', primary: true }] },
};

/* Modul, který odpověď „ukázat“ otevře (podsekce za lomítkem). */
const SHOW: Partial<Record<TutorialStep, string>> = {
  'tour-inventory': 'inventory', 'tour-workshop': 'workshop', 'tour-quests': 'quests', 'tour-builds': 'skills/builds',
  'tour-advisor': 'dashboard', 'tour-raid': 'raid', 'tour-map': 'maps',
};
/* Pořadí prohlídky (odpověď „Dál“). */
const TOUR: TutorialStep[] = ['tour-inventory', 'tour-workshop', 'tour-quests', 'tour-builds', 'tour-advisor', 'tour-raid', 'tour-map', 'tour-search', 'tour-compact'];
/* Kroky do počítadla „Krok n z m“ (ruční vyplnění profilu a načtení ze snímku jsou jen odbočky kroku profilu). */
export const COUNTED_STEPS: readonly TutorialStep[] = TUTORIAL_STEPS.filter(x => x !== 'profile-manual' && x !== 'profile-shot');
export const stepNumber = (step: TutorialStep): number => COUNTED_STEPS.indexOf(step === 'profile-manual' || step === 'profile-shot' ? 'profile' : step) + 1;

export interface TutorialEffect {
  /* nový stav průvodce (beze změny = undefined) */
  tutorial?: OpsPrefs['tutorial'];
  /* otevřít modul (#modul nebo #modul/podsekce) */
  navigate?: string;
  /* přepnout okno do kompaktního režimu */
  compact?: boolean;
  /* 0.19.0: otevřít hledání (Ctrl+K) */
  search?: boolean;
}

const at = (step: TutorialStep): OpsPrefs['tutorial'] => ({ status: 'active', step });

/* Co udělá odpověď v kroku. Neznámá kombinace nic nemění. */
export function reply(step: TutorialStep, id: ReplyId): TutorialEffect {
  if (id === 'know') return { tutorial: { status: 'skipped', step } };
  if (id === 'finish') return { tutorial: { status: 'done', step: 'end' } };
  if (id === 'resume') return { tutorial: at(step) };
  switch (step) {
    case 'welcome': return id === 'start' ? { tutorial: at('profile') } : {};
    case 'profile':
      if (id === 'manual') return { tutorial: at('profile-manual'), navigate: 'profile' };
      if (id === 'shot') return { tutorial: at('profile-shot'), navigate: 'profile/shot' };
      if (id === 'backup') return { tutorial: at('capture'), navigate: 'settings' };
      if (id === 'later') return { tutorial: at('capture') };
      return {};
    case 'profile-manual': return id === 'done' ? { tutorial: at('capture') } : {};
    case 'profile-shot':
      if (id === 'done') return { tutorial: at('capture') };
      if (id === 'manual') return { tutorial: at('profile-manual'), navigate: 'profile' };
      return {};
    case 'capture':
      if (id === 'next') return { tutorial: at('tour-inventory') };
      if (id === 'setKey') return { navigate: 'settings' };
      return {};
    case 'tour-inventory': case 'tour-workshop': case 'tour-quests': case 'tour-builds':
    case 'tour-advisor': case 'tour-raid': case 'tour-map': case 'tour-search': {
      if (id === 'next') return { tutorial: at(TOUR[TOUR.indexOf(step) + 1]) };
      if (id === 'show') return step === 'tour-search' ? { search: true } : { navigate: SHOW[step] };
      if (id === 'skipTour') return { tutorial: at('buddy') };
      return {};
    }
    case 'tour-compact':
      if (id === 'next') return { tutorial: at('buddy') };
      if (id === 'tryCompact') return { compact: true };
      return {};
    case 'buddy':
      if (id === 'next') return { tutorial: at('end') };
      if (id === 'settings') return { navigate: 'settings' };
      return {};
    default: return {};
  }
}

/* Přeskočit celý průvodce (z kteréhokoli kroku). */
export const skip = (step: TutorialStep): OpsPrefs['tutorial'] => ({ status: 'skipped', step });
/* Znovu od začátku (Nastavení). */
export const restart = (): OpsPrefs['tutorial'] => ({ status: 'active', step: 'welcome' });

/* Má se průvodce ukázat? new = sám jen se zapnutými dialogy a když je povolené automatické spuštění;
   active = rozběhnutý (pokračuje i po restartu aplikace); hidden = schovaný do konce relace. */
export function tutorialShown(t: OpsPrefs['tutorial'], dialogs: boolean, auto: boolean, hidden: boolean): boolean {
  if (hidden) return false;
  if (t.status === 'active') return true;
  return t.status === 'new' && dialogs && auto;
}

/* Byl průvodce přerušen (běží od dřívějška a není na začátku)? Pak se nejdřív zeptá, zda pokračovat. */
export const isResume = (t: OpsPrefs['tutorial'], freshSession: boolean): boolean => freshSession && t.status === 'active' && t.step !== 'welcome';
