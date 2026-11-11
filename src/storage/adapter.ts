/* Rozhraní úložiště. Produkce používá Tauri (soubory v %APPDATA%), vývoj a kouřové testy localStorage. */

export type SnapshotKind = 'auto' | 'manual' | 'import' | 'restore' | 'reset';
export const SNAPSHOT_KINDS: SnapshotKind[] = ['auto', 'manual', 'import', 'restore', 'reset'];

export interface SnapshotInfo { name: string; kind: SnapshotKind; label: string; ts: number; size: number }

export type LoadSource = 'state' | 'bak' | 'snapshot' | 'none';
export interface LoadResult { content: string | null; source: LoadSource; warning: string | null; recoveredFrom?: string | null }

export interface StorageAdapter {
  kind: 'tauri' | 'browser';
  load(): Promise<LoadResult>;
  save(content: string): Promise<void>;
  createSnapshot(kind: SnapshotKind, label: string, content: string): Promise<void>;
  listSnapshots(): Promise<SnapshotInfo[]>;
  readSnapshot(name: string): Promise<string>;
  deleteSnapshot(name: string): Promise<void>;
  saveImportRaw(content: string): Promise<void>;
  exportBackup(suggestedName: string, content: string): Promise<boolean>;
  importBackup(): Promise<string | null>;
  dataDir(): Promise<string>;
  openDataDir(): Promise<void>;
  openExternal(url: string): Promise<void>;
}

/* Rotace: drží se 30 automatických a 30 ostatních snímků. */
export const KEEP_AUTO = 30;
export const KEEP_OTHER = 30;

const SLUG = /[^a-z0-9]+/g;
export const snapshotName = (ts: number, kind: SnapshotKind, label: string): string => {
  const l = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(SLUG, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${ts}-${kind}${l ? '-' + l : ''}.json`;
};
export const SNAPSHOT_RE = /^(\d{1,16})-(auto|manual|import|restore|reset)(?:-([a-z0-9-]{1,40}))?\.json$/;
export function parseSnapshotName(name: string, size = 0): SnapshotInfo | null {
  const m = SNAPSHOT_RE.exec(name);
  if (!m) return null;
  return { name, ts: Number(m[1]), kind: m[2] as SnapshotKind, label: (m[3] || '').replace(/-/g, ' '), size };
}

/* Které snímky smazat, aby zbylo 30 + 30 nejnovějších. */
export function snapshotsToPrune(list: SnapshotInfo[]): string[] {
  const sorted = [...list].sort((a, b) => b.ts - a.ts);
  const auto = sorted.filter(s => s.kind === 'auto').slice(KEEP_AUTO);
  const other = sorted.filter(s => s.kind !== 'auto').slice(KEEP_OTHER);
  return [...auto, ...other].map(s => s.name);
}
