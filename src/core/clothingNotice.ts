/* 0.34.0: krátká hláška Opse o nově odemčené sadě oblečení. Čisté funkce bez DOM.
   - Hlásí se jen sady odemčené během běhu aplikace (sady odemčené už při načtení stavu, např. po aktualizaci nebo
     importu, ukáže „Co je nového“ a šatník, Ops kvůli nim nemluví).
   - Stejná pravidla jako nevyžádaná hláška o nové verzi (announceVersion): dialogy zapnuté, buddy zapnutý, hra není
     v popředí a aplikace ví, že hráč není v raidu (nejistota = raid). Jinak hláška počká na další změnu stavu.
   - Jedna hláška na celou dávku: jedna sada jménem, víc sad počtem. Bublina dál podléhá pravidlům nevyžádaných
     hlášek (buddy ji ukáže, jen když s Opsem hráč pracuje). Žádné okno ani fokus. */
import type { AppState } from './types';
import { inRaidRisk, type GameInfo } from './ai';
import { line, type LineRef } from './opsVoice';
import { CLOTHING_SET_IDS } from './clothing';
import { setName } from './clothingNames';

export function clothingAllowed(s: AppState, game: GameInfo): boolean {
  if (!s.opsPrefs.dialogs || !s.buddy.enabled) return false;
  return !game.visible && !inRaidRisk(s, game, 'overlay');
}

/* Hláška pro čekající sady (v pořadí manifestu), nebo null (nic nečeká / teď se nesmí mluvit). */
export function clothingLine(s: AppState, game: GameInfo, pending: readonly string[]): LineRef | null {
  const ids = CLOTHING_SET_IDS.filter(id => pending.includes(id));
  if (!ids.length || !clothingAllowed(s, game)) return null;
  return ids.length === 1 ? line('clothing.unlocked', { name: setName(ids[0], s.settings.lang) }) : line('clothing.unlockedMany', { count: ids.length });
}

export interface ClothingNoticePort { say(l: LineRef): void; game(): GameInfo }
export interface ClothingNoticeApp {
  store: { getState(): { ready: boolean; state: AppState }; subscribe(f: (x: { ready: boolean; state: AppState }) => void): () => void };
}

/* Hlídač v hlavním okně: zapamatuje si sady při načtení, nově odemčené přidá do fronty a ohlásí je, jakmile to
   pravidla dovolí (při každé změně stavu nebo poke(), např. když hra odejde z popředí). */
export function createClothingNotices(app: ClothingNoticeApp, port: ClothingNoticePort) {
  let known: Set<string> | null = null;
  let pending: string[] = [];
  const check = () => {
    const x = app.store.getState();
    if (!x.ready) return;
    const sets = x.state.buddy.clothingSets ?? [];
    if (!known) { known = new Set(sets); return; }
    for (const id of sets) if (!known.has(id)) { known.add(id); pending.push(id); }
    const l = clothingLine(x.state, port.game(), pending);
    if (!l) return;
    pending = [];
    port.say(l);
  };
  const off = app.store.subscribe(check);
  check();
  return { poke: check, stop: off, pending: () => [...pending] };
}
