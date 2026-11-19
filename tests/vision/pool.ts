/* Dekódování PNG a resize vlastních snímků ve vláknech (jen pro testy). Test, který čte desítky snímků v pěti
   velikostech, by jinak strávil většinu času dekódováním a zvětšováním v jednom vlákně; tady to dělá několik vláken
   napřed (už během předchozích testů souboru) a test v hlavním vlákně jen čte (readProgress a spol.). Výsledek je
   stejný: ve vlákně běží tentýž resizeExact (zdroj funkce se předá jako text; je soběstačná) a tentýž pngjs. Snímky
   se vracejí ve stejném pořadí, v jakém se o ně požádalo, a napřed se drží jen omezený počet souborů (paměť: snímek
   3840 px má 33 MB). */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import type { RgbaImage } from '../../src/core/vision/image';
import { resizeExact } from './resize';

const PNGJS = createRequire(import.meta.url).resolve('pngjs');
const CODE = `
const { parentPort } = require('node:worker_threads');
const { readFileSync } = require('node:fs');
const { PNG } = require(${JSON.stringify(PNGJS)});
const resizeExact = ${resizeExact.toString()};
parentPort.on('message', ({ id, path, widths }) => {
  try {
    const p = PNG.sync.read(readFileSync(path));
    const img = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
    const out = widths.map(w => (w ? resizeExact(img, w, Math.round((img.height * w) / img.width)) : { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }));
    parentPort.postMessage({ id, out }, out.map(o => o.data.buffer));
  } catch (e) {
    parentPort.postMessage({ id, error: String((e && e.stack) || e) });
  }
});`;

export interface Sized { path: string; widths: number[] }
export interface SizedQueue {
  /* snímky dalšího souboru ve všech šířkách (0 = původní velikost), v pořadí položek */
  next(): Promise<RgbaImage[]>;
  close(): Promise<void>;
}

/* Práce začne hned při zavolání. Vždy zavolat close() (afterAll / finally), jinak vlákna zůstanou běžet. */
export function decodeResized(items: Sized[], threads = Math.max(1, Math.min(4, availableParallelism() - 1)), ahead = threads + 1): SizedQueue {
  const workers = Array.from({ length: Math.max(1, Math.min(threads, items.length)) }, () => new Worker(CODE, { eval: true }));
  const pending = new Map<number, { resolve: (v: RgbaImage[]) => void; reject: (e: Error) => void }>();
  let failed: Error | undefined;
  for (const w of workers) {
    w.on('message', (m: { id: number; out?: RgbaImage[]; error?: string }) => {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p?.reject(new Error(m.error)); else p?.resolve(m.out!);
    });
    w.on('error', (e: unknown) => { const err = e instanceof Error ? e : new Error(String(e)); failed = err; for (const p of pending.values()) p.reject(err); pending.clear(); });
  }
  const queue: Promise<RgbaImage[]>[] = [];
  let sent = 0;
  const submit = () => {
    const id = sent++, item = items[id];
    const p = new Promise<RgbaImage[]>((resolve, reject) => {
      if (failed) return reject(failed);
      pending.set(id, { resolve, reject });
      workers[id % workers.length].postMessage({ id, ...item });
    });
    p.catch(() => undefined); /* chyba se ohlásí až tomu, kdo si o výsledek řekne */
    queue.push(p);
  };
  while (sent < items.length && queue.length < ahead) submit();
  return {
    async next() {
      const p = queue.shift();
      if (!p) throw new Error('decodeResized: žádný další soubor');
      if (sent < items.length) submit();
      return p;
    },
    async close() { await Promise.all(workers.map(w => w.terminate())); },
  };
}
