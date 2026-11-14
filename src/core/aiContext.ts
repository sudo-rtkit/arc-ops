/* 0.30.0: data pro AI asistenta. Model nedostane žádné nástroje: aplikace podle druhu otázky sama složí malý balík
   údajů ze stávajících deterministických výpočtů a pošle ho jako data, ne jako pokyny.
   - Předmět (karta předmětu, tlačítko „Zeptat se Opse“): údaje z karty předmětu (itemCard), rada nech / prodej /
     recykluj, potřeby úkolů, stanic a projektů, zásoba a obsazenost bedny.
   - „Co dál?“ (tlačítko „Proč?“): tipy rádce s důvodem a čísla, ze kterých vychází.
   - Volná otázka: obojí (předměty jen ty, které otázka jmenuje), omezené velikostí.
   Nikdy se neposílá: snímek obrazovky, jména jiných hráčů (deník raidů, poznámky a body map vůbec), celá záloha,
   cesty k souborům, e-maily, kód relace ani jiné dlouhé tokeny. Každý text projde safeText (bez řídicích znaků,
   bez < a >, které by mohly ukončit blok dat, bez adres, cest, e-mailů a tokenů, omezená délka).
   Otázka a data jsou v ohraničených blocích <question> a <app_data>; pokyny modelu (aiPrompts.ts) říkají, že obsah
   bloků jsou data, ne pokyny. Každý údaj má zdroj pro seznam pod odpovědí (původ hodnoty z 0.21.0 a jistota). */
import type { AppState, Lang, OpsPersonality } from './types';
import type { AdvisorTip } from './advisor';
import type { ProvRec } from './provenance';
import { itemCard } from './itemCard';
import { catalogItems } from './catalog';
import { QUESTS, questName, questStatus } from './quests';
import { tl, type Key, type MsgRef } from '../i18n/core';
import { aiSystemPrompt } from '../i18n/aiPrompts';
import type { AiAsk } from './ai';

export interface AiMessage { role: 'system' | 'user'; content: string }
/* Zdroj pod odpovědí. rec: původ hodnoty (null = výchozí, nikdy nezadaná); undefined = spočítala aplikace. */
export interface AiSource { id: string; kind: 'item' | 'stock' | 'need' | 'advice' | 'stash' | 'tip' | 'profile'; label: string; rec?: ProvRec | null }
export interface AiContext { messages: AiMessage[]; sources: AiSource[]; dataChars: number }

/* Nejvýš tolik znaků dat (JSON) v jednom dotazu; zprávy dohromady musí pod mez Rustu (24 KB). */
export const CONTEXT_MAX = 12_000;
const STR_MAX = 120;

/* Text do dat: bez řídicích znaků, bez < > (blok dat nejde ukončit), bez adres, cest, e-mailů a dlouhých tokenů. */
export function safeText(v: unknown, max = STR_MAX): string {
  let s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  s = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[link]');
  s = s.replace(/(?:\b[A-Za-z]:[\\/]|\\\\|(?:^|\s)\/(?:Users|home|mnt|var|tmp|etc)\/)\S*/g, ' [path]');
  s = s.replace(/[A-Za-z0-9_-]{24,}/g, m => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[redacted]' : m));
  s = s.replace(/</g, '‹').replace(/>/g, '›');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const day = (at: number): string | null => (at > 0 ? new Date(at).toISOString().slice(0, 10) : null);
const origin = (rec: ProvRec | null) => (rec ? { source: rec.src, date: day(rec.at), confidence: rec.conf ?? null, verified: rec.ver } : { source: 'default' });

/* ----- předmět ----- */
function itemBundle(s: AppState, name: string, lang: Lang, today: string, src: AiSource[], full: boolean) {
  const c = itemCard(s, name, lang, today);
  const L = (k: Key, p?: Record<string, string | number>) => tl(lang, k, p);
  src.push({ id: 'item:' + c.name, kind: 'item', label: L('ai.src.item', { name: safeText(c.name) }) });
  src.push({ id: 'stock:' + c.name, kind: 'stock', label: L('ai.src.stock', { name: safeText(c.name), count: c.have }), rec: c.origin });
  if (c.need > 0 || c.needs.length) src.push({ id: 'need:' + c.name, kind: 'need', label: L('ai.src.need', { name: safeText(c.name), count: c.need }) });
  src.push({ id: 'advice:' + c.name, kind: 'advice', label: L('ai.src.advice', { name: safeText(c.name) }) });
  const needRow = (n: (typeof c.needs)[number]) => ({ for: safeText(n.label, 60), kind: n.kind, qty: n.qty, ...(n.questItem ? { foundInRaid: true } : {}) });
  const v = c.verdict;
  const advice = v.basis === 'stock'
    ? {
        basis: 'inStock', verdict: v.advice.kind, keepCount: v.advice.keep, surplus: v.advice.surplus, surplusVerdict: v.advice.rest,
        playerOverrideKeep: v.advice.override, reasons: v.advice.reasons.slice(0, 8).map(r => ({ for: safeText(r.label, 60), qty: r.qty })),
        recycleInto: v.advice.recycle.slice(0, 8).map(r => ({ name: safeText(r.name, 60), qty: r.qty, missingMaterial: r.needed })),
        sellValueEach: num(v.advice.value), valuePerSlot: num(v.advice.valuePerSlot), slotsFreedBySurplus: v.advice.slotsFreed, surplusValue: num(v.advice.surplusValue),
      }
    : {
        basis: 'ifFound', verdict: v.verdict.kind, need: v.verdict.need, have: v.verdict.have, missing: v.verdict.missing,
        reasons: v.verdict.reasons.slice(0, 8).map(r => ({ for: safeText(r.label, 60), qty: r.qty })), recycleInto: v.verdict.recycle.slice(0, 8).map(x => safeText(x, 60)),
        sellValueEach: num(v.verdict.value), inRaidPlan: v.verdict.inPlan,
      };
  const now = c.needs.filter(n => n.when === 'now'), later = c.needs.filter(n => n.when === 'later');
  return {
    name: safeText(c.name), knownInAppData: c.known, type: c.type ? safeText(c.type, 40) : null, rarity: c.rarity,
    sellValue: num(c.value), weightKg: num(c.weight), stackSize: num(c.stack),
    blueprint: c.blueprint.is ? { learned: c.blueprint.learned } : null, craftNeedsBlueprint: c.needsBlueprint,
    have: c.have, stockOrigin: origin(c.origin), neededNow: c.need, missingNow: c.missing,
    needsNow: now.slice(0, full ? 10 : 5).map(needRow), needsLater: later.slice(0, full ? 6 : 3).map(needRow),
    advice, recycleOutputs: c.recycle.slice(0, 8).map(([n, q]) => ({ name: safeText(n, 60), qty: q })),
    activeRaidPlan: c.plan ? { need: c.plan.need, have: c.plan.have, missing: c.plan.missing, markedFound: c.plan.found } : null,
  };
}

/* ----- „Co dál?“ ----- */
function advisorBundle(s: AppState, tips: AdvisorTip[], askedId: string, lang: Lang, src: AiSource[], max: number) {
  const m = (r: MsgRef) => safeText(tl(lang, r.key, r.params), 160);
  const asked = tips.find(x => x.id === askedId);
  const list = (asked ? [asked, ...tips.filter(x => x !== asked)] : tips).slice(0, max);
  for (const tip of list) src.push({ id: 'tip:' + tip.id, kind: 'tip', label: tl(lang, 'ai.src.tip', { title: m(tip.title) }) });
  src.push({ id: 'profile', kind: 'profile', label: tl(lang, 'ai.src.profile') });
  const active = QUESTS.filter(q => questStatus(q, s.quests.done) === 'active');
  const pinned = s.quests.pinned.map(id => QUESTS.find(q => q.id === id)).filter(q => !!q).slice(0, 5).map(q => safeText(questName(q!, lang), 60));
  return {
    nextSteps: list.map((tip, i) => ({
      rank: i + 1, askedAbout: tip.id === askedId, rule: tip.rule, priority: tip.score,
      title: m(tip.title), detail: m(tip.detail), why: m(tip.reason),
    })),
    player: {
      level: s.profile.level, coins: s.profile.coins, materialKinds: Object.keys(s.inventory).length,
      materialPieces: Object.values(s.inventory).reduce((a, b) => a + b, 0), activeQuests: active.length, pinnedQuests: pinned,
    },
  };
}

/* Předměty, které volná otázka jmenuje (nejdelší názvy napřed, nejvýš dva). */
export function itemsInQuestion(s: AppState, q: string, max = 2): string[] {
  const text = ' ' + q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const names = new Set<string>([...catalogItems().map(c => c.name), ...Object.keys(s.inventory), ...Object.values(s.items).map(i => i.key)]);
  const out: string[] = [];
  for (const n of [...names].filter(n => n.length >= 3).sort((a, b) => b.length - a.length)) {
    const k = ' ' + n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
    if (k.trim() && text.includes(k) && !out.some(o => o.toLowerCase().includes(n.toLowerCase()))) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

const stashBundle = (s: AppState, lang: Lang, src: AiSource[]) => {
  const st = s.vision.stash;
  if (!st) return null;
  src.push({ id: 'stash', kind: 'stash', label: tl(lang, 'ai.src.stash', { used: st.used, max: st.max }), rec: { src: 'screenshot-hotkey', at: st.at, ver: false } });
  return { usedSlots: st.used, maxSlots: st.max, readOn: day(st.at) };
};

/* Celý dotaz: pokyny (povaha a jazyk), otázka a data v ohraničených blocích. Data se zmenšují, dokud nejsou pod
   CONTEXT_MAX znaků. */
export function buildAiContext(s: AppState, ask: AiAsk, o: { lang: Lang; personality: OpsPersonality; now: number; today: string; tips: AdvisorTip[] }): AiContext {
  let data = '';
  let sources: AiSource[] = [];
  for (const level of [0, 1, 2, 3]) {
    const src: AiSource[] = [];
    const full = level === 0;
    const bundle: Record<string, unknown> = { app: 'ARC Raiders Companion', language: o.lang, date: o.today };
    if (ask.kind === 'item') bundle.item = itemBundle(s, ask.ref, o.lang, o.today, src, full);
    if (ask.kind === 'free' && level < 3) {
      const items = itemsInQuestion(s, ask.question, level < 2 ? 2 : 1);
      if (items.length) bundle.items = items.map(n => itemBundle(s, n, o.lang, o.today, src, full));
    }
    if (ask.kind !== 'item' || level === 0) {
      bundle.advisor = advisorBundle(s, o.tips, ask.kind === 'advisor' ? ask.ref : '', o.lang, src, level === 0 ? 5 : level === 1 ? 3 : 1);
    }
    bundle.stash = stashBundle(s, o.lang, src);
    data = JSON.stringify(bundle);
    sources = src;
    if (data.length <= CONTEXT_MAX) break;
  }
  if (data.length > CONTEXT_MAX) data = JSON.stringify({ app: 'ARC Raiders Companion', note: 'data too large' });
  const question = safeText(ask.question, 600);
  const kind = ask.kind === 'item' ? 'item' : ask.kind === 'advisor' ? 'next-steps' : 'question';
  const user = `<question>\n${question}\n</question>\n<app_data kind="${kind}">\n${data}\n</app_data>`;
  return { messages: [{ role: 'system', content: aiSystemPrompt(o.lang, o.personality) }, { role: 'user', content: user }], sources: dedupe(sources), dataChars: data.length };
}

const dedupe = (src: AiSource[]): AiSource[] => { const seen = new Set<string>(); return src.filter(x => !seen.has(x.id) && !!seen.add(x.id)).slice(0, 16); };
/* Velikost zpráv v bajtech UTF-8 (mez Rustu je 24 KB). */
export const messagesBytes = (m: AiMessage[]): number => m.reduce((a, x) => a + new TextEncoder().encode(x.content).length, 0);
export const MESSAGES_MAX_BYTES = 24 * 1024;
