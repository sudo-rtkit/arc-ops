/* Texty okna buddyho mimo hlášky Opse (0.19.0). Okno buddyho nenačítá velké slovníky cs.ts a en.ts (viz core.ts),
   proto má svých pár textů tady, v obou jazycích. */
import type { Lang } from './core';

export const BUDDY_TEXT: Record<Lang, { aria: string }> = {
  cs: { aria: 'Ops: otevřít nebo zavřít overlay' },
  en: { aria: 'Ops: open or close the overlay' },
};
