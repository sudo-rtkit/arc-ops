/* 0.30.0: AI asistent Ops, fáze 1 (docs/superpowers/specs/2026-11-14-ai-asistent-design.md). Čisté funkce bez DOM:
   nastavení (výchozí stav vypnuto, souhlas, poskytovatel, model, dnešní počet), kdy se smí ptát, kódy chyb a text
   odpovědi pro zobrazení.
   - Nastavení patří tomuto počítači (jako povaha Opse): import zálohy, obnova ani reset ho nemění. Klíč ve stavu
     nikdy není (je ve Windows Credential Manageru, src-tauri/src/ai.rs).
   - Dotaz se pošle jen na výslovnou akci hráče, se zapnutým asistentem, souhlasem a klíčem, a nikdy v raidu.
     Z overlaye (nad hrou) jen tehdy, když aplikace ví, že hráč v raidu není; když si není jistá, bere to jako raid.
   - Odpověď modelu je prostý text: bez HTML, bez Markdownu a odkazů, omezená délka. Model nic nespouští; tlačítka
     pod odpovědí počítá aplikace z otázky, ne z textu modelu. */
import type { AppState } from './types';
import { clampInt, isObj } from './util';
import { autoActive, isRustScreen } from './autoCapture';
import { TIP_ID_RE } from './advisor';

export type AiProvider = 'groq' | 'gemini' | 'openrouter';
export interface AiProviderDef {
  id: AiProvider; name: string;
  /* výchozí model (dá se přepsat v Nastavení) */
  model: string;
  /* stránka, kde si hráč vytvoří klíč */
  keyUrl: string;
}
/* Výchozí modely ověřené v dokumentaci poskytovatelů 14. 11. 2026:
   - Groq: openai/gpt-oss-120b (bezplatný tarif 30 dotazů/min, 1000/den; Llama modely jsou teď jen pro firmy);
   - Gemini: gemini-3.5-flash-lite (bezplatná úroveň; náhrada za končící 2.5 Flash);
   - OpenRouter: openrouter/free (směrovač bezplatných modelů; seznam :free modelů se často mění). */
export const AI_PROVIDERS: readonly AiProviderDef[] = [
  { id: 'groq', name: 'Groq', model: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys' },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-3.5-flash-lite', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter', model: 'openrouter/free', keyUrl: 'https://openrouter.ai/settings/keys' },
];
export const isAiProvider = (v: unknown): v is AiProvider => typeof v === 'string' && AI_PROVIDERS.some(p => p.id === v);
export const providerDef = (id: AiProvider): AiProviderDef => AI_PROVIDERS.find(p => p.id === id) ?? AI_PROVIDERS[0];

/* Id modelu: stejná kontrola jako v Rustu (model_ok). */
export const MODEL_RE = /^[A-Za-z0-9._:/-]{1,100}$/;
export const modelOk = (m: unknown): m is string => typeof m === 'string' && MODEL_RE.test(m);

export interface AiPrefs {
  on: boolean;
  provider: AiProvider;
  /* '' = výchozí model poskytovatele */
  model: string;
  /* kdy hráč souhlasil s textem o tom, co se posílá (0 = nesouhlasil) */
  consentAt: number;
  /* 0.32.0: verze seznamu posílaných údajů, se kterou hráč souhlasil (0 = souhlas bez verze z 0.30/0.31) */
  consentVersion: number;
  /* dnešní počet dotazů (místní den YYYY-MM-DD) */
  day: string;
  count: number;
}
export const AI_COUNT_MAX = 100_000;
export const emptyAi = (): AiPrefs => ({ on: false, provider: 'groq', model: '', consentAt: 0, consentVersion: 0, day: '', count: 0 });

/* ----- 0.32.0: verze souhlasu -----
   AI_CONSENT_VERSION se zvýší pokaždé, když se rozšíří seznam posílaných údajů (AI_CONSENT_ITEMS, since = verze,
   od které je bod v seznamu). Uloží se verze, se kterou hráč souhlasil; je-li nižší než aktuální, dotazy jsou
   zablokované (aiBlock → 'reconsent'), dokud hráč znovu nesouhlasí, a Nastavení ukáže, co v seznamu přibylo.
   Verze 0 = souhlas z 0.30.0/0.31.0 (ještě bez verze; text 0.30.0 pokrýval předmět, „Co dál?“ a bednu).
   Verze 1 pokrývá vše do 0.32.0 (úkoly a dílna, příprava na raid, shrnutí po raidu, analytika z deníku). */
export const AI_CONSENT_VERSION = 1;
export type AiConsentItem = 'item' | 'advisor' | 'quests' | 'raid' | 'postRaid' | 'stats';
export const AI_CONSENT_ITEMS: readonly { id: AiConsentItem; since: number }[] = [
  { id: 'item', since: 0 }, { id: 'advisor', since: 0 },
  { id: 'quests', since: 1 }, { id: 'raid', since: 1 }, { id: 'postRaid', since: 1 }, { id: 'stats', since: 1 },
];
/* Souhlas platí pro aktuální seznam? */
export const consentCurrent = (p: Pick<AiPrefs, 'consentAt' | 'consentVersion'>, current = AI_CONSENT_VERSION): boolean =>
  p.consentAt > 0 && p.consentVersion >= current;
/* Co přibylo od verze, se kterou hráč souhlasil (bez souhlasu = nic, ukazuje se celý seznam). */
export const consentNews = (p: Pick<AiPrefs, 'consentAt' | 'consentVersion'>, current = AI_CONSENT_VERSION): AiConsentItem[] =>
  p.consentAt > 0 ? AI_CONSENT_ITEMS.filter(i => i.since > p.consentVersion && i.since <= current).map(i => i.id) : [];
/* Uložená verze: celé číslo 0–AI_CONSENT_VERSION (vyšší z novější verze aplikace = aktuální, protože novější seznam
   je nadmnožinou), cokoli jiného (text, desetinné číslo, NaN, záporné) 0; bez souhlasu vždy 0. */
export function normalizeConsentVersion(v: unknown, consentAt: number): number {
  if (!(consentAt > 0) || typeof v !== 'number' || !Number.isInteger(v)) return 0;
  return clampInt(v, 0, AI_CONSENT_VERSION);
}

/* Normalizace při načtení a importu: jen známé hodnoty a meze. Zapnuto jen se souhlasem. */
export function normalizeAi(raw: unknown): AiPrefs {
  const r = isObj(raw) ? raw : {};
  const d = emptyAi();
  d.consentAt = typeof r.consentAt === 'number' && Number.isFinite(r.consentAt) ? clampInt(r.consentAt, 0, 9e15) : 0;
  d.consentVersion = normalizeConsentVersion(r.consentVersion, d.consentAt);
  d.on = r.on === true && d.consentAt > 0;
  if (isAiProvider(r.provider)) d.provider = r.provider;
  if (modelOk(r.model)) d.model = r.model;
  if (typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day)) {
    d.day = r.day;
    d.count = r.count === undefined ? 0 : clampInt(r.count, 0, AI_COUNT_MAX);
  }
  return d;
}
export const modelOf = (p: AiPrefs): string => p.model || providerDef(p.provider).model;
export const todayCount = (p: AiPrefs, today: string): number => (p.day === today ? p.count : 0);

/* ----- otázka ----- */
/* 0.31.0 (fáze 2): quests = úkoly a dílna, raid = příprava na raid (AI Raid Planner), postRaid = shrnutí po raidu.
   0.32.0 (fáze 3): stats = osobní analytika z deníku raidů (Personal AI Analyst). */
export type AiKind = 'free' | 'item' | 'advisor' | 'quests' | 'raid' | 'postRaid' | 'stats';
export const AI_KINDS: readonly AiKind[] = ['free', 'item', 'advisor', 'quests', 'raid', 'postRaid', 'stats'];
export const isAiKind = (v: unknown): v is AiKind => typeof v === 'string' && (AI_KINDS as readonly string[]).includes(v);
export const AI_Q_MAX = 500;
export const AI_REF_MAX = 80;
export interface AiAsk { question: string; kind: AiKind; ref: string }
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

/* 0.31.0: odkaz otázky na úkol nebo stanici (Úkoly, Workshop); id jako v datech (písmena, číslice, _ . -). */
export const QUESTS_REF_RE = /^(quest|station):[A-Za-z0-9_.-]{1,80}$/;
/* 0.32.0: odkaz analytiky na mapu (řádek mapy ve Statistics): map:<id mapy>. */
export const STATS_REF_RE = /^map:[a-z0-9_-]{1,40}$/;
/* Nejdelší odkaz podle druhu (0 = bez odkazu); stejné meze hlídají argumenty relay (aiAskArgsOk). */
export const AI_REF_LIMIT: Readonly<Record<AiKind, number>> = { free: 0, item: AI_REF_MAX, advisor: 121, quests: 88, raid: 0, postRaid: 0, stats: 44 };

/* Otázka z UI nebo z overlaye (relay): text 1–AI_Q_MAX znaků, druh z pevného výčtu, odkaz podle druhu (název
   předmětu do AI_REF_MAX znaků, id tipu rádce, u úkolů a dílny volitelně quest:<id> nebo station:<id>; u volné
   otázky, přípravy na raid a shrnutí po raidu nic; 0.32.0: u analytiky volitelně map:<id>). Cokoli jiného = null. */
export function normalizeAsk(question: unknown, kind: unknown, ref: unknown): AiAsk | null {
  if (typeof question !== 'string' || !isAiKind(kind)) return null;
  const q = question.replace(CONTROL, ' ').trim();
  if (!q || q.length > AI_Q_MAX) return null;
  const empty = ref === undefined || ref === '' || ref === null;
  if (AI_REF_LIMIT[kind] === 0) return empty ? { question: q, kind, ref: '' } : null;
  if ((kind === 'quests' || kind === 'stats') && empty) return { question: q, kind, ref: '' };
  if (typeof ref !== 'string') return null;
  const r = ref.trim();
  if (r.length > AI_REF_LIMIT[kind]) return null;
  if (kind === 'item') return r && !/[\u0000-\u001f\u007f<>]/.test(r) ? { question: q, kind, ref: r } : null;
  if (kind === 'quests') return QUESTS_REF_RE.test(r) ? { question: q, kind, ref: r } : null;
  if (kind === 'stats') return STATS_REF_RE.test(r) ? { question: q, kind, ref: r } : null;
  return TIP_ID_RE.test(r) ? { question: q, kind, ref: r } : null;
}

/* ----- chyby ----- */
export const AI_ERRORS = [
  'off', 'consent', 'reconsent', 'noKey', 'badKey', 'quota', 'offline', 'timeout', 'inRaid', 'game', 'tooLong', 'busy', 'rate', 'daily',
  'server', 'request', 'model', 'reply', 'empty', 'input', 'window', 'keyStore', 'tooBig', 'unavailable',
] as const;
export type AiError = (typeof AI_ERRORS)[number];
export const isAiError = (v: unknown): v is AiError => typeof v === 'string' && (AI_ERRORS as readonly string[]).includes(v);
/* Kód chyby z Rustu (ai:<kód>) → chyba UI; cokoli neznámého = chyba služby. Text chyby se nikdy nezobrazí. */
export function mapAiError(e: unknown): AiError {
  const s = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  const m = /^ai:([A-Za-z]+)$/.exec(s);
  return m && isAiError(m[1]) ? m[1] : 'server';
}
/* Došel dotaz až k poskytovateli? (počítá se do dnešního počtu) */
export const reachedProvider = (e: AiError | null): boolean =>
  e === null || ['badKey', 'quota', 'server', 'request', 'model', 'reply', 'empty', 'timeout'].includes(e);

/* ----- kdy se smí ptát ----- */
/* Co hlavní okno ví o hře: hlídání odpovědělo (known), běží, je vidět v popředí, a poslední obrazovka z pásu
   s nadpisy při automatickém snímání (null = žádná známá, 'inRaid' = inventář v raidu). */
export interface GameInfo { known: boolean; running: boolean; visible: boolean; screen: string | null }
export type AiOrigin = 'main' | 'overlay';

/* V raidu? Průběh raidu „v raidu“ platí vždy. Z hlavního okna (hra není v popředí, hráč píše na ploše) se jinak
   ptát smí. Z overlaye nad hrou jen tehdy, když aplikace ví, že hráč v raidu není: hra neběží, nebo automatické
   snímání naposledy vidělo obrazovku menu (STASH, profil, dílna, úkoly, skill tree, loadout, výsledek raidu).
   Jinak (snímání vypnuté, hlavní obrazovka hry, nejistota) se to bere jako raid. */
export function inRaidRisk(s: AppState, game: GameInfo, origin: AiOrigin): boolean {
  if (s.raidLife.phase === 'inRaid') return true;
  if (origin === 'main') return false;
  if (game.known && !game.running) return false;
  if (s.raidLife.phase === 'loadout') return true;
  if (autoActive(s) && isRustScreen(game.screen)) return false;
  return true;
}

/* Proč se teď ptát nejde (null = jde). Nejdřív nastavení (0.32.0: i souhlas se starším seznamem údajů = znovu
   souhlasit), pak klíč, pak raid. */
export function aiBlock(s: AppState, o: { origin: AiOrigin; game: GameInfo; hasKey: boolean }): AiError | null {
  if (!s.ai.consentAt) return 'consent';
  if (!consentCurrent(s.ai)) return 'reconsent';
  if (!s.ai.on) return 'off';
  if (!o.hasKey) return 'noKey';
  if (inRaidRisk(s, o.game, o.origin)) return 'inRaid';
  return null;
}

/* 0.32.0: nápověda pod textem chyby (jen z kódu chyby a nastavení, nikdy z textu služby): model nenalezen = výchozí
   model služby; prázdná odpověď (model s uvažováním vyčerpal limit; Rust už jednou zkusil bez reasoning_effort) =
   zkusit znovu, nebo jiný model. */
export interface AiErrorHint { key: 'ai.hint.model' | 'ai.hint.empty' | 'ai.hint.emptyDefault'; params: { model: string; provider: string; def: string } }
export function aiErrorHint(e: AiError | null, p: Pick<AiPrefs, 'provider' | 'model'>): AiErrorHint | null {
  const def = providerDef(p.provider);
  const params = { model: p.model || def.model, provider: def.name, def: def.model };
  if (e === 'model') return { key: 'ai.hint.model', params };
  if (e === 'empty') return { key: p.model && p.model !== def.model ? 'ai.hint.empty' : 'ai.hint.emptyDefault', params };
  return null;
}

/* ----- text odpovědi ----- */
export const ANSWER_MAX = 1200;
export const BUBBLE_MAX = 180;
/* Prostý text pro zobrazení: bez řídicích znaků, značek HTML, Markdownu a odkazů (z [text](url) zůstane text,
   holá adresa se vynechá), nejvýš ANSWER_MAX znaků. Vykresluje se jen jako text (React), nikdy jako HTML. */
export function plainAnswer(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : '';
  s = s.replace(/\r\n?/g, '\n').replace(CONTROL, ' ');
  s = s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
  s = s.replace(/<[^>]{0,200}>/g, '');
  s = s.replace(/!?\[([^\]]{0,200})\]\([^)]{0,500}\)/g, '$1');
  s = s.replace(/\b(?:https?|ftp|file|javascript|data|vbscript):\S*/gi, '');
  s = s.replace(/\bwww\.[^\s)]+/gi, '');
  s = s.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '');
  s = s.replace(/(\*\*|__|\*|_|`|~~)(?=\S)([^\n]*?\S)\1/g, '$2').replace(/[`*]{2,}/g, '');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > ANSWER_MAX) s = s.slice(0, ANSWER_MAX - 1).trimEnd() + '…';
  return s;
}
/* Krátká verze do bubliny Opse: první věty do BUBBLE_MAX znaků. */
export function bubbleText(answer: string): string {
  const one = answer.replace(/\s+/g, ' ').trim();
  if (one.length <= BUBBLE_MAX) return one;
  const parts = one.match(/[^.!?…]+[.!?…]+(\s|$)/g) ?? [];
  let out = '';
  for (const p of parts) { if ((out + p).trim().length > BUBBLE_MAX) break; out += p; }
  out = out.trim();
  return out || one.slice(0, BUBBLE_MAX - 1).trimEnd() + '…';
}
