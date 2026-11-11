// ARC jednotky. Taktika a dropy pocházejí z deníku (arcDiary.ts). Kombinované záznamy deníku („Tick, Pop“) se tu
// rozdělují na jednotlivé stroje. Údaje v ARC_META deník neměl: jsou z rešerše veřejných zdrojů a nejsou ověřené ve hře.
import type { ArcUnit } from '../types';
import { ARC_DIARY } from './arcDiary';
import { SOURCES } from './stations';
import { ARC_META } from './arcMeta';

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SINCE = / \(2\.0\)$/;

export const ARC_UNITS: ArcUnit[] = ARC_DIARY.flatMap(entry => {
  const names = entry.name.replace(SINCE, '').split(', ');
  return names.map((name): ArcUnit => {
    /* U společného záznamu patří drop tomu stroji, kterého jmenuje původ materiálu. */
    const drops = names.length === 1 ? entry.drops : entry.drops.filter(d => {
      const owners = names.filter(n => (SOURCES[d] || '').includes(n));
      return owners.length === 0 || owners.includes(name);
    });
    const meta = ARC_META[name] || {};
    return {
      id: slug(name), name, origin: 'denik', since: SINCE.test(entry.name) ? '2.0' : '',
      type: meta.type || '', category: meta.category || '', difficulty: meta.difficulty || 0, danger: meta.danger || '',
      traits: meta.traits || '', weakness: meta.weakness || '', weaknessVerified: false,
      tactic: entry.tac, gear: meta.gear || '', drops,
      sources: meta.sources || [],
    };
  });
});

export const ARC_DANGERS = ['Nízká', 'Střední', 'Vysoká', 'Extrémní'] as const;
