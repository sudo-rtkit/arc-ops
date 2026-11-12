/* Minihry (0.11.0): Stash Tetris a recyklační kvíz. Jen pro chvíle mimo raid (čekání na zápas, menu): modul
   se otevírá jen na přání hráče, nic se nenabízí samo a nad hrou nic nevyskakuje. Odměny jsou jen kosmetické
   (nátěry Opse v šatníku); výsledek nikdy nemění herní data. Kolo je dané číslem v adrese (#games/tetris-123456),
   takže jde zopakovat. Ovládání myší i klávesnicí (šipky, Enter, R = otočit, Delete = vyndat, Esc = pustit). */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, Brain, Check, Package, Palette, RotateCw, Shuffle, Trash2, Trophy, X } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { Badge, Btn, PageHead, Panel, cx } from '../ui/components';
import { useT } from '../i18n/react';
import { formatInt, type Key } from '../i18n';
import { QUIZ_LEN, newSeed, tetrisPct, validSeed, type GameOutcome } from '../core/minigames';
import { canPlace, density, dims, greedy, makeRound, occupancy, place, removeItem, scoreOf, tipsFor, type LootItem, type Placement, type TetrisRound, type Tip } from '../core/stashTetris';
import { makeQuiz } from '../core/recycleQuiz';
import { ITEMS_DATE } from '../core/itemdb';
import { DEFAULT_PAINT, PAINTS } from '../core/paints';
import { resolveOutfit } from '../core/ops';
import { line, type LineRef } from '../core/opsVoice';
import type { SoundId } from '../core/opsSound';
import { OpsCanvas, type OpsHandle } from '../ops/OpsCanvas';
import { useOpsSpeech } from '../ops/speech';
import { mainSound } from '../ops/mainHub';
import { PaintSwatch, paintName, ruleText } from '../ui/paints';

type Game = 'tetris' | 'quiz';
type OnResult = (out: GameOutcome | null, value: string) => void;

function parseSub(sub: string): { game: Game | null; seed: number | null } {
  const m = /^(tetris|quiz)(?:-(\d+))?$/.exec(sub);
  if (!m) return { game: null, seed: null };
  return { game: m[1] as Game, seed: validSeed(m[2]) };
}
const startGame = (game: Game) => navigate('games', `${game}-${newSeed()}`);

/* ----- Ops v rohu modulu: reakce na výsledek kola ----- */
function OpsCorner({ said, ops }: { said: { line: LineRef | null; n: number }; ops: RefObject<OpsHandle | null> }) {
  const s = useAppState();
  const t = useT();
  const sp = useOpsSpeech(said.line, s.opsPrefs.personality, t.lang, { ops, nonce: said.n });
  return (
    <div className="mg-ops" data-testid="games-ops">
      <OpsCanvas ref={ops} variant="detail" fit scale={1} level={s.profile.level} outfit={resolveOutfit(s.profile.level, s.buddy)} paint={s.games.paint}
        label={t('ops.previewAria')} restAnim={sp.talking ? 'talk' : 'idle'} />
      <p className={cx('mg-speech', !sp.text && 'muted')} role="status" aria-label={t('ops.speechAria')} data-testid="ops-line">{sp.text || t('games.opsIdle')}</p>
    </div>
  );
}

/* ----- rozcestník ----- */
function Hub() {
  const t = useT();
  const g = useAppState().games;
  return (
    <>
      <div className="mg-cards">
        <Panel title={t('games.tetris.name')} className="mg-card" actions={<Package size={18} aria-hidden="true" className="accent" />}>
          <p className="secondary-text">{t('games.tetris.desc')}</p>
          <dl className="mg-stats" data-testid="games-tetris-stats">
            <div><dt>{t('games.best')}</dt><dd className="mono">{formatInt(t.lang, g.tetris.best)}</dd></div>
            <div><dt>{t('games.bestPct')}</dt><dd className="mono">{t('games.pct', { pct: g.tetris.bestPct })}</dd></div>
            <div><dt>{t('games.played')}</dt><dd className="mono">{formatInt(t.lang, g.tetris.played)}</dd></div>
          </dl>
          <div className="row"><Btn variant="primary" icon={Package} onClick={() => startGame('tetris')} data-testid="games-play-tetris">{t('games.play')}</Btn></div>
        </Panel>
        <Panel title={t('games.quiz.name')} className="mg-card" actions={<Brain size={18} aria-hidden="true" className="accent" />}>
          <p className="secondary-text">{t('games.quiz.desc')}</p>
          <dl className="mg-stats" data-testid="games-quiz-stats">
            <div><dt>{t('games.best')}</dt><dd className="mono">{t('games.q.of', { n: g.quiz.best, total: QUIZ_LEN })}</dd></div>
            <div><dt>{t('games.bestStreak')}</dt><dd className="mono">{formatInt(t.lang, g.quiz.bestStreak)}</dd></div>
            <div><dt>{t('games.played')}</dt><dd className="mono">{formatInt(t.lang, g.quiz.played)}</dd></div>
          </dl>
          <div className="row"><Btn variant="primary" icon={Brain} onClick={() => startGame('quiz')} data-testid="games-play-quiz">{t('games.play')}</Btn></div>
        </Panel>
      </div>
      <Panel title={t('games.paints')} actions={<a className="btn sm" href="#settings/wardrobe"><Palette size={16} aria-hidden="true" />{t('games.toWardrobe')}</a>}>
        <p className="secondary-text">{t('games.paintsHint')}</p>
        <ul className="mg-paints" data-testid="games-paints">
          {PAINTS.map(p => {
            const open = p.id === DEFAULT_PAINT || g.paints.includes(p.id);
            return (
              <li key={p.id} className={cx(!open && 'locked')} data-paint={p.id} data-unlocked={open ? 'yes' : 'no'}>
                <PaintSwatch id={p.id} />
                <span className="grow"><b>{paintName(t, p.id)}</b><small>{ruleText(t, p.rule)}</small></span>
                {g.paint === p.id ? <Badge tone="accent">{t('games.worn')}</Badge> : open ? <Badge tone="success">{t('games.unlocked')}</Badge> : <Badge tone="muted">{t('games.locked')}</Badge>}
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}

/* ----- Stash Tetris ----- */
const rarityKey = (r: string) => `ops.rarity.${r}` as Key;

function Bag({ round, placements, label, testId, interactive }: {
  round: TetrisRound; placements: Placement[]; label: string; testId: string;
  interactive?: {
    sel: LootItem | null; rot: boolean; cursor: number; anchor: number | null;
    onCell: (i: number) => void; onHover: (i: number | null) => void; onKey: (e: ReactKeyboardEvent, i: number) => void;
    onFocusCell: (i: number) => void; onBlurGrid: () => void; onRotate: () => void; cellRefs: RefObject<(HTMLButtonElement | null)[]>;
  };
}) {
  const t = useT();
  const byId = new Map(round.items.map(i => [i.id, i]));
  const grid = occupancy(round, placements);
  const ia = interactive;
  let ghost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  if (ia?.sel && ia.anchor !== null) {
    const x = ia.anchor % round.cols, y = Math.floor(ia.anchor / round.cols);
    const [w, h] = dims(ia.sel, ia.rot);
    ghost = { x, y, w: Math.min(w, round.cols - x), h: Math.min(h, round.rows - y), ok: canPlace(round, placements, ia.sel, x, y, ia.rot) };
  }
  return (
    <div className="mg-bag" style={{ ['--cols' as string]: String(round.cols), ['--rows' as string]: String(round.rows) }} data-testid={testId}
      role={ia ? 'grid' : 'img'} aria-label={label} onMouseLeave={() => ia?.onHover(null)}
      onContextMenu={ia ? e => { e.preventDefault(); ia.onRotate(); } : undefined}
      onBlur={ia ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ia.onBlurGrid(); } : undefined}>
      {grid.map((id, i) => {
        const x = i % round.cols, y = Math.floor(i / round.cols);
        const style = { gridColumn: x + 1, gridRow: y + 1 };
        const it = id ? byId.get(id) : undefined;
        const aria = it ? t('games.t.cellItem', { row: y + 1, col: x + 1, name: it.name }) : t('games.t.cellEmpty', { row: y + 1, col: x + 1 });
        if (!ia) return <span key={i} className="mg-cell" style={style} />;
        return (
          <button key={i} type="button" className="mg-cell" style={style} data-cell={i} aria-label={aria} tabIndex={ia.cursor === i ? 0 : -1}
            ref={el => { ia.cellRefs.current[i] = el; }}
            onClick={() => ia.onCell(i)} onMouseEnter={() => ia.onHover(i)} onFocus={() => ia.onFocusCell(i)} onKeyDown={e => ia.onKey(e, i)} />
        );
      })}
      {placements.map(p => {
        const it = byId.get(p.id);
        if (!it) return null;
        const [w, h] = dims(it, p.rot);
        return (
          <div key={p.id} className={cx('mg-item', 'r-' + it.rarity)} style={{ gridColumn: `${p.x + 1} / span ${w}`, gridRow: `${p.y + 1} / span ${h}` }} data-item={it.name} aria-hidden="true">
            <b>{it.name}</b><span className="mono">{formatInt(t.lang, it.value)}</span>
          </div>
        );
      })}
      {ghost && <div className={cx('mg-ghost', ghost.ok ? 'ok' : 'bad')} style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}` }} aria-hidden="true" data-testid="games-ghost" data-ok={ghost.ok ? 'yes' : 'no'} />}
    </div>
  );
}

interface TetrisDone { score: number; greedy: number; pct: number; tips: Tip[]; greedyPlacements: Placement[] }

function Tetris({ seed, react }: { seed: number; react: OnResult }) {
  const t = useT();
  const round = useMemo(() => makeRound(seed), [seed]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [rot, setRot] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [gridFocus, setGridFocus] = useState(false);
  const [live, setLive] = useState('');
  const [done, setDone] = useState<TetrisDone | null>(null);
  const [showOps, setShowOps] = useState(false);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const sel = selId ? round.items.find(i => i.id === selId) ?? null : null;
  const inBag = new Set(placements.map(p => p.id));
  const score = scoreOf(round, placements);
  const free = occupancy(round, placements).filter(c => c === null).length;
  const anchor = hover ?? (gridFocus ? cursor : null);

  const rotate = () => {
    if (!sel || done) return;
    setRot(r => !r);
    setLive(t('games.t.rotated', { name: sel.name }));
  };
  const select = (it: LootItem) => {
    if (done) return;
    if (selId === it.id) { setSelId(null); setLive(t('games.t.released')); return; }
    if (inBag.has(it.id)) {
      const p = placements.find(x => x.id === it.id)!;
      setPlacements(removeItem(placements, it.id));
      setRot(p.rot);
    } else setRot(false);
    setSelId(it.id);
    setLive(t('games.t.picked', { name: it.name }));
  };
  const onCell = (i: number) => {
    if (done) return;
    setCursor(i);
    const x = i % round.cols, y = Math.floor(i / round.cols);
    if (sel) {
      const next = place(round, placements, sel.id, x, y, rot);
      if (!next) { setLive(t('games.t.noFit', { name: sel.name })); return; }
      setPlacements(next); setSelId(null); setRot(false);
      setLive(t('games.t.placed', { name: sel.name, value: scoreOf(round, next) }));
      return;
    }
    const id = occupancy(round, placements)[i];
    if (id) {
      const p = placements.find(x => x.id === id)!;
      setPlacements(removeItem(placements, id)); setSelId(id); setRot(p.rot);
      setLive(t('games.t.picked', { name: round.items.find(x => x.id === id)!.name }));
    }
  };
  const removeAt = (i: number) => {
    const id = occupancy(round, placements)[i];
    if (!id || done) return;
    setPlacements(removeItem(placements, id));
    setLive(t('games.t.removed', { name: round.items.find(x => x.id === id)!.name }));
  };
  const moveCursor = (i: number) => { setCursor(i); cellRefs.current[i]?.focus(); };
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const x = i % round.cols, y = Math.floor(i / round.cols);
    const go = (nx: number, ny: number) => { e.preventDefault(); moveCursor(Math.min(round.rows - 1, Math.max(0, ny)) * round.cols + Math.min(round.cols - 1, Math.max(0, nx))); };
    if (e.key === 'ArrowLeft') go(x - 1, y);
    else if (e.key === 'ArrowRight') go(x + 1, y);
    else if (e.key === 'ArrowUp') go(x, y - 1);
    else if (e.key === 'ArrowDown') go(x, y + 1);
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeAt(i); }
  };
  /* R = otočit, Esc = pustit vybraný předmět (kdekoli v Tetrisu mimo pole formuláře) */
  const onRootKey = (e: ReactKeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(); }
    else if (e.key === 'Escape' && sel) { e.preventDefault(); setSelId(null); setRot(false); setLive(t('games.t.released')); }
  };
  const finish = () => {
    if (done) return;
    const g = greedy(round);
    const pct = tetrisPct(score, g.score);
    const d: TetrisDone = { score, greedy: g.score, pct, tips: tipsFor(round, placements), greedyPlacements: g.placements };
    setDone(d); setSelId(null);
    react(actions.finishGame({ game: 'tetris', score, greedy: g.score }), formatInt(t.lang, score));
    setTimeout(() => resultRef.current?.focus(), 0);
  };

  return (
    <div className="mg-tetris" onKeyDown={onRootKey} data-testid="games-tetris" data-seed={seed}>
      <p className="meta" role="note" data-testid="games-shapes-note">{t('games.t.shapes')}</p>
      <div className="mg-board">
        <Panel title={t('games.t.bag', { cols: round.cols, rows: round.rows })} className="mg-bag-panel"
          actions={<span className="mono" data-testid="games-score">{t('games.t.valueOf', { value: score })}</span>}>
          <Bag round={round} placements={placements} label={t('games.t.bagAria', { cols: round.cols, rows: round.rows })} testId="games-bag"
            interactive={done ? undefined : {
              sel, rot, cursor, anchor, onCell, onKey, cellRefs, onRotate: rotate,
              onHover: setHover, onFocusCell: i => { setCursor(i); setGridFocus(true); }, onBlurGrid: () => setGridFocus(false),
            }} />
          <p className="meta">{t('games.t.free', { count: free })}</p>
          <p className="sr-only" aria-live="polite" data-testid="games-live">{live}</p>
          {!done && (
            <div className="row">
              <Btn icon={RotateCw} onClick={rotate} disabled={!sel} data-testid="games-rotate">{t('games.t.rotate')}</Btn>
              <Btn variant="ghost" icon={Trash2} onClick={() => { setPlacements([]); setSelId(null); setLive(t('games.t.cleared')); }} disabled={!placements.length}>{t('games.t.clear')}</Btn>
              <Btn variant="primary" icon={Check} onClick={finish} data-testid="games-finish">{t('games.t.finish')}</Btn>
            </div>
          )}
          {!done && <p className="meta">{t('games.t.help')}</p>}
        </Panel>
        <Panel title={t('games.t.loot')} className="mg-loot-panel">
          <p className="meta" data-testid="games-selected">{sel ? t('games.t.selected', { name: sel.name, size: sizeText(sel, rot) }) : t('games.t.none')}</p>
          <ul className="mg-loot" aria-label={t('games.t.loot')}>
            {round.items.map(it => (
              <li key={it.id}>
                <button type="button" className={cx('mg-loot-item', 'r-' + it.rarity, selId === it.id && 'selected', inBag.has(it.id) && 'packed')} aria-pressed={selId === it.id}
                  disabled={!!done} onClick={() => select(it)} data-item={it.name}
                  aria-label={t('games.t.itemAria', { name: it.name, size: sizeText(it, false), value: it.value, per: density(it), rarity: t(rarityKey(it.rarity)) }) + (inBag.has(it.id) ? ' · ' + t('games.t.inBag') : '')}>
                  <span className="mg-rarity" aria-hidden="true" />
                  <span className="mg-main"><b>{it.name}</b>
                    <small><span className="mono">{sizeText(it, false)}</span> · {it.type} · {t(rarityKey(it.rarity))}{inBag.has(it.id) && <> · <span className="mg-good">{t('games.t.inBag')}</span></>}</small></span>
                  <span className="mg-val mono" aria-hidden="true">{formatInt(t.lang, it.value)}<small>{t('games.t.perSlot', { value: density(it) })}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {done && (
        <Panel title={t('games.t.result')} className="mg-result">
          <h3 ref={resultRef} tabIndex={-1} data-testid="games-result">{t('games.t.resultLine', { you: done.score, ops: done.greedy })}</h3>
          <p className={cx('mg-pct', done.pct >= 100 ? 'mg-good' : 'amber')} data-testid="games-pct">{t('games.t.pctOfOps', { pct: done.pct })}</p>
          <h4>{t('games.t.tips')}</h4>
          <ul className="mg-tips" data-testid="games-tips">{done.tips.map((tip, i) => <li key={i}>{t(tip.key, tip.params)}</li>)}</ul>
          <div className="row">
            <Btn onClick={() => setShowOps(v => !v)} aria-expanded={showOps}>{t(showOps ? 'games.t.hideOps' : 'games.t.showOps')}</Btn>
            <Btn variant="primary" icon={Shuffle} onClick={() => startGame('tetris')} data-testid="games-next-round">{t('games.newRound')}</Btn>
          </div>
          {showOps && <Bag round={round} placements={done.greedyPlacements} label={t('games.t.opsBag')} testId="games-ops-bag" />}
        </Panel>
      )}
    </div>
  );
}
const sizeText = (it: LootItem, rot: boolean) => { const [w, h] = dims(it, rot); return `${w}×${h}`; };

/* ----- recyklační kvíz ----- */
function Quiz({ seed, react }: { seed: number; react: OnResult }) {
  const t = useT();
  const startStreak = useRef(useAppState().games.quiz.streak);
  const round = useMemo(() => makeQuiz(seed, t.lang), [seed, t.lang]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(startStreak.current);
  const [maxStreak, setMaxStreak] = useState(startStreak.current);
  const [done, setDone] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const optsRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const total = round.questions.length;
  const q = round.questions[i];

  const answer = (id: string) => {
    if (picked || done || !q) return;
    setPicked(id);
    if (id === q.answer) {
      setCorrect(c => c + 1);
      setStreak(s => { const n = s + 1; setMaxStreak(m => Math.max(m, n)); return n; });
    } else setStreak(0);
    setTimeout(() => nextRef.current?.focus(), 0);
  };
  const next = () => {
    if (!picked) return;
    if (i + 1 < total) { setI(i + 1); setPicked(null); setTimeout(() => optsRef.current?.querySelector('button')?.focus(), 0); return; }
    setDone(true);
    react(actions.finishGame({ game: 'quiz', correct, total, streak, maxStreak }), t('games.q.of', { n: correct, total }));
    setTimeout(() => resultRef.current?.focus(), 0);
  };
  /* klávesy 1–4 odpoví kdekoli na stránce kvízu (mimo pole formuláře); jen v tomto okně, nic globálního */
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKey.current = (e: KeyboardEvent) => {
    if (done || !q || picked || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= q.options.length) { e.preventDefault(); answer(q.options[n - 1].id); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (done) {
    return (
      <Panel title={t('games.q.result')} className="mg-result">
        <h3 ref={resultRef} tabIndex={-1} data-testid="games-result">{t('games.q.score', { n: correct, total })}</h3>
        <p className="meta" data-testid="games-streak">{t('games.q.streakNow', { count: streak })}</p>
        <div className="row"><Btn variant="primary" icon={Shuffle} onClick={() => startGame('quiz')} data-testid="games-next-round">{t('games.newRound')}</Btn></div>
      </Panel>
    );
  }
  if (!q) return null;
  const ok = picked === q.answer;
  return (
    <div className="mg-quiz" data-testid="games-quiz" data-seed={seed}>
      <Panel title={t('games.q.progress', { n: i + 1, total })} actions={<span className="mono" data-testid="games-quiz-score">{t('games.q.of', { n: correct, total })} · {t('games.q.streak', { count: streak })}</span>}>
        <p className="mg-question" data-testid="games-question" data-kind={q.kind}>{t(q.prompt.key, q.prompt.params)}</p>
        <div ref={optsRef} className={cx('mg-options', q.options.length === 2 && 'two')} role="group" aria-label={t('games.q.options')}>
          {q.options.map((o, k) => {
            const state = !picked ? '' : o.id === q.answer ? 'right' : o.id === picked ? 'wrong' : '';
            return (
              <button key={o.id} type="button" className={cx('mg-option', state)} disabled={!!picked} onClick={() => answer(o.id)} data-option={o.id}
                data-correct={picked ? (o.id === q.answer ? 'yes' : 'no') : undefined} aria-pressed={picked === o.id}>
                <kbd className="mono" aria-hidden="true">{k + 1}</kbd><span>{o.label}</span>
                {state === 'right' && <Check size={16} aria-hidden="true" />}{state === 'wrong' && <X size={16} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {picked && (
          <div className={cx('mg-explain', ok ? 'ok' : 'bad')} role="status" data-testid="games-explain">
            <b>{ok ? t('games.q.correct') : t('games.q.wrong', { answer: q.options.find(o => o.id === q.answer)!.label })}</b>
            <p>{t(q.explain.key, q.explain.params)}</p>
          </div>
        )}
        <div className="row">
          <button ref={nextRef} type="button" className="btn primary" onClick={next} disabled={!picked} data-testid="games-next">
            {i + 1 < total ? <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /> : <Trophy size={18} strokeWidth={1.75} aria-hidden="true" />}
            {t(i + 1 < total ? 'games.q.next' : 'games.q.finish')}
          </button>
        </div>
        <p className="meta">{t('games.q.help', { date: ITEMS_DATE })}</p>
      </Panel>
    </div>
  );
}

/* ----- modul ----- */
export default function Minigames({ sub }: { sub: string }) {
  const t = useT();
  const { game, seed } = parseSub(sub);
  const ops = useRef<OpsHandle | null>(null);
  const [said, setSaid] = useState<{ line: LineRef | null; n: number }>({ line: null, n: 0 });
  /* hra bez platného čísla kola dostane nové číslo */
  useEffect(() => { if (game && seed === null) startGame(game); }, [game, seed]);

  const react: OnResult = (out, value) => {
    if (!out) return;
    let l: LineRef, snd: SoundId | null = null;
    if (out.unlocked.length) { l = line('game.unlock', { name: out.unlocked.map(id => paintName(t, id)).join(', ') }); snd = 'unlock'; ops.current?.sparkle(); }
    else if (out.record) { l = line('game.record', { value }); snd = 'record'; }
    else if (out.win) { l = line('game.win'); snd = 'win'; }
    else l = line('game.done');
    setSaid(x => ({ line: l, n: x.n + 1 }));
    /* zvuk jen v aktivním okně (pravidla mainSound / soundAllowed) */
    if (snd) mainSound.play(snd);
  };

  const title = game === 'tetris' ? t('games.tetris.name') : game === 'quiz' ? t('games.quiz.name') : t('games.title');
  return (
    <div className="page mg-page">
      <PageHead title={title} sub={game && seed ? t('games.round', { seed: String(seed) }) : t('games.sub')}
        actions={game ? <>
          <a className="btn" href="#games" data-testid="games-back"><ArrowLeft size={16} aria-hidden="true" />{t('games.back')}</a>
        </> : undefined} />
      <div className="mg-top">
        <OpsCorner said={said} ops={ops} />
        <p className="mg-note" role="note">{t('games.offRaid')}</p>
      </div>
      {!game && <Hub />}
      {game === 'tetris' && seed && <Tetris key={seed} seed={seed} react={react} />}
      {game === 'quiz' && seed && <Quiz key={seed} seed={seed} react={react} />}
    </div>
  );
}

