/* Snímek na zkratku (milník 5, rozlišení obrazovek 0.8.1): obrazová data přijdou z Rustu jen do paměti, tady se
   jednou přečtou a dál se drží jen čísla (ScreenRead). Čistá funkce.
   - INVENTORY se STASH → 'stash': čte se jen STASH (batoh a quick use se do dávky stashe nemíchají).
   - FINDINGS po raidu (bez STASH, s batohem a tlačítkem CONTINUE) → 'loot': čte se jen BACKPACK a QUICK USE.
     Mince se nečtou: hodnota loadoutu na této obrazovce nejsou mince. 0.24.0: EQUIPMENT (zbraně, augment, štít)
     čte automatický snímek výsledku (readAutoCapture) čtečkou výbavy; 0.25.0 stejnou čtečkou i snímek ze zkratky
     (equip, jen čísla a shody; zápis až po potvrzení ve frontě „Ke kontrole“, viz store importRaidLoot).
   - 0.10.1: obrazovky postupu (PROFIL, DÍLNA a detail stanice, ÚKOL obchodníka, SKILL TREE) → 'progress':
     přečtou se jen čísla a názvy (core/vision/progress.ts), zápis až po kontrole v revizi.
   - Cokoli jiného (MANAGE LOADOUT před raidem, neznámá obrazovka) se zahodí bez čtení. */
import { readScreenshot, type ScreenRead } from './vision/read';
import { lumMap, type RgbaImage } from './vision/image';
import { detectLayout } from './vision/layout';
import { hasContinueButton } from './vision/screen';
import { readProgress, type ProgressRead } from './vision/progress';
import { readLoadout, type EquipRead, type LoadoutRead } from './vision/loadout';
import type { RustScreen } from './autoCapture';
import type { RaidOutcome } from './raidLife';

export type CaptureReject = 'noInventory' | 'otherScreen';
export type CaptureScreen = 'stash' | 'loot';
export type CaptureResult =
  | { kind: 'empty'; reason: CaptureReject }
  /* 0.25.0: equip = výbava z FINDINGS (zbraně, augment, štít), jen u screen 'loot' */
  | { kind: 'read'; screen: CaptureScreen; read: ScreenRead; equip?: EquipRead[] }
  | { kind: 'progress'; progress: ProgressRead };

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
  if (kind === 'none') {
    const progress = readProgress(img);
    return progress ? { kind: 'progress', progress } : { kind: 'empty', reason: 'noInventory' };
  }
  if (kind === 'backpack') return { kind: 'empty', reason: 'otherScreen' };
  if (kind === 'stash') {
    const read = readScreenshot(img, { panels: ['stash'] });
    if (!read.panels.some(p => p.panel === 'stash')) return { kind: 'empty', reason: 'noInventory' };
    return { kind: 'read', screen: 'stash', read };
  }
  /* 0.25.0: čtečka výbavy čte i BACKPACK a QUICK USE stejným čtením jako dřív (stejný podpis snímku) */
  const lo = readLoadout(img);
  if (lo?.screen && lo.screen.panels.some(p => p.panel === 'backpack')) return { kind: 'read', screen: 'loot', read: lo.screen, equip: lo.equip };
  const read = readScreenshot(img, { panels: ['backpack', 'quickUse'] });
  if (!read.panels.some(p => p.panel === 'backpack')) return { kind: 'empty', reason: 'noInventory' };
  /* hodnota loadoutu ani nic jiného z této obrazovky se za mince nepovažuje */
  return { kind: 'read', screen: 'loot', read: { ...read, coins: null, premium: null, stashValue: null, headerSlots: null, headerSlotsMax: null } };
}

/* 0.20.0: automatický snímek (src-tauri/src/ops.rs): Rust podle pásu s nadpisy pozná obrazovku a pošle ji s plným
   snímkem. Loadout se čte čtečkou výbavy (core/vision/loadout.ts); výsledek raidu přímo jako BACKPACK a QUICK USE
   (KNOCKED OUT loot nemá, výbava je ztracená); ostatní obrazovky stejnou cestou jako snímek ze zkratky. */
export type AutoRead =
  | { kind: 'loadout'; loadout: LoadoutRead }
  /* 0.24.0: loadout = výbava přečtená z FINDINGS (zbraně, augment, štít), jen u přežití */
  | { kind: 'result'; outcome: RaidOutcome; read: ScreenRead | null; loadout?: LoadoutRead | null }
  | { kind: 'other'; result: CaptureResult }
  | { kind: 'empty' };
export function readAutoCapture(img: RgbaImage, screen: RustScreen): AutoRead {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return { kind: 'empty' };
  if (screen === 'loadout') {
    const l = readLoadout(img);
    return l ? { kind: 'loadout', loadout: l } : { kind: 'empty' };
  }
  if (screen === 'findings' || screen === 'knockedOut') {
    if (screen === 'knockedOut') return { kind: 'result', outcome: 'knockedOut', read: null };
    /* čtečka výbavy čte i BACKPACK a QUICK USE (stejné čtení jako dřív); bez mřížky batohu nic */
    const lo = readLoadout(img);
    if (lo?.screen && lo.screen.panels.some(p => p.panel === 'backpack')) return { kind: 'result', outcome: 'survived', read: lo.screen, loadout: lo };
    const read = readScreenshot(img, { panels: ['backpack', 'quickUse'] });
    const ok = read.panels.some(p => p.panel === 'backpack');
    return { kind: 'result', outcome: 'survived', read: ok ? { ...read, coins: null, premium: null, stashValue: null, headerSlots: null, headerSlotsMax: null } : null, loadout: null };
  }
  return { kind: 'other', result: readCapture(img) };
}
