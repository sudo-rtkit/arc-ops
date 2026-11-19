/* 0.33.0: jediné místo, které volá příkaz kontroly nové verze v Rustu (update_check, bez argumentů). Smí ho jen
   hlavní okno (Rust ověřuje štítek okna, capabilities/main.json). Síť je jen v Rustu (pevná adresa api.github.com).
   Mimo Tauri (vývoj v prohlížeči, E2E) žádná síť: bez zkušební náhrady (window.__updateTest, jen v prohlížeči) je
   kontrola nedostupná. */
import { isTauri } from '../storage/tauri';

export interface UpdateNative {
  available: boolean;
  check(): Promise<unknown>;
}

const tauriUpdate: UpdateNative = {
  available: true,
  check: async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<unknown>('update_check');
  },
};

/* Prohlížeč: zkušební náhrada z testu (E2E), jinak nic. */
type TestUpdate = { check?: () => Promise<unknown> };
const testUpdate = (): TestUpdate | null => (typeof window !== 'undefined' ? ((window as unknown as { __updateTest?: TestUpdate }).__updateTest ?? null) : null);
const browserUpdate: UpdateNative = {
  get available() { return !!testUpdate()?.check; },
  check: () => { const x = testUpdate(); return x?.check ? x.check() : Promise.reject(new Error('update:unavailable')); },
};

export const createUpdateNative = (): UpdateNative => (isTauri() ? tauriUpdate : browserUpdate);
