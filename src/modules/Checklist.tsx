import { useState } from 'react';
import { ArrowDown, ArrowUp, Check as CheckIcon, Copy, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { actions, useAppState, useDerived } from '../store';
import { Badge, Btn, Check, ConfirmButton, Dialog, Empty, IconBtn, PageHead, Panel, Progress, Select } from '../ui/components';
import { RAID_TEMPLATE_ID } from '../core/state';
import { checkLabel, templateLabel } from '../core/gametext';
import { mapName } from './shared';
import { useT } from '../i18n/react';

function NewTemplate({ onClose, copyFrom }: { onClose: () => void; copyFrom?: { id: string; name: string } }) {
  const t = useT();
  const [name, setName] = useState(copyFrom ? t('default.copySuffix', { name: copyFrom.name }) : '');
  return (
    <Dialog title={copyFrom ? t('check.copyTitle') : t('default.newChecklist')} onClose={onClose}
      footer={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={!name.trim()} onClick={() => { actions.addTemplate(name, copyFrom?.id); onClose(); }}>{t('check.create')}</Btn></>}>
      <div className="field"><label className="field-label" htmlFor="tpl-name">{t('check.nameLabel')}</label>
        <input id="tpl-name" className="input" value={name} maxLength={80} placeholder={t('check.namePh')} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { actions.addTemplate(name, copyFrom?.id); onClose(); } }} /></div>
    </Dialog>
  );
}

export default function Checklist() {
  const s = useAppState();
  const d = useDerived();
  const t = useT();
  const templates = s.checklists.templates;
  const tpl = templates.find(x => x.id === s.checklists.active) || templates[0];
  const checked = s.checklists.checked;
  const ROUTES = d.routes;
  const [route, setRoute] = useState(ROUTES[0]?.id || '');
  const [edit, setEdit] = useState(false);
  const [create, setCreate] = useState<null | 'new' | 'copy'>(null);
  const [draft, setDraft] = useState('');
  const r = ROUTES.find(x => x.id === route) || ROUTES[0];
  const rc = s.checklists.routeChecks;
  const preDone = tpl.items.filter(i => checked[i.id]).length;
  const routeDone = r ? r.steps.filter((_, i) => rc[r.id + ':' + i]).length : 0;
  const isDefault = tpl.id === RAID_TEMPLATE_ID;
  /* Uložený výchozí text se zobrazí v aktuálním jazyce; nezměněné pole se při opuštění neuloží. */
  const tplName = templateLabel(tpl, t.lang) || t('check.untitled');
  const itemText = (i: { id: string; text: string }) => (isDefault ? checkLabel(i.id, i.text, t.lang) : i.text);
  return (
    <div className="page">
      <PageHead title="Raid Checklist" sub={t('check.sub')}
        actions={<><Btn icon={Plus} onClick={() => setCreate('new')}>{t('default.newChecklist')}</Btn></>} />
      <Panel title={t('check.templates')}>
        <div className="template-pick" role="group" aria-label={t('check.pick')}>
          {templates.map(x => {
            const done = x.items.filter(i => checked[i.id]).length;
            return (
              <button key={x.id} type="button" className={'btn sm' + (x.id === tpl.id ? ' selected' : '')} aria-pressed={x.id === tpl.id} onClick={() => actions.setActiveTemplate(x.id)}>
                {templateLabel(x, t.lang) || t('check.untitled')} <span className="mono">{done}/{x.items.length}</span>
              </button>
            );
          })}
        </div>
        <div className="cols-2">
          <Progress label={t('check.progress', { name: tplName })} value={preDone} max={tpl.items.length || 1} tone="success" valueText={`${preDone} / ${tpl.items.length}`} />
          {r && <Progress label={t('check.routeProgress', { name: r.name })} value={routeDone} max={r.steps.length || 1} tone="success" valueText={`${routeDone} / ${r.steps.length}`} />}
        </div>
      </Panel>
      <div className="cols-2">
        <Panel title={tplName} actions={<>{isDefault && <Badge>{t('check.defaultBadge')}</Badge>}<span className="mono meta">{preDone} / {tpl.items.length}</span>
          <Btn size="sm" variant="ghost" icon={edit ? CheckIcon : Pencil} onClick={() => setEdit(!edit)}>{edit ? t('common.done') : t('common.edit')}</Btn></>}>
          {edit ? (
            <div className="stack-sm">
              <div className="field"><label className="field-label" htmlFor="tpl-rename">{t('common.name')}</label>
                <input id="tpl-rename" key={tpl.id + t.lang} className="input" defaultValue={templateLabel(tpl, t.lang)} maxLength={80}
                  onBlur={e => { if (e.target.value !== templateLabel(tpl, t.lang)) actions.renameTemplate(tpl.id, e.target.value); }} /></div>
              {tpl.items.map((i, k) => (
                <div key={i.id} className="row step-edit">
                  <span className="mono muted" style={{ width: 24, textAlign: 'right' }}>{k + 1}</span>
                  <input key={t.lang} className="input grow" defaultValue={itemText(i)} aria-label={t('check.itemText', { n: k + 1 })}
                    onBlur={e => { if (e.target.value !== itemText(i)) actions.editTemplateItem(tpl.id, i.id, e.target.value); }} />
                  <IconBtn label={t('check.moveUp')} icon={ArrowUp} disabled={k === 0} onClick={() => actions.moveTemplateItem(tpl.id, i.id, -1)} />
                  <IconBtn label={t('check.moveDown')} icon={ArrowDown} disabled={k === tpl.items.length - 1} onClick={() => actions.moveTemplateItem(tpl.id, i.id, 1)} />
                  <IconBtn label={t('check.deleteItem', { n: k + 1 })} icon={Trash2} onClick={() => actions.deleteTemplateItem(tpl.id, i.id)} />
                </div>
              ))}
              <form className="row" onSubmit={e => { e.preventDefault(); actions.addTemplateItem(tpl.id, draft); setDraft(''); }}>
                <label htmlFor="tpl-new-item" className="sr-only">{t('check.newItemLabel')}</label>
                <input id="tpl-new-item" className="input grow" value={draft} placeholder={t('check.newItem')} maxLength={300} onChange={e => setDraft(e.target.value)} />
                <Btn type="submit" icon={Plus} disabled={!draft.trim()}>{t('check.addItem')}</Btn>
              </form>
              <div className="row">
                <Btn size="sm" icon={Copy} onClick={() => setCreate('copy')}>{t('check.copyAsNew')}</Btn>
                {isDefault
                  ? <ConfirmButton size="sm" icon={RotateCcw} title={t('check.restoreTitle')} confirmLabel={t('check.restore')} text={<p>{t('check.restoreText', { name: t('default.raidTemplate') })}</p>} onConfirm={() => actions.restoreDefaultTemplate()}>{t('check.restore')}</ConfirmButton>
                  : <ConfirmButton size="sm" variant="danger" icon={Trash2} title={t('check.delete')} confirmLabel={t('check.delete')} text={<p>{t('check.deleteText', { name: tplName, count: tpl.items.length })}</p>} onConfirm={() => { actions.deleteTemplate(tpl.id); setEdit(false); }}>{t('check.delete')}</ConfirmButton>}
              </div>
            </div>
          ) : (
            <>
              {tpl.items.length === 0 ? <Empty action={<Btn onClick={() => setEdit(true)}>{t('check.addItems')}</Btn>}>{t('check.empty')}</Empty>
                : <div>{tpl.items.map(i => <Check key={i.id} checked={!!checked[i.id]} onChange={() => actions.toggleCheck(i.id)}>{itemText(i)}</Check>)}</div>}
              <div className="row">
                <ConfirmButton title={t('check.newRaid')} confirmLabel={t('check.uncheckAll')} text={<p>{t('check.newRaidText', { count: tpl.items.length, name: tplName })}</p>}
                  onConfirm={() => actions.resetChecklist(tpl.id)} disabled={!preDone} variant="secondary">{t('check.newRaidBtn')}</ConfirmButton>
              </div>
            </>
          )}
        </Panel>
        <Panel title={t('check.routeSteps')} actions={r && <span className="mono meta">{routeDone} / {r.steps.length}</span>}>
          {!r ? <Empty>{t('check.allHidden')}</Empty> : <>
            <div style={{ maxWidth: 360 }}><Select label={t('common.route')} value={r.id} onChange={setRoute} options={ROUTES.map(x => ({ value: x.id, label: `${x.name} · ${mapName(x.map)}` }))} /></div>
            {r.steps.length === 0 ? <p className="muted">{t('check.noSteps')}</p>
              : <div>{r.steps.map((x, i) => <Check key={i} checked={!!rc[r.id + ':' + i]} onChange={() => actions.toggleRouteCheck(r.id + ':' + i)} prefix={<span className="step-n">{i + 1}</span>}>{x}</Check>)}</div>}
            <div className="row">
              <ConfirmButton title={t('check.uncheckRoute')} confirmLabel={t('check.uncheckRoute')} text={<p>{t('check.uncheckRouteText', { name: r.name })}</p>} onConfirm={() => actions.resetRouteChecks(r.id)} disabled={!routeDone}>{t('check.uncheckRoute')}</ConfirmButton>
              <a className="btn" href={'#money/' + r.id}>{t('check.guide')}</a>
            </div>
            <p className="meta">{t('check.routeHint')}</p>
          </>}
        </Panel>
      </div>
      {create && <NewTemplate onClose={() => setCreate(null)} copyFrom={create === 'copy' ? { id: tpl.id, name: tplName } : undefined} />}
    </div>
  );
}
