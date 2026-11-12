/* Instance store pro UI a hooky pro React. */
import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { createApp, type AppStore } from './app';
import { createStorage } from '../storage';
import { setExternalOpener } from '../ui/components';
import type { AppState } from '../core/types';
import { getArc, getMaterials, getRoutes, getSell, getSources, getStations, getWeapons, routeLookup } from '../core/gamedata';
import { planNeeds, stationTargets } from '../core/planner';
import { recommend } from '../core/recommend';
import { DASH } from '../ui/format';
import { dayKey, safeDecode } from '../core/util';
import { nextNeeds, readiness, shopping, workshopProgress } from '../core/workshop';
import { questNeeds, questProgress } from '../core/quests';
import { phases } from '../core/phases';
import { mapStatus } from '../core/maps';
import { runStats } from '../core/runs';
import { budget, totalPoints, planSteps, planName, nextPlanPoint } from '../core/skills';
import { adviseAll } from '../core/advice';
import { stockOf } from '../core/compact';
import { navigatorLang, setLang, t } from '../i18n';

/* Jazyk prvního spuštění (a stavu bez uložené volby) podle navigator.language; pak platí volba v Settings. */
export const app = createApp(createStorage(), { lang: navigatorLang() });
export const actions = app.actions;
setExternalOpener(url => { if (url.startsWith('https://')) void app.storage.openExternal(url).catch(() => app.notify(t('notice.linkFailed'), 'danger')); });

/* Jazyk UI sleduje stav: přihlášení proběhne dřív než u Reactu, takže komponenty už při překreslení čtou nový jazyk. */
setLang(app.store.getState().state.settings.lang);
app.store.subscribe(st => setLang(st.state.settings.lang));

export function useApp<T>(sel: (s: AppStore) => T): T { return useStore(app.store, sel); }
export const useAppState = (): AppState => useApp(s => s.state);

/* Odvozené hodnoty: počítají se v jádru, jednou na změnu stavu. */
export function derive(s: AppState) {
  const stations = getStations(s.gameData);
  const sources = getSources(s.gameData);
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const needs = nextNeeds(view, stations).map(n => ({ ...n, ready: readiness(s.inventory, n.mats) }));
  /* předměty pro dostupné úkoly jdou do nákupního seznamu i Planneru jako potřeby stanic */
  const questNeedList = questNeeds(s.quests.done, s.settings.lang);
  /* 0.13.1: nákupní seznam a Planner počítají i s Vybavením (klíč nebo předmět k použití z požadavku úkolu) */
  const haveView = { ...view, inventory: stockOf(s) };
  const shop = shopping(haveView, stations, sources, questNeedList.map(q => ({ label: t('quests.use', { name: q.label }), mats: q.mats })));
  const steps = planSteps(s.skills.activePlan, s.skills.builds);
  const weapons = getWeapons(s.gameData);
  const allRoutes = routeLookup(s.gameData);
  const routeNames: Record<string, string> = Object.fromEntries(allRoutes.map(r => [r.id, r.name]));
  const loadoutNames: Record<string, string> = Object.fromEntries(s.loadouts.map(l => [l.id, l.name]));
  return {
    stations, sources, needs, shop,
    materials: getMaterials(s),
    arc: getArc(s.gameData),
    weapons,
    weaponName: (id: string): string => weapons.find(w => w.id === id)?.name || id,
    routes: getRoutes(s.gameData),
    allRoutes,
    routeName: (id: string): string => (id ? routeNames[id] || id : DASH),
    loadoutName: (id: string): string => (id ? loadoutNames[id] || t('common.deletedLoadout') : DASH),
    sell: getSell(s.gameData),
    plan: planNeeds(haveView, s.planner, s.goals, stations, sources, questNeedList),
    quests: questProgress(s.quests.done),
    targets: stationTargets(view, s.planner, s.goals, stations),
    recs: recommend(s, Date.now()),
    /* milník 4: rada nech / recykluj / prodej pro každý předmět v Zásobě a Vybavení (klíč = klíč zásoby) */
    advice: adviseAll(s, dayKey(Date.now()), s.settings.lang),
    workshop: workshopProgress(s.stations, stations),
    phases: phases({ profile: s.profile, stations: s.stations, skills: s.skills }),
    maps: mapStatus(s.profile.rounds),
    runs: runStats(s.raids),
    used: totalPoints(s.skills.current),
    budget: budget(s.profile),
    planSteps: steps,
    planName: planName(s.skills.activePlan, s.skills.builds),
    nextPoint: nextPlanPoint(s.skills.current, steps),
  };
}
export type Derived = ReturnType<typeof derive>;
/* Jedna cache pro všechny komponenty: stav je neměnný objekt, takže se odvozené hodnoty spočítají jednou na změnu,
   ne zvlášť v každé komponentě, která useDerived volá. */
const derivedCache = new WeakMap<AppState, Derived>();
export function derivedOf(s: AppState): Derived {
  let d = derivedCache.get(s);
  if (!d) { d = derive(s); derivedCache.set(s, d); }
  return d;
}
export function useDerived(): Derived {
  return derivedOf(useAppState());
}

/* ----- směrování přes location.hash: #modul nebo #modul/podsekce ----- */
function subscribeHash(cb: () => void) { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); }
const getHash = () => window.location.hash;
export function useRoute(): { module: string; sub: string } {
  const h = useSyncExternalStore(subscribeHash, getHash, () => '');
  const [module, sub = ''] = h.replace(/^#\/?/, '').split('/');
  return { module: module || 'dashboard', sub: safeDecode(sub) };
}
export function navigate(module: string, sub?: string) {
  const h = '#' + module + (sub ? '/' + encodeURIComponent(sub) : '');
  if (window.location.hash !== h) window.location.hash = h;
}
