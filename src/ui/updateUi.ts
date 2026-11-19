/* 0.33.0: otevření stránky vydání (pruh v hlavním okně a Nastavení → Aktualizace). Jen s adresou podle pravidla
   (RELEASES_PREFIX + tag/v<verze>); otevře ji store (jen https) přes příkaz open_external v Rustu (jen https).
   Bez importu hubu hlavního okna, takže ho může použít i kód sdílený s overlayem. */
import { releaseUrlOk, type UpdateRelease } from '../core/update';
import { openExternalUrl } from './components';

export const openRelease = (r: UpdateRelease): void => { if (releaseUrlOk(r.url, r.latest)) openExternalUrl(r.url); };
