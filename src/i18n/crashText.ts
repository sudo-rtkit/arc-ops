/* 0.28.0: texty náhradního obsahu okna po chybě vykreslení (src/ui/ErrorBoundary.tsx). Okno buddyho nenačítá
   velké slovníky cs.ts a en.ts (viz core.ts) a chyba může nastat dřív, než se slovník načte, proto jsou tyto
   texty tady, v obou jazycích (jako buddyText.ts). */
import type { Lang } from './core';

export const CRASH_TEXT: Record<Lang, { title: string; text: string; reload: string; short: string }> = {
  cs: {
    title: 'Okno narazilo na chybu',
    text: 'Chyba se zapsala do místního deníku (Nastavení → Diagnostika). Uložená data zůstávají.',
    reload: 'Načíst okno znovu',
    short: 'Chyba okna: načíst znovu',
  },
  en: {
    title: 'This window hit an error',
    text: 'The error was written to the local log (Settings → Diagnostics). Your saved data stays as it is.',
    reload: 'Reload window',
    short: 'Window error: reload',
  },
};
