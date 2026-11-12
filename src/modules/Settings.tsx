import { useCallback, useEffect, useState } from 'react';
import { Camera, Copy, Download, FolderOpen, History, RotateCcw, Trash2, Upload } from 'lucide-react';
import { actions, app, useApp, useAppState } from '../store';
import { RESET_MODULES, resetImpact, resetName, type ResetModule } from '../store/app';
import { Badge, Btn, Confirm, ConfirmButton, Dialog, Empty, ExtLink, FieldError, PageHead, Panel, Select } from '../ui/components';
import { fmtBytes, fmtDateTime } from '../ui/format';
import { backupErrorText, backupFileName, parseBackup, type ParsedBackup } from '../core/backup';
import type { SnapshotInfo } from '../storage/adapter';
import type { AppState } from '../core/types';
import { DOC_URL } from '../core/data/checklists';
import { MAPS } from '../core/data/maps';
import { totalPoints } from '../core/skills';
import { starSum } from '../core/week';
import { useT, type TFn } from '../i18n/react';
import { LANGS, LANG_NAMES, type Key } from '../i18n';
import { snapshotLabel } from '../i18n/system';
import { catalogCount } from '../core/catalog';
import { AT_DATE, AT_HIDEOUT, AT_PROJECTS, AT_QUESTS } from '../core/data/arctracker';
import { ITEM_DATA, ITEMS_DATE, TRADER_OFFERS } from '../core/itemdb';
import { WEAPON_STATS } from '../core/data/weaponStats';
import { OpsPanel, OpsVoicePanel, WardrobePanel } from './OpsSettings';
import { WindowPanel } from './WindowSettings';

/* Odkazy na zdroje herních dat (uvedení zdroje). Otevřou se jen na kliknutí; aplikace z nich nic nestahuje. */
const METAFORGE_URL = 'https://metaforge.app/arc-raiders';
const ARCTRACKER_URL = 'https://arctracker.io';

const KIND_KEY: Record<string, Key> = { auto: 'snap.kind.auto', manual: 'snap.kind.manual', import: 'snap.kind.import', restore: 'snap.kind.restore', reset: 'snap.kind.reset' };

function summary(t: TFn, s: AppState) {
  return [
    [t('profile.panel'), t('settings.sum.profile', { level: s.profile.level, coins: s.profile.coins, rounds: s.profile.rounds })],
    [t('top.skill'), String(totalPoints(s.skills.current))],
    [t('settings.sum.materials'), t('settings.sum.materialsVal', { kinds: Object.keys(s.inventory).length, pcs: Object.values(s.inventory).reduce((a, b) => a + b, 0) })],
    [t('nav.group.raids'), String(s.raids.length)],
    [t('settings.sum.goals'), t('settings.sum.goalsVal', { goals: s.goals.length, loadouts: s.loadouts.length, lists: s.checklists.templates.length })],
    [t('trials.starsCol'), `${starSum(s.trials.stars)} / 15 (${s.trials.week || '—'})`],
  ];
}

type ImportStage = { stage: 'input'; error: string | null } | { stage: 'review'; parsed: Exclude<ParsedBackup, { error: string }>; raw: string } | { stage: 'done'; parsed: Exclude<ParsedBackup, { error: string }> };

function ImportDialog({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
  const current = useAppState();
  const t = useT();
  const [text, setText] = useState(initialText || '');
  /* Chyba je klíč nebo kód jádra, takže se přeloží i po změně jazyka. */
  const [st, setSt] = useState<ImportStage>({ stage: 'input', error: null });
  const [busy, setBusy] = useState(false);
  const check = (raw: string) => {
    if (!raw.trim()) return setSt({ stage: 'input', error: 'key:import.err.empty' });
    /* Starší záloha bez uložené volby jazyka převezme aktuální jazyk UI. */
    const p = parseBackup(raw, Date.now(), t.lang);
    if ('error' in p) setSt({ stage: 'input', error: p.error });
    else setSt({ stage: 'review', parsed: p, raw });
  };
  const errorText = (e: string) => (e.startsWith('key:') ? t(e.slice(4) as Key) : backupErrorText(e, t.lang) + ' ' + t('import.unchanged'));
  const pick = async () => {
    const x = await app.storage.importBackup();
    if (x === null) return;
    if (x === '') return setSt({ stage: 'input', error: 'key:import.err.big' });
    setText(x); check(x);
  };
  if (st.stage === 'review') {
    const p = st.parsed;
    const cur = summary(t, current), next = summary(t, p.state);
    return (
      <Dialog title={t('import.review')} size="wide" onClose={onClose}
        footNote={t('import.reviewNote')}
        footer={<><Btn onClick={() => setSt({ stage: 'input', error: null })}>{t('import.back')}</Btn><Btn variant="primary" disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await actions.importState(p.state, st.raw, p.kind);
          setBusy(false);
          if (ok) setSt({ stage: 'done', parsed: p });
        }}>{t('import.confirm')}</Btn></>}>
        <p>{t('import.detected')} <b>{p.kind === 'diary' ? t('import.kindDiary') : t('import.kindApp')}</b>{p.exportedAt ? ', ' + t('import.exportedAt', { at: fmtDateTime(Date.parse(p.exportedAt)) }) : ''}.</p>
        <p className="secondary-text">{t('import.replaces')}</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('import.area')}</th><th>{t('import.now')}</th><th>{t('import.after')}</th></tr></thead>
          <tbody>{next.map(([k, v], i) => <tr key={k}><td>{k}</td><td className="muted">{cur[i][1]}</td><td><b>{v}</b></td></tr>)}</tbody>
        </table></div>
        {p.report && p.report.notes.map(n => <p key={n} className="meta">{n}</p>)}
      </Dialog>
    );
  }
  if (st.stage === 'done') {
    const rep = st.parsed.report;
    return (
      <Dialog title={t('import.doneTitle')} size="wide" onClose={onClose} footer={<Btn variant="primary" onClick={onClose}>{t('common.done')}</Btn>}>
        {rep ? (
          <>
            <p>{t('import.protocol')} {rep.ok ? <Badge tone="success">{t('import.allOk')}</Badge> : <Badge tone="danger">{t('import.diff')}</Badge>}</p>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('wpn.field')}</th><th className="num">{t('import.inSource')}</th><th className="num">{t('import.afterConv')}</th></tr></thead>
              <tbody>{rep.rows.map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.source}</td><td className="num">{r.value}</td></tr>)}</tbody>
            </table></div>
            {rep.notes.map(n => <p key={n} className="meta">{n}</p>)}
            <p className="meta">{t('import.rawSaved')}</p>
          </>
        ) : <p>{t('import.appLoaded')}</p>}
      </Dialog>
    );
  }
  return (
    <Dialog title={t('import.title')} size="wide" onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" onClick={() => check(text)}>{t('import.continue')}</Btn></>}>
      <p>{t('import.introA')} <b>{t('import.introPath')}</b> {t('import.introB')}</p>
      <div className="row"><Btn icon={Upload} onClick={() => void pick()}>{t('import.pick')}</Btn><span className="meta">{t('import.orPaste')}</span></div>
      <div className="field">
        <label className="field-label" htmlFor="import-text">{t('import.textLabel')}</label>
        <textarea id="import-text" className="textarea mono" rows={8} value={text} onChange={e => { setText(e.target.value); if (st.error) setSt({ stage: 'input', error: null }); }} />
        {st.error && <FieldError>{errorText(st.error)}</FieldError>}
      </div>
    </Dialog>
  );
}

function Snapshots() {
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [restore, setRestore] = useState<SnapshotInfo | null>(null);
  const [label, setLabel] = useState('');
  const updatedAt = useApp(s => s.state.meta.updatedAt);
  const t = useT();
  const reload = useCallback(() => { actions.listSnapshots().then(setList, () => setList([])); }, []);
  useEffect(() => { reload(); }, [reload, updatedAt]);
  return (
    <Panel title={t('snap.title')} flush actions={<span className="meta">{t('snap.keep')}</span>}>
      <form className="row" style={{ padding: '0 16px' }} onSubmit={async e => { e.preventDefault(); await actions.createManualSnapshot(label); setLabel(''); reload(); }}>
        <label htmlFor="snap-label" className="sr-only">{t('snap.labelAria')}</label>
        <input id="snap-label" className="input" style={{ maxWidth: 280 }} placeholder={t('snap.labelPh')} value={label} maxLength={40} onChange={e => setLabel(e.target.value)} />
        <Btn type="submit" icon={Camera}>{t('snap.create')}</Btn>
      </form>
      {list === null ? <p className="muted" style={{ padding: 16 }}>{t('snap.loading')}</p> : list.length === 0 ? <Empty icon={History}>{t('snap.empty')}</Empty> : (
        <div className="table-wrap tall"><table className="table">
          <thead><tr><th>{t('chart.date')}</th><th>{t('journal.type')}</th><th>{t('snap.label')}</th><th className="num">{t('snap.size')}</th><th className="actions-cell">{t('inv.actions')}</th></tr></thead>
          <tbody>{list.map(s => (
            <tr key={s.name}>
              <td className="mono">{fmtDateTime(s.ts)}</td><td>{t(KIND_KEY[s.kind])}</td><td>{snapshotLabel(s.label, t.lang)}</td><td className="num">{s.size ? fmtBytes(s.size) : '—'}</td>
              <td className="actions-cell"><span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                <Btn size="sm" icon={RotateCcw} onClick={() => setRestore(s)}>{t('snap.restore')}</Btn>
                <Btn size="sm" variant="ghost" icon={Trash2} aria-label={t('snap.deleteAria', { date: fmtDateTime(s.ts) })} onClick={async () => { await actions.deleteSnapshot(s.name); reload(); }} />
              </span></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {restore && <Confirm title={t('snap.restoreTitle')} confirmLabel={t('snap.restore')} danger={false} onClose={() => setRestore(null)} onConfirm={async () => { await actions.restoreSnapshot(restore.name); setRestore(null); reload(); }}>
        <p>{t('snap.restoreQ', { date: fmtDateTime(restore.ts), kind: t(KIND_KEY[restore.kind]) })}</p>
        <p className="secondary-text">{t('snap.restoreNote', { kind: t('snap.kind.restore') })}</p>
      </Confirm>}
    </Panel>
  );
}

function DangerZone() {
  const [mod, setMod] = useState<ResetModule>('raids');
  const [confirmMod, setConfirmMod] = useState(false);
  const [all, setAll] = useState(false);
  const [word, setWord] = useState('');
  const t = useT();
  const name = resetName(mod), impact = resetImpact(mod);
  /* Potvrzovací slovo je v jazyce UI (SMAZAT / DELETE). */
  const confirmWord = t('danger.word');
  return (
    <section className="panel danger-zone" aria-label={t('danger.title')}>
      <div className="panel-head"><h2 className="danger">{t('danger.title')}</h2></div>
      <div className="panel-body">
        <p className="secondary-text">{t('danger.hint')}</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 260 }}><Select label={t('danger.module')} value={mod} onChange={v => setMod(v as ResetModule)} options={RESET_MODULES.map(x => ({ value: x.id, label: resetName(x.id) }))} /></div>
          <Btn variant="danger" onClick={() => setConfirmMod(true)}>{t('danger.resetBtn', { name })}</Btn>
        </div>
        <p className="meta">{t('danger.impact', { impact })}</p>
        <hr className="divider" />
        <div className="row"><span className="grow">{t('danger.fullHint')}</span><Btn variant="danger" icon={Trash2} onClick={() => { setWord(''); setAll(true); }}>{t('danger.all')}</Btn></div>
      </div>
      {confirmMod && <Confirm title={t('danger.resetTitle', { name })} confirmLabel={t('danger.resetBtn', { name })} onClose={() => setConfirmMod(false)} onConfirm={async () => { await actions.resetModule(mod); setConfirmMod(false); }}>
        <p>{impact}</p><p className="secondary-text">{t('danger.others')}</p>
      </Confirm>}
      {all && (
        <Dialog title={t('danger.all')} onClose={() => setAll(false)} initialFocus="[data-safe]"
          footer={<><Btn data-safe onClick={() => setAll(false)}>{t('common.cancel')}</Btn><Btn variant="danger" disabled={word !== confirmWord} onClick={async () => { await actions.resetAll(); setAll(false); }}>{t('danger.all')}</Btn></>}>
          <p>{t('danger.allText')}</p>
          <div className="field"><label className="field-label" htmlFor="wipe-word">{t('danger.type')} <b className="mono">{confirmWord}</b></label>
            <input id="wipe-word" className="input mono" value={word} autoComplete="off" onChange={e => setWord(e.target.value)} /></div>
        </Dialog>
      )}
    </section>
  );
}

export default function Settings({ sub }: { sub: string }) {
  const s = useAppState();
  const t = useT();
  const kind = useApp(x => x.storageKind);
  const lastSavedAt = useApp(x => x.lastSavedAt);
  const [dir, setDir] = useState('');
  const [importing, setImporting] = useState(sub === 'import');
  const [copied, setCopied] = useState(false);
  useEffect(() => { app.storage.dataDir().then(setDir, () => setDir('—')); }, []);
  return (
    <div className="page">
      <PageHead title="Settings & Backup" sub={t('settings.sub')} />
      <Panel title={t('settings.lang')}>
        <div className="seg" role="group" aria-label={t('settings.lang')}>
          {LANGS.map(l => <button key={l} type="button" lang={l} aria-pressed={s.settings.lang === l} onClick={() => actions.setLang(l)}>{LANG_NAMES[l]}</button>)}
        </div>
        <p className="meta">{t('settings.langHint')}</p>
      </Panel>
      <WindowPanel />
      <OpsPanel />
      <OpsVoicePanel />
      <WardrobePanel />
      <Panel title="Data">
        <dl className="dl">
          <dt>{t('settings.dir')}</dt>
          <dd className="row"><span className="mono wrap">{kind === 'browser' ? t('settings.browserDir') : dir || '…'}</span>
            <Btn size="sm" variant="ghost" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(dir).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined); }}>{copied ? t('settings.copied') : t('settings.copy')}</Btn>
            {kind === 'tauri' && <Btn size="sm" variant="ghost" icon={FolderOpen} onClick={() => void app.storage.openDataDir()}>{t('settings.openDir')}</Btn>}</dd>
          <dt>{t('settings.files')}</dt><dd className="meta">{t('settings.filesVal')}</dd>
          <dt>{t('settings.changed')}</dt><dd>{s.meta.updatedAt ? fmtDateTime(s.meta.updatedAt) : '—'}</dd>
          <dt>{t('settings.saved')}</dt><dd>{lastSavedAt ? fmtDateTime(lastSavedAt) : '—'}</dd>
          <dt>{t('settings.learned')}</dt>
          <dd className="row"><span className="mono" data-testid="learned-count">{s.vision.learned.length}</span>
            <ConfirmButton size="sm" variant="ghost" icon={Trash2} disabled={!s.vision.learned.length} title={t('settings.learnedConfirmTitle')}
              text={t('settings.learnedConfirmText', { count: s.vision.learned.length })} confirmLabel={t('settings.learnedClear')}
              onConfirm={() => { actions.clearLearned(); app.notify(t('notice.learnedCleared')); }}>{t('settings.learnedClear')}</ConfirmButton>
            <span className="meta">{t('settings.learnedHint')}</span></dd>
          {s.meta.importedFrom && <><dt>Import</dt><dd>{s.meta.importedFrom.source === 'denik-v1' ? t('settings.oldDiary') : s.meta.importedFrom.source}, {fmtDateTime(s.meta.importedFrom.at)}</dd></>}
        </dl>
        <label className="toggle"><input type="checkbox" checked={s.settings.autoSnapshot} onChange={e => actions.setAutoSnapshot(e.target.checked)} />{t('settings.autoSnap')}</label>
        {kind === 'browser' && <p className="meta">{t('settings.browserHint')}</p>}
      </Panel>
      <Panel title={t('settings.exportImport')}>
        <p className="secondary-text">{t('settings.exportHint')}</p>
        <div className="row">
          <Btn variant="primary" icon={Download} onClick={() => void actions.exportBackup(backupFileName(new Date(), t.lang))}>{t('settings.export')}</Btn>
          <Btn icon={Upload} onClick={() => setImporting(true)}>{t('settings.import')}</Btn>
          <Btn icon={Upload} onClick={() => setImporting(true)}>{t('settings.importDiary')}</Btn>
        </div>
      </Panel>
      <Snapshots />
      <Panel title={t('settings.links')}>
        <p className="meta">{t('settings.linksHint')}</p>
        <div className="stack-sm">
          <ExtLink url={DOC_URL}>{t('settings.roadmap')}</ExtLink>
          {MAPS.map(m => <ExtLink key={m.id} url={m.live}>{t('settings.liveMap', { name: m.name })}</ExtLink>)}
        </div>
      </Panel>
      <Panel title={t('settings.sources')}>
        <p data-testid="data-sources">{t('settings.sourcesText')}</p>
        <div className="stack-sm"><ExtLink url={METAFORGE_URL}>{t('settings.sourcesLink')}</ExtLink></div>
        <p className="meta">{t('settings.sourcesCatalog', { items: catalogCount().items, fp: catalogCount().withFp })}</p>
        <p data-testid="data-sources-arc">{t('settings.sourcesArc')}</p>
        <div className="stack-sm"><ExtLink url={ARCTRACKER_URL}>{t('settings.sourcesArcLink')}</ExtLink></div>
        <p className="meta">{t('settings.sourcesArcData', { quests: AT_QUESTS.length, modules: AT_HIDEOUT.length, projects: AT_PROJECTS.length, date: AT_DATE })}</p>
        <p className="meta" data-testid="data-sources-items">{t('settings.sourcesItems', { items: ITEM_DATA.length, offers: TRADER_OFFERS.length, date: ITEMS_DATE, weapons: WEAPON_STATS.length })}</p>
      </Panel>
      <Panel title={t('settings.about')}>
        <p>{t('settings.version', { v: '0.9' })}</p>
        <p className="secondary-text">{t('settings.aboutText')}</p>
        <p className="meta">{t('settings.dataText', { badge: t('origin.reserse') })}</p>
      </Panel>
      <DangerZone />
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
