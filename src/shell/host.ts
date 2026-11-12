/* 0.16.0: v jakém okně modul běží. Moduly se vykreslují v hlavním okně i v overlayi (celá aplikace z overlaye),
   proto nesmí samy importovat hub hlavního okna (src/ops/mainHub.ts): ten v okně overlaye nesmí vzniknout,
   jinak by tam byl druhý hub a druhý zapisovatel. Okno si při startu nastaví hostitele:
   - main.tsx: hlavní okno (zvuky hlavního okna);
   - overlay: zvuky overlaye a „Otevřít v aplikaci“ (hlavní okno do popředí na dané cestě).
   Bez nastavení (testy) je to hlavní okno bez zvuku. */
import type { SoundId } from '../core/opsSound';

export type HostKind = 'main' | 'overlay';
export interface Host {
  kind: HostKind;
  play(id: SoundId): void;
  /* overlay: otevře cestu (#modul/podsekce) v hlavním okně; v hlavním okně jen naviguje */
  openInApp(route: string): void;
}

let host: Host = { kind: 'main', play: () => undefined, openInApp: () => undefined };
export const setHost = (h: Host): void => { host = h; };
export const hostKind = (): HostKind => host.kind;
export const inOverlay = (): boolean => host.kind === 'overlay';
export const hostSound = { play: (id: SoundId): void => host.play(id) };
export const openInApp = (route: string): void => host.openInApp(route);
