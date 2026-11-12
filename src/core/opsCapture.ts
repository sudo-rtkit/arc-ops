/* Snímek na zkratku (milník 5, rozlišení obrazovek 0.8.1): obrazová data přijdou z Rustu jen do paměti, tady se
   jednou přečtou a dál se drží jen čísla (ScreenRead). Čistá funkce.
   - INVENTORY se STASH → 'stash': čte se jen STASH (batoh a quick use se do dávky stashe nemíchají).
   - FINDINGS po raidu (bez STASH, s batohem a tlačítkem CONTINUE) → 'loot': čte se jen BACKPACK a QUICK USE.
     EQUIPMENT se nečte (není to mřížka políček) a mince se nečtou: hodnota loadoutu na této obrazovce nejsou mince.
   - Cokoli jiného (profil, skill tree, úkoly, dílna, MANAGE LOADOUT před raidem) se zahodí bez čtení políček. */
import { readScreenshot, type ScreenRead } from './vision/read';
import { lumMap, type RgbaImage } from './vision/image';
import { detectLayout } from './vision/layout';
import { hasContinueButton } from './vision/screen';

export type CaptureReject = 'noInventory' | 'otherScreen';
export type CaptureScreen = 'stash' | 'loot';
export type CaptureResult =
  | { kind: 'empty'; reason: CaptureReject }
  | { kind: 'read'; screen: CaptureScreen; read: ScreenRead };

/* Jen druh obrazovky (bez čtení políček). 'findings' = obrazovka po raidu, 'stash' = INVENTORY se STASH,
   'backpack' = jiná obrazovka s batohem (např. příprava loadoutu), 'none' = bez mřížky inventáře. */
export type ScreenKind = 'stash' | 'findings' | 'backpack' | 'none';
export function screenKind(img: RgbaImage): ScreenKind {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return 'none';
  const layout = detectLayout(img, lumMap(img));
  if (!layout) return 'none';
  if (layout.panels.some(p => p.panel === 'stash')) return 'stash';
  if (!layout.panels.some(p => p.panel === 'backpack')) return 'none';
  return hasContinueButton(img, layout) ? 'findings' : 'backpack';
}

export function readCapture(img: RgbaImage): CaptureResult {
  const kind = screenKind(img);
  if (kind === 'none') return { kind: 'empty', reason: 'noInventory' };
  if (kind === 'backpack') return { kind: 'empty', reason: 'otherScreen' };
  if (kind === 'stash') {
    const read = readScreenshot(img, { panels: ['stash'] });
    if (!read.panels.some(p => p.panel === 'stash')) return { kind: 'empty', reason: 'noInventory' };
    return { kind: 'read', screen: 'stash', read };
  }
  const read = readScreenshot(img, { panels: ['backpack', 'quickUse'] });
  if (!read.panels.some(p => p.panel === 'backpack')) return { kind: 'empty', reason: 'noInventory' };
  /* hodnota loadoutu ani nic jiného z této obrazovky se za mince nepovažuje */
  return { kind: 'read', screen: 'loot', read: { ...read, coins: null, premium: null, stashValue: null, headerSlots: null, headerSlotsMax: null } };
}
