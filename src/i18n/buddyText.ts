/* Texty okna buddyho mimo hlášky Opse (0.19.0). Okno buddyho nenačítá velké slovníky cs.ts a en.ts (viz core.ts),
   proto má svých pár textů tady, v obou jazycích. */
import type { Lang } from './core';

/* 0.20.0: autoOn / autoPaused = popisek tečky automatického snímání */
/* 0.22.0: ariaEdit = popisek Opse se zapnutými widgety (klik otevře jejich Úpravy) */
export const BUDDY_TEXT: Record<Lang, { aria: string; ariaEdit: string; autoOn: string; autoPaused: string }> = {
  cs: { aria: 'Ops: otevřít nebo zavřít overlay', ariaEdit: 'Ops: otevřít nebo zavřít úpravy widgetů', autoOn: 'Automatické snímání běží', autoPaused: 'Automatické snímání je pozastavené' },
  en: { aria: 'Ops: open or close the overlay', ariaEdit: 'Ops: open or close widget Edit', autoOn: 'Automatic capture is running', autoPaused: 'Automatic capture is paused' },
};
