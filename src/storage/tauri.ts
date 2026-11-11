/* Úložiště přes vlastní příkazy Rust backendu. UI nikdy nepředává cestu k souboru: dialogy otevírá Rust. */
import { invoke } from '@tauri-apps/api/core';
import type { LoadResult, SnapshotInfo, SnapshotKind, StorageAdapter } from './adapter';
import { t } from '../i18n';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function createTauriStorage(): StorageAdapter {
  return {
    kind: 'tauri',
    load: () => invoke<LoadResult>('storage_load'),
    save: content => invoke<void>('storage_save', { content }),
    createSnapshot: (kind: SnapshotKind, label: string, content: string) => invoke<void>('snapshot_create', { kind, label, content }),
    listSnapshots: () => invoke<SnapshotInfo[]>('snapshot_list'),
    readSnapshot: name => invoke<string>('snapshot_read', { name }),
    deleteSnapshot: name => invoke<void>('snapshot_delete', { name }),
    saveImportRaw: content => invoke<void>('import_save_raw', { content }),
    /* Titulky systémových dialogů v jazyce UI. */
    exportBackup: (suggestedName, content) => invoke<boolean>('export_backup', { suggestedName, content, title: t('dialog.exportTitle'), filter: t('dialog.exportFilter') }),
    importBackup: () => invoke<string | null>('import_backup', { title: t('dialog.importTitle'), filter: t('dialog.importFilter') }),
    dataDir: () => invoke<string>('data_dir'),
    openDataDir: () => invoke<void>('open_data_dir'),
    openExternal: url => invoke<void>('open_external', { url }),
  };
}
