/* Povaha, zvuky a průvodce Opse (0.10.0, schéma 8). Čisté funkce bez DOM. Nastavení patří tomuto počítači:
   import zálohy, obnova ani reset je nemění (stejně jako okno aplikace). */
import type { OpsPersonality, OpsPrefs, TutorialStatus, TutorialStep, WidgetsSwitch } from './types';
import { validHotkey } from './ops';
import { clampInt, isObj } from './util';

export const PERSONALITIES: readonly OpsPersonality[] = ['plain', 'friendly', 'cheeky'];
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'welcome', 'profile', 'profile-manual', 'profile-shot', 'capture', 'tour-inventory', 'tour-workshop', 'tour-quests', 'tour-builds',
  /* 0.19.0: novější funkce (rádce, příprava na raid a záložka Raid v overlayi, mapa ze snímku, Ctrl+K a karta předmětu) */
  'tour-advisor', 'tour-raid', 'tour-map', 'tour-search', 'tour-compact', 'buddy', 'end',
];
const STATUSES: readonly TutorialStatus[] = ['new', 'active', 'done', 'skipped'];
export const VOLUME_DEFAULT = 25;

export const emptyOpsPrefs = (): OpsPrefs => ({
  personality: 'friendly', sound: true, volume: VOLUME_DEFAULT, dialogs: true, tutorial: { status: 'new', step: 'welcome' }, advisor: true,
  widgets: { on: false, editKey: '', hideKey: '', contrast: false }, passClicks: true, lowImpact: false, consoleKey: '',
});

/* 0.22.0: přepínač widgetů a jejich zkratky. Zkratka musí projít stejnou kontrolou jako zkratka snímku; dvě stejné
   zkratky nejdou (druhá se zahodí). */
export function normalizeWidgetsSwitch(raw: unknown): WidgetsSwitch {
  const r = isObj(raw) ? raw : {};
  const key = (v: unknown) => (typeof v === 'string' && validHotkey(v) ? v : '');
  const editKey = key(r.editKey), hideKey = key(r.hideKey);
  return { on: r.on === true, editKey, hideKey: hideKey && hideKey === editKey ? '' : hideKey, contrast: r.contrast === true };
}

export function normalizeOpsPrefs(raw: unknown): OpsPrefs {
  const r = isObj(raw) ? raw : {};
  const d = emptyOpsPrefs();
  if (PERSONALITIES.includes(r.personality as OpsPersonality)) d.personality = r.personality as OpsPersonality;
  if (typeof r.sound === 'boolean') d.sound = r.sound;
  if (r.volume !== undefined && Number.isFinite(Number(r.volume))) d.volume = clampInt(r.volume, 0, 100);
  if (typeof r.dialogs === 'boolean') d.dialogs = r.dialogs;
  /* 0.17.0: rada „Co dál?“ nahlas; ve starším nastavení chybí a je zapnutá */
  if (typeof r.advisor === 'boolean') d.advisor = r.advisor;
  d.widgets = normalizeWidgetsSwitch(r.widgets);
  /* 0.22.1: ve starším nastavení chybí a je zapnuté (vypnout jde jen výslovně) */
  d.passClicks = r.passClicks !== false;
  /* 0.23.0: ve starším nastavení chybí = vypnuto / bez zkratky; zkratka konzole nesmí být stejná jako zkratka widgetů */
  d.lowImpact = r.lowImpact === true;
  const ck = typeof r.consoleKey === 'string' && validHotkey(r.consoleKey) ? r.consoleKey : '';
  d.consoleKey = ck && (ck === d.widgets.editKey || ck === d.widgets.hideKey) ? '' : ck;
  const t = isObj(r.tutorial) ? r.tutorial : {};
  if (STATUSES.includes(t.status as TutorialStatus)) d.tutorial.status = t.status as TutorialStatus;
  if (TUTORIAL_STEPS.includes(t.step as TutorialStep)) d.tutorial.step = t.step as TutorialStep;
  return d;
}
