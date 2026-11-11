/* Snímek na zkratku (milník 5): obrazová data přijdou z Rustu jen do paměti, tady se jednou přečtou a dál se
   drží jen čísla (ScreenRead). Když na snímku není STASH, zahodí se bez čtení políček. Čistá funkce. */
import { readScreenshot, type ScreenRead } from './vision/read';
import type { RgbaImage } from './vision/image';

export type CaptureResult = { kind: 'empty' } | { kind: 'read'; read: ScreenRead };

export function readCapture(img: RgbaImage): CaptureResult {
  if (!img.width || !img.height || img.data.length < img.width * img.height * 4) return { kind: 'empty' };
  /* Jen STASH: bez nalezené mřížky (žádný inventář) se dál nic nečte. */
  const read = readScreenshot(img, { panels: ['stash'] });
  if (!read.panels.some(p => p.panel === 'stash')) return { kind: 'empty' };
  return { kind: 'read', read };
}
