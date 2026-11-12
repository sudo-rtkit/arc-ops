/* Povaha, zvuky a průvodce Opse (0.10.0, schéma 8). Čisté funkce bez DOM. Nastavení patří tomuto počítači:
   import zálohy, obnova ani reset je nemění (stejně jako okno aplikace). */
import type { OpsPersonality, OpsPrefs, TutorialStatus, TutorialStep } from './types';
import { clampInt, isObj } from './util';

export const PERSONALITIES: readonly OpsPersonality[] = ['plain', 'friendly', 'cheeky'];
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'welcome', 'profile', 'profile-manual', 'profile-shot', 'capture', 'tour-inventory', 'tour-workshop', 'tour-quests', 'tour-builds', 'tour-compact', 'buddy', 'end',
];
const STATUSES: readonly TutorialStatus[] = ['new', 'active', 'done', 'skipped'];
export const VOLUME_DEFAULT = 25;

export const emptyOpsPrefs = (): OpsPrefs => ({
  personality: 'friendly', sound: true, volume: VOLUME_DEFAULT, dialogs: true, tutorial: { status: 'new', step: 'welcome' },
});

export function normalizeOpsPrefs(raw: unknown): OpsPrefs {
  const r = isObj(raw) ? raw : {};
  const d = emptyOpsPrefs();
  if (PERSONALITIES.includes(r.personality as OpsPersonality)) d.personality = r.personality as OpsPersonality;
  if (typeof r.sound === 'boolean') d.sound = r.sound;
  if (r.volume !== undefined && Number.isFinite(Number(r.volume))) d.volume = clampInt(r.volume, 0, 100);
  if (typeof r.dialogs === 'boolean') d.dialogs = r.dialogs;
  const t = isObj(r.tutorial) ? r.tutorial : {};
  if (STATUSES.includes(t.status as TutorialStatus)) d.tutorial.status = t.status as TutorialStatus;
  if (TUTORIAL_STEPS.includes(t.step as TutorialStep)) d.tutorial.step = t.step as TutorialStep;
  return d;
}
