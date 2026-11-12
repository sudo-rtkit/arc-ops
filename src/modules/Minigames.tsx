/* Minihry (0.11.0): Stash Tetris a recyklační kvíz; 0.12.0: Opsův hack (logická hádanka s obvodovými dlaždicemi). Jen pro chvíle mimo raid (čekání na zápas, menu): modul
   se otevírá jen na přání hráče, nic se nenabízí samo a nad hrou nic nevyskakuje. Odměny jsou jen kosmetické
   (nátěry Opse v šatníku); výsledek nikdy nemění herní data. Kolo je dané číslem v adrese (#games/tetris-123456),
   takže jde zopakovat (#games/hack-123456). Ovládání myší i klávesnicí (šipky, Enter, R = otočit, Delete = vyndat,
   Esc = pustit; v hacku Enter/mezerník = otočit po směru, Q = proti směru, pravé tlačítko myši = proti směru).
   Kvíz od 0.12.0 ukládá sérii po každé odpovědi, takže odchod uprostřed kola ji zachová.
   0.13.0: rozehrané kolo každé hry se ukládá po každém tahu (gameRounds) a po odchodu nebo restartu aplikace v něm
   jde pokračovat. Dohrané kolo se při návratu jen zobrazí, odměny se znovu nepřipíšou. Nové kolo při rozehraném
   kole se nejdřív zeptá; zahodí jen to kolo, rekordy a nátěry zůstanou. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, Brain, Check, Cpu, Package, Palette, Play, RotateCcw, RotateCw, Shuffle, Trash2, Trophy, X } from 'lucide-react';
import { actions, navigate, useAppState } from '../store';
import { Badge, Btn, PageHead, Panel, cx } from '../ui/components';
import { useT } from '../i18n/react';
import { formatInt, type Key, type Lang } from '../i18n';
import { QUIZ_LEN, hackPct, newSeed, tetrisPct, validSeed, type GameOutcome } from '../core/minigames';
import { HACK_NODES, dirsOf, isSolved, kindOf, leaks, makeHack, maskAt, powered, type HackNode } from '../core/opsHack';
import { hackSig, quizSig, restoreHack, restoreQuiz, restoreTetris, roundSummary, tetrisSig } from '../core/gameRounds';
import type { GameRounds, SavedHack, SavedQuiz, SavedTetris } from '../core/types';
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

type Game = 'tetris' | 'quiz' | 'hack';
type OnResult = (out: GameOutcome | null, value: string) => void;
/* uložené kolo této hry a tohoto čísla (stav při otevření kola) a znovuspuštění stejného kola od začátku */
interface RoundProps<S> { saved: S | null; replay: () => void }
/* Ops řekne hlášku (a v aktivním okně případně pípne) */
type Say = (l: LineRef, snd?: SoundId | null, sparkle?: boolean) => void;

function parseSub(sub: string): { game: Game | null; seed: number | null } {
  const m = /^(tetris|quiz|hack)(?:-(\d+))?$/.exec(sub);
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
/* text rozehraného kola (rozcestník a dotaz při jiném kole) */
function summaryText(t: ReturnType<typeof useT>, rounds: GameRounds, game: Game): string {
  const sm = roundSummary(rounds, game);
  if (!sm) return '';
  if (game === 'tetris') return t('games.saved.tetris', { count: sm.params.count });
  if (game === 'quiz') return t('games.saved.quiz', sm.params);
  return t('games.saved.hack', { ...sm.params, total: HACK_NODES });
}

/* Hrát, nebo (při rozehraném kole) Pokračovat / Nové kolo s potvrzením. Zahodí jen kolo této hry. */
function PlayRow({ game, icon }: { game: Game; icon: typeof Package }) {
  const t = useT();
  const rounds = useAppState().gameRounds;
  const sm = roundSummary(rounds, game);
  const [ask, setAsk] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ask) cancelRef.current?.focus(); }, [ask]);
  if (!sm) return <div className="row"><Btn variant="primary" icon={icon} onClick={() => startGame(game)} data-testid={`games-play-${game}`}>{t('games.play')}</Btn></div>;
  const close = () => { setAsk(false); setTimeout(() => newRef.current?.focus(), 0); };
  return (
    <div className="mg-saved" data-testid={`games-saved-${game}`} data-seed={sm.seed}>
      <p className="meta"><b>{t('games.saved.title', { seed: String(sm.seed) })}</b> · <span data-testid={`games-saved-${game}-progress`}>{summaryText(t, rounds, game)}</span></p>
      {!ask ? (
        <div className="row">
          <Btn variant="primary" icon={Play} onClick={() => navigate('games', `${game}-${sm.seed}`)} data-testid={`games-continue-${game}`}>{t('games.continue')}</Btn>
          <button ref={newRef} type="button" className="btn" onClick={() => setAsk(true)} aria-expanded={false} data-testid={`games-new-${game}`}>
            <Shuffle size={18} strokeWidth={1.75} aria-hidden="true" />{t('games.newRound')}</button>
        </div>
      ) : (
        <div className="mg-confirm" role="group" aria-label={t('games.discard.ask', { seed: String(sm.seed) })} data-testid={`games-confirm-${game}`}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
          <p className="amber">{t('games.discard.ask', { seed: String(sm.seed) })}</p>
          <div className="row">
            <Btn variant="danger" icon={Trash2} onClick={() => { actions.discardRound(game); startGame(game); }} data-testid={`games-discard-${game}`}>{t('games.discard.yes')}</Btn>
            <button ref={cancelRef} type="button" className="btn" onClick={close} data-testid={`games-cancel-${game}`}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
          <PlayRow game="tetris" icon={Package} />
        </Panel>
        <Panel title={t('games.quiz.name')} className="mg-card" actions={<Brain size={18} aria-hidden="true" className="accent" />}>
          <p className="secondary-text">{t('games.quiz.desc')}</p>
          <dl className="mg-stats" data-testid="games-quiz-stats">
            <div><dt>{t('games.best')}</dt><dd className="mono">{t('games.q.of', { n: g.quiz.best, total: QUIZ_LEN })}</dd></div>
            <div><dt>{t('games.bestStreak')}</dt><dd className="mono">{formatInt(t.lang, g.quiz.bestStreak)}</dd></div>
            <div><dt>{t('games.played')}</dt><dd className="mono">{formatInt(t.lang, g.quiz.played)}</dd></div>
          </dl>
          <PlayRow game="quiz" icon={Brain} />
        </Panel>
        <Panel title={t('games.hack.name')} className="mg-card" actions={<Cpu size={18} aria-hidden="true" className="accent" />}>
          <p className="secondary-text">{t('games.hack.desc')}</p>
          <dl className="mg-stats" data-testid="games-hack-stats">
            <div><dt>{t('games.bestPct')}</dt><dd className="mono">{t('games.pct', { pct: g.hack.bestPct })}</dd></div>
            <div><dt>{t('games.h.perfect')}</dt><dd className="mono">{formatInt(t.lang, g.hack.perfect)}</dd></div>
            <div><dt>{t('games.played')}</dt><dd className="mono">{formatInt(t.lang, g.hack.played)}</dd></div>
          </dl>
          <PlayRow game="hack" icon={Cpu} />
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

const tetrisDone = (round: TetrisRound, placements: Placement[]): TetrisDone => {
  const g = greedy(round), score = scoreOf(round, placements);
  return { score, greedy: g.score, pct: tetrisPct(score, g.score), tips: tipsFor(round, placements), greedyPlacements: g.placements };
};

/* Hláška o obnoveném kole: pokračování, dohrané kolo (bez nových odměn), nebo zahozené vadné kolo. */
function ResumeNote({ kind }: { kind: 'resumed' | 'doneBefore' | 'invalid' | null }) {
  const t = useT();
  if (!kind) return null;
  return <p className={cx('mg-resume', kind === 'invalid' && 'amber')} role="status" data-testid="games-resume" data-kind={kind}>{t(`games.resume.${kind}` as Key)}</p>;
}
/* Vadné nebo nekompatibilní uložené kolo se zahodí (jen pro tuto hru) a hra začne od začátku. */
function useDiscardInvalid(game: Game, invalid: boolean) {
  useEffect(() => { if (invalid) actions.discardRound(game); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function Tetris({ seed, react, saved, replay }: { seed: number; react: OnResult } & RoundProps<SavedTetris>) {
  const t = useT();
  const round = useMemo(() => makeRound(seed), [seed]);
  const sig = useMemo(() => tetrisSig(round), [round]);
  const [init] = useState(() => { const p = restoreTetris(saved, round); return { p, invalid: !!saved && !p }; });
  useDiscardInvalid('tetris', init.invalid);
  const [placements, setPlacements] = useState<Placement[]>(() => init.p?.placements ?? []);
  const [selId, setSelId] = useState<string | null>(() => (init.p && !init.p.done ? init.p.held?.id ?? null : null));
  const [rot, setRot] = useState(() => (init.p && !init.p.done ? init.p.held?.rot ?? false : false));
  const [cursor, setCursor] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [gridFocus, setGridFocus] = useState(false);
  const [live, setLive] = useState('');
  const [done, setDone] = useState<TetrisDone | null>(() => (init.p?.done ? tetrisDone(round, init.p.placements) : null));
  const [showOps, setShowOps] = useState(false);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resultRef = useRef<HTMLHeadingElement>(null);
  /* průběžné uložení po každém tahu hráče (ne při otevření kola: pouhé otevření nic nerozehraje) */
  const touched = useRef(false);
  const act = () => { touched.current = true; };
  useEffect(() => {
    if (!touched.current || done) return;
    actions.saveRound('tetris', { seed, status: 'active', sig, placements, held: selId ? { id: selId, rot } : null });
  }, [placements, selId, rot, done, seed, sig]);
  const note = init.invalid ? 'invalid' : init.p?.done ? 'doneBefore' : init.p ? 'resumed' : null;

  const sel = selId ? round.items.find(i => i.id === selId) ?? null : null;
  const inBag = new Set(placements.map(p => p.id));
  const score = scoreOf(round, placements);
  const free = occupancy(round, placements).filter(c => c === null).length;
  const anchor = hover ?? (gridFocus ? cursor : null);

  const rotate = () => {
    if (!sel || done) return;
    act();
    setRot(r => !r);
    setLive(t('games.t.rotated', { name: sel.name }));
  };
  const select = (it: LootItem) => {
    if (done) return;
    act();
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
    act();
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
    act();
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
    else if (e.key === 'Escape' && sel) { e.preventDefault(); act(); setSelId(null); setRot(false); setLive(t('games.t.released')); }
  };
  const finish = () => {
    if (done) return;
    const d = tetrisDone(round, placements);
    setDone(d); setSelId(null); setRot(false);
    /* odměny a značka „dohráno“ v jedné změně: návrat do kola je nepřipíše znovu */
    react(actions.finishRound({ game: 'tetris', score: d.score, greedy: d.greedy }, { seed, status: 'done', sig, placements, held: null }), formatInt(t.lang, d.score));
    setTimeout(() => resultRef.current?.focus(), 0);
  };

  return (
    <div className="mg-tetris" onKeyDown={onRootKey} data-testid="games-tetris" data-seed={seed}>
      <ResumeNote kind={note} />
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
              <Btn variant="ghost" icon={Trash2} onClick={() => { act(); setPlacements([]); setSelId(null); setLive(t('games.t.cleared')); }} disabled={!placements.length}>{t('games.t.clear')}</Btn>
              <Btn variant="primary" icon={Check} onClick={finish} data-testid="games-finish">{t('games.t.finish')}</Btn>
            </div>
          )}
          {!done && <p className="meta">{t('games.t.help')}</p>}
          {!done && <p className="meta" data-testid="games-autosave">{t('games.autosave')}</p>}
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
            <Btn icon={RotateCcw} onClick={replay} data-testid="games-replay">{t('games.replay')}</Btn>
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
function Quiz({ seed, react, say, saved, replay }: { seed: number; react: OnResult; say: Say } & RoundProps<SavedQuiz>) {
  const t = useT();
  /* série je v uloženém stavu (ukládá se po každé odpovědi, ne až na konci kola) */
  const streak = useAppState().games.quiz.streak;
  /* jazyk kola: po první odpovědi (nebo z uloženého kola) pevný, aby obnovené otázky i odpovědi seděly */
  const [init] = useState(() => {
    const p = saved ? restoreQuiz(saved, makeQuiz(seed, saved.lang)) : null;
    return { p, lang: p ? saved!.lang : null as Lang | null, invalid: !!saved && !p };
  });
  useDiscardInvalid('quiz', init.invalid);
  const [lockLang, setLockLang] = useState<Lang | null>(init.lang);
  const lang = lockLang ?? t.lang;
  const round = useMemo(() => makeQuiz(seed, lang), [seed, lang]);
  const sig = useMemo(() => quizSig(round), [round]);
  const [i, setI] = useState(() => init.p?.index ?? 0);
  const [picked, setPicked] = useState<string | null>(() => init.p?.picked ?? null);
  const [correct, setCorrect] = useState(() => init.p?.correct ?? 0);
  const [done, setDone] = useState(() => !!init.p?.done);
  const note = init.invalid ? 'invalid' : init.p?.done ? 'doneBefore' : init.p ? 'resumed' : null;
  const data = (over: Partial<SavedQuiz>): SavedQuiz => ({ seed, status: 'active', sig, lang, index: i, picked, correct, ...over });
  const nextRef = useRef<HTMLButtonElement>(null);
  const optsRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const total = round.questions.length;
  const q = round.questions[i];

  const answer = (id: string) => {
    if (picked || done || !q) return;
    setPicked(id);
    setLockLang(lang);
    const ok = id === q.answer;
    const nextCorrect = correct + (ok ? 1 : 0);
    setCorrect(nextCorrect);
    /* série a uložené kolo v jedné změně; už zodpovězená otázka se nezapočítá podruhé */
    const res = actions.answerQuiz(data({ picked: id, correct: nextCorrect }), ok);
    /* série 10 odemkne nátěr hned, ne až na konci kola */
    if (res?.unlocked.length) say(line('game.unlock', { name: res.unlocked.map(x => paintName(t, x)).join(', ') }), 'unlock', true);
    setTimeout(() => nextRef.current?.focus(), 0);
  };
  const next = () => {
    if (!picked) return;
    if (i + 1 < total) {
      actions.saveRound('quiz', data({ index: i + 1, picked: null }));
      setI(i + 1); setPicked(null); setTimeout(() => optsRef.current?.querySelector('button')?.focus(), 0); return;
    }
    setDone(true);
    react(actions.finishRound({ game: 'quiz', correct, total }, data({ status: 'done' })), t('games.q.of', { n: correct, total }));
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
      <>
        <ResumeNote kind={note} />
        <Panel title={t('games.q.result')} className="mg-result">
          <h3 ref={resultRef} tabIndex={-1} data-testid="games-result">{t('games.q.score', { n: correct, total })}</h3>
          <p className="meta" data-testid="games-streak">{t('games.q.streakNow', { count: streak })}</p>
          <div className="row">
            <Btn icon={RotateCcw} onClick={replay} data-testid="games-replay">{t('games.replay')}</Btn>
            <Btn variant="primary" icon={Shuffle} onClick={() => startGame('quiz')} data-testid="games-next-round">{t('games.newRound')}</Btn>
          </div>
        </Panel>
      </>
    );
  }
  if (!q) return null;
  const ok = picked === q.answer;
  return (
    <div className="mg-quiz" data-testid="games-quiz" data-seed={seed}>
      <ResumeNote kind={note} />
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
        <p className="meta" data-testid="games-streak-note">{t('games.q.streakSaved')}</p>
        <p className="meta" data-testid="games-autosave">{t('games.autosave')}</p>
      </Panel>
    </div>
  );
}

/* ----- Opsův hack ----- */
const DIR_KEYS = { n: 'games.h.dir.n', e: 'games.h.dir.e', s: 'games.h.dir.s', w: 'games.h.dir.w' } as const;
/* Dlaždice jako SVG: vodiče ze středu k hranám, zdroj = čtverec s bleskem, výstup = kruhová kontrolka. Kreslí se tvar
   z řešení a celé SVG se otáčí (plynulý přechod), takže otočení odpovídá tomu, co hra počítá. */
function HackTile({ mask, kind, on }: { mask: number; kind: string; on: boolean }) {
  const ends: [number, number][] = [[20, 0], [40, 20], [20, 40], [0, 20]];
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cx('mg-hack-svg', on && 'on')}>
      {ends.map(([x, y], k) => (mask & (1 << k) ? <line key={k} x1="20" y1="20" x2={x} y2={y} /> : null))}
      {kind === 'source' && <><rect x="11" y="11" width="18" height="18" rx="3" className="src" /><path d="M21.5 13 15.5 21h4l-1 6 6-8h-4z" className="bolt" /></>}
      {kind === 'output' && <circle cx="20" cy="20" r="7" className="out" />}
      {kind === 'wire' && <circle cx="20" cy="20" r="3.2" className="joint" />}
    </svg>
  );
}

function Hack({ seed, react, say, saved, replay }: { seed: number; react: OnResult; say: Say } & RoundProps<SavedHack>) {
  const t = useT();
  const round = useMemo(() => makeHack(seed), [seed]);
  const sig = useMemo(() => hackSig(round), [round]);
  const [init] = useState(() => { const p = restoreHack(saved, round, isSolved); return { p, invalid: !!saved && !p }; });
  useDiscardInvalid('hack', init.invalid);
  const [k, setK] = useState(() => init.p?.node ?? 0);
  /* otočení každé dlaždice jako počet čtvrtotáček (bez modula, kvůli plynulé animaci) */
  const [turns, setTurns] = useState<number[]>(() => (init.p ? [...init.p.rot] : [...round.nodes[0].start]));
  const [moves, setMoves] = useState(() => init.p?.moves ?? 0);
  const [cursor, setCursor] = useState(0);
  const [live, setLive] = useState('');
  const [finished, setFinished] = useState(() => !!init.p?.done);
  const note = init.invalid ? 'invalid' : init.p?.done ? 'doneBefore' : init.p ? 'resumed' : null;
  const data = (node: number, r: number[], m: number, status: 'active' | 'done' = 'active'): SavedHack => ({ seed, status, sig, node, rot: r, moves: m });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const node: HackNode = round.nodes[k];
  const rot = turns.map(x => ((x % 4) + 4) % 4);
  const on = powered(node, rot);
  const leak = leaks(node, rot);
  const solved = isSolved(node, rot);
  const par = round.nodes.reduce((sum, n) => sum + n.par, 0);
  const parSoFar = round.nodes.slice(0, k + 1).reduce((sum, n) => sum + n.par, 0);

  /* Ops ohlásí terminál jen u nového kola (u obnoveného nebo dohraného mlčí) */
  useEffect(() => { if (!init.p) say(line('game.hackStart')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tileLabel = (i: number, r: number[], power: Set<number>) => {
    const kind = kindOf(node, i);
    const dirs = dirsOf(maskAt(node, r, i)).map(d => t(DIR_KEYS[d])).join(', ');
    return t('games.h.tileAria', { row: Math.floor(i / node.cols) + 1, col: (i % node.cols) + 1, kind: t(`games.h.kind.${kind}` as Key), dirs, state: t(power.has(i) ? 'games.h.on' : 'games.h.off') });
  };
  const turn = (i: number, dir: 1 | -1) => {
    if (solved || finished) return;
    const nt = [...turns]; nt[i] += dir;
    const nr = nt.map(x => ((x % 4) + 4) % 4);
    const total = moves + 1;
    setTurns(nt); setMoves(total); setCursor(i);
    setLive(tileLabel(i, nr, powered(node, nr)));
    const last = k + 1 >= HACK_NODES, solvedNow = isSolved(node, nr);
    /* průběžné uložení po každém otočení; poslední uzel ukládá až dohrání spolu s odměnami */
    if (!(last && solvedNow)) actions.saveRound('hack', data(k, nr, total));
    if (!solvedNow) return;
    if (!last) {
      say(line('game.hackNode'), 'beep');
      setTimeout(() => nextRef.current?.focus(), 0);
      return;
    }
    setFinished(true);
    react(actions.finishRound({ game: 'hack', moves: total, par }, data(k, nr, total, 'done')), t('games.pct', { pct: hackPct(total, par) }));
    setTimeout(() => resultRef.current?.focus(), 0);
  };
  const nextNode = () => {
    if (!solved || k + 1 >= HACK_NODES) return;
    actions.saveRound('hack', data(k + 1, [...round.nodes[k + 1].start], moves));
    setK(k + 1); setTurns([...round.nodes[k + 1].start]); setCursor(0);
    setTimeout(() => refs.current[0]?.focus(), 0);
  };
  const move = (i: number) => { setCursor(i); refs.current[i]?.focus(); };
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const x = i % node.cols, y = Math.floor(i / node.cols);
    const go = (nx: number, ny: number) => { e.preventDefault(); move(Math.min(node.rows - 1, Math.max(0, ny)) * node.cols + Math.min(node.cols - 1, Math.max(0, nx))); };
    if (e.key === 'ArrowLeft') go(x - 1, y);
    else if (e.key === 'ArrowRight') go(x + 1, y);
    else if (e.key === 'ArrowUp') go(x, y - 1);
    else if (e.key === 'ArrowDown') go(x, y + 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); turn(i, 1); }
    else if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); turn(i, -1); }
  };

  const pct = hackPct(moves, par);
  return (
    <div className="mg-hack" data-testid="games-hack" data-seed={seed}>
      <ResumeNote kind={note} />
      <Panel title={t('games.h.node', { n: k + 1, total: HACK_NODES, cols: node.cols, rows: node.rows })} className="mg-hack-panel"
        actions={<span className="mono" data-testid="games-hack-moves">{t('games.h.moves', { moves, par: parSoFar })}</span>}>
        <p className="meta">{t('games.h.goal')}</p>
        <div className="mg-hack-grid" role="grid" aria-label={t('games.h.gridAria', { cols: node.cols, rows: node.rows })} data-testid="games-hack-grid" data-node={k}
          onContextMenu={e => e.preventDefault()}>
          {Array.from({ length: node.rows }, (_, y) => (
            <div key={y} role="row" className="mg-hack-row">
              {Array.from({ length: node.cols }, (_, x) => {
                const i = y * node.cols + x, kind = kindOf(node, i);
                return (
                  <button key={`${k}-${i}`} type="button" role="gridcell" className={cx('mg-hack-tile', kind, on.has(i) && 'on')} data-cell={i} data-kind={kind} data-rot={rot[i]}
                    data-powered={on.has(i) ? 'yes' : 'no'} tabIndex={cursor === i ? 0 : -1} aria-label={tileLabel(i, rot, on)} aria-disabled={solved || finished}
                    ref={el => { refs.current[i] = el; }} onFocus={() => setCursor(i)} onKeyDown={e => onKey(e, i)}
                    onClick={() => turn(i, 1)} onContextMenu={e => { e.preventDefault(); turn(i, -1); }}>
                    <span className="mg-hack-turn" style={{ transform: `rotate(${turns[i] * 90}deg)` }}><HackTile mask={node.solution[i]} kind={kind} on={on.has(i)} /></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="meta" data-testid="games-hack-status">
          {t('games.h.powered', { on: on.size, all: node.solution.length })} · {leak ? t('games.h.leaks', { count: leak }) : t('games.h.noLeaks')}
        </p>
        <p className="sr-only" aria-live="polite" data-testid="games-live">{live}</p>
        {solved && !finished && (
          <div className="mg-explain ok" role="status" data-testid="games-hack-cracked">
            <b>{t('games.h.cracked', { n: k + 1 })}</b>
            <div className="row"><button ref={nextRef} type="button" className="btn primary" onClick={nextNode} data-testid="games-hack-next">
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />{t('games.h.nextNode')}</button></div>
          </div>
        )}
        {!finished && <p className="meta">{t('games.h.help')}</p>}
        {!finished && <p className="meta" data-testid="games-autosave">{t('games.autosave')}</p>}
      </Panel>
      {finished && (
        <Panel title={t('games.h.result')} className="mg-result">
          <h3 ref={resultRef} tabIndex={-1} data-testid="games-result">{t('games.h.resultLine', { moves, par })}</h3>
          <p className={cx('mg-pct', pct >= 100 ? 'mg-good' : 'amber')} data-testid="games-pct">{t('games.h.pctOfPar', { pct })}</p>
          <ul className="mg-tips" data-testid="games-tips">
            {moves <= par ? <li>{t('games.h.tipPar')}</li> : <li>{t('games.h.tipOver', { count: moves - par })}</li>}
            <li>{t('games.h.tipOutputs')}</li>
          </ul>
          <div className="row">
            <Btn icon={RotateCcw} onClick={replay} data-testid="games-replay">{t('games.replay')}</Btn>
            <Btn variant="primary" icon={Shuffle} onClick={() => startGame('hack')} data-testid="games-next-round">{t('games.newRound')}</Btn>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ----- otevření kola: obnovení uloženého, nebo dotaz, když je rozehrané jiné kolo téže hry ----- */
function GameHost({ game, seed, react, say, restart }: { game: Game; seed: number; react: OnResult; say: Say; restart: () => void }) {
  const t = useT();
  const rounds = useAppState().gameRounds;
  /* stav uloženého kola při otevření (během hry se ukládá dál, ale kolo se z něj znovu nestaví) */
  const [saved] = useState(() => rounds[game]);
  const headRef = useRef<HTMLHeadingElement>(null);
  const other = saved && saved.seed !== seed && saved.status === 'active' ? saved : null;
  useEffect(() => { if (other) headRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const replay = () => { actions.discardRound(game); restart(); };
  if (other) {
    return (
      <Panel title={t('games.conflict.title')} className="mg-result">
        <div data-testid="games-conflict" data-seed={other.seed}>
          <h3 ref={headRef} tabIndex={-1}>{t('games.saved.title', { seed: String(other.seed) })} · {summaryText(t, rounds, game)}</h3>
          <p className="secondary-text">{t('games.conflict.text', { saved: String(other.seed), seed: String(seed) })}</p>
          <div className="row">
            <Btn variant="primary" icon={Play} onClick={() => navigate('games', `${game}-${other.seed}`)} data-testid="games-conflict-continue">
              {t('games.conflict.continue', { seed: String(other.seed) })}</Btn>
            <Btn variant="danger" icon={Trash2} onClick={replay} data-testid="games-conflict-discard">
              {t('games.conflict.discard', { seed: String(seed) })}</Btn>
          </div>
        </div>
      </Panel>
    );
  }
  const own = saved && saved.seed === seed ? saved : null;
  if (game === 'tetris') return <Tetris seed={seed} react={react} saved={own as SavedTetris | null} replay={replay} />;
  if (game === 'quiz') return <Quiz seed={seed} react={react} say={say} saved={own as SavedQuiz | null} replay={replay} />;
  return <Hack seed={seed} react={react} say={say} saved={own as SavedHack | null} replay={replay} />;
}

/* ----- modul ----- */
export default function Minigames({ sub }: { sub: string }) {
  const t = useT();
  const { game, seed } = parseSub(sub);
  const ops = useRef<OpsHandle | null>(null);
  const [said, setSaid] = useState<{ line: LineRef | null; n: number }>({ line: null, n: 0 });
  /* znovuspuštění stejného kola (Hrát znovu, zahození jiného rozehraného kola) */
  const [epoch, setEpoch] = useState(0);
  /* hra bez platného čísla kola dostane nové číslo */
  useEffect(() => { if (game && seed === null) startGame(game); }, [game, seed]);

  const say: Say = (l, snd = null, sparkle = false) => {
    if (sparkle) ops.current?.sparkle();
    setSaid(x => ({ line: l, n: x.n + 1 }));
    /* zvuk jen v aktivním okně (pravidla mainSound / soundAllowed) */
    if (snd) mainSound.play(snd);
  };
  const react: OnResult = (out, value) => {
    if (!out) return;
    if (out.unlocked.length) say(line('game.unlock', { name: out.unlocked.map(id => paintName(t, id)).join(', ') }), 'unlock', true);
    else if (out.record) say(line('game.record', { value }), 'record');
    else if (out.win) say(line('game.win'), 'win');
    else say(line('game.done'));
  };

  const title = game === 'tetris' ? t('games.tetris.name') : game === 'quiz' ? t('games.quiz.name') : game === 'hack' ? t('games.hack.name') : t('games.title');
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
      {game && seed && <GameHost key={`${game}-${seed}-${epoch}`} game={game} seed={seed} react={react} say={say} restart={() => setEpoch(e => e + 1)} />}
    </div>
  );
}

