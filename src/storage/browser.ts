/* Úložiště nad localStorage pro vývoj v prohlížeči a kouřové testy. Chová se stejně jako Tauri varianta:
   stav + záloha předchozího stavu, snímky s rotací, návrat na zálohu a snímek při poškození. */
import {
  parseSnapshotName, snapshotName, snapshotsToPrune,
  type LoadResult, type SnapshotInfo, type SnapshotKind, type StorageAdapter,
} from './adapter';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number }

const P = 'arcops:';
const K_STATE = P + 'state';
const K_BAK = P + 'state.bak';
const K_SNAP = P + 'snap:';
const K_IMPORT = P + 'import:';

const validJson = (t: string | null): t is string => {
  if (!t) return false;
  try { JSON.parse(t); return true; } catch { return false; }
};

export function createBrowserStorage(kv: KV = window.localStorage, now: () => number = Date.now): StorageAdapter {
  const keys = (prefix: string) => { const out: string[] = []; for (let i = 0; i < kv.length; i++) { const k = kv.key(i); if (k && k.startsWith(prefix)) out.push(k); } return out; };
  const list = (): SnapshotInfo[] => keys(K_SNAP)
    .map(k => parseSnapshotName(k.slice(K_SNAP.length), (kv.getItem(k) || '').length))
    .filter((s): s is SnapshotInfo => !!s).sort((a, b) => b.ts - a.ts);

  return {
    kind: 'browser',
    async load(): Promise<LoadResult> {
      const cur = kv.getItem(K_STATE);
      if (validJson(cur)) return { content: cur, source: 'state', warning: null };
      const hadState = cur !== null;
      if (hadState) kv.setItem(P + `state.corrupt-${now()}`, cur!);
      const bak = kv.getItem(K_BAK);
      if (validJson(bak)) return { content: bak, source: 'bak', warning: hadState ? 'Uložený stav byl poškozený. Načetla se předchozí záloha.' : null };
      for (const s of list()) {
        const c = kv.getItem(K_SNAP + s.name);
        if (validJson(c)) return { content: c, source: 'snapshot', recoveredFrom: s.name, warning: 'Uložený stav ani záloha nešly načíst. Načetl se nejnovější snímek.' };
      }
      return { content: null, source: 'none', warning: hadState ? 'Data se nepodařilo načíst. Je otevřen prázdný stav.' : null };
    },
    async save(content) {
      const prev = kv.getItem(K_STATE);
      if (validJson(prev)) kv.setItem(K_BAK, prev);
      kv.setItem(K_STATE, content);
    },
    async createSnapshot(kind: SnapshotKind, label, content) {
      let ts = now();
      while (list().some(s => s.ts === ts)) ts++;
      kv.setItem(K_SNAP + snapshotName(ts, kind, label), content);
      for (const name of snapshotsToPrune(list())) kv.removeItem(K_SNAP + name);
    },
    async listSnapshots() { return list(); },
    async readSnapshot(name) {
      if (!parseSnapshotName(name)) throw new Error('Neplatný název snímku');
      const c = kv.getItem(K_SNAP + name);
      if (c === null) throw new Error('Snímek neexistuje');
      return c;
    },
    async deleteSnapshot(name) {
      if (!parseSnapshotName(name)) throw new Error('Neplatný název snímku');
      kv.removeItem(K_SNAP + name);
    },
    async saveImportRaw(content) {
      kv.setItem(K_IMPORT + now(), content);
      const old = keys(K_IMPORT).sort().slice(0, -10);
      old.forEach(k => kv.removeItem(k));
    },
    async exportBackup(suggestedName, content) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      a.download = suggestedName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return true;
    },
    importBackup() {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,.txt,application/json,text/plain';
        input.onchange = () => {
          const f = input.files && input.files[0];
          if (!f) return resolve(null);
          if (f.size > 20 * 1024 * 1024) return resolve('');
          f.text().then(resolve, () => resolve(null));
        };
        input.click();
      });
    },
    async dataDir() { return 'localStorage (vývojový režim v prohlížeči)'; },
    async openDataDir() { /* v prohlížeči není složka */ },
    async openExternal(url) { if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
  };
}

/* Úložiště v paměti pro testy. */
export function memoryKV(): KV & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: k => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    dump: () => Object.fromEntries(m),
  };
}
