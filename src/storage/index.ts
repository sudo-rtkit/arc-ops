import type { StorageAdapter } from './adapter';
import { createBrowserStorage } from './browser';
import { createTauriStorage, isTauri } from './tauri';

export * from './adapter';

export const createStorage = (): StorageAdapter => (isTauri() ? createTauriStorage() : createBrowserStorage());
