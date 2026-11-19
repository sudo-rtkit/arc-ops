/* 0.30.0: Nastavení → AI asistent (jen hlavní okno). Ve výchozím stavu vypnuto. Aby asistent fungoval, musí hráč
   souhlasit s textem o tom, co se posílá a komu, a vložit vlastní klíč (BYOK). Klíč jde jen jednou přímo do Rustu
   (Windows Credential Manager); pole se hned vyprázdní a klíč se nikdy nezobrazí, neuloží do stavu ani do zálohy.
   Stav klíče je jen ano / ne. Ukazuje i dnešní počet dotazů a u každého poskytovatele odkaz na stránku s klíči
   a jednu větu o tom, co dělá s daty.
   0.32.0: seznam posílaných údajů po bodech (AI_CONSENT_ITEMS). Když hráč souhlasil se starší verzí seznamu,
   panel ukáže, co přibylo, a dotazy stojí (aiBlock → reconsent), dokud znovu nesouhlasí. */
import { useEffect, useState } from 'react';
import { Bot, KeyRound, Trash2 } from 'lucide-react';
import { actions, useAppState } from '../store';
import { ai } from '../ops/mainHub';
import { useAiView } from '../store/aiView';
import { AI_CONSENT_ITEMS, AI_PROVIDERS, consentCurrent, consentNews, MODEL_RE, modelOf, providerDef, todayCount, type AiProvider } from '../core/ai';
import { Badge, Btn, ConfirmButton, ExtLink, Panel, Select } from '../ui/components';
import { aiErrText } from '../ui/AskOps';
import { fmtDateTime } from '../ui/format';
import { dayKey } from '../core/util';
import { useT } from '../i18n/react';
import type { Key } from '../i18n';

export function AiSettingsPanel() {
  const t = useT();
  const s = useAppState();
  const p = s.ai;
  const v = useAiView(x => x.view);
  const def = providerDef(p.provider);
  const outdated = p.consentAt > 0 && !consentCurrent(p);
  const news = consentNews(p);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(p.model);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => setModel(p.model), [p.model, p.provider]);
  const modelBad = model.trim() !== '' && !MODEL_RE.test(model.trim());
  const saveKey = async () => {
    const k = key.trim();
    /* klíč opustí React hned: pole se vyprázdní ještě před odpovědí Rustu */
    setKey('');
    if (!k) return;
    setBusy(true);
    const err = await ai.setKey(p.provider, k);
    setBusy(false);
    setMsg(err ? { tone: 'err', text: err === 'input' ? t('ai.set.keyInvalid') : aiErrText(t, err) } : { tone: 'ok', text: t('ai.set.keySaved') });
  };
  const clearKey = async () => {
    setBusy(true);
    const err = await ai.clearKey(p.provider);
    setBusy(false);
    setMsg(err ? { tone: 'err', text: aiErrText(t, err) } : { tone: 'ok', text: t('ai.set.keyCleared') });
  };
  const commitModel = () => { const m = model.trim(); if (!modelBad && m !== p.model) actions.setAi({ model: m }); };
  return (
    <Panel title={t('ai.set.title')} actions={<Bot size={16} aria-hidden="true" />} id="ai">
      <div className="stack-sm" data-testid="ai-settings">
        <p className="secondary-text">{t('ai.set.intro')}</p>
        {!v.available && <p className="meta" data-testid="ai-na">{t('ai.err.unavailable')}</p>}

        <section className="ai-consent" aria-labelledby="ai-consent-h" data-testid="ai-consent">
          <h3 id="ai-consent-h">{t('ai.consent.title')}</h3>
          <p>{t('ai.consent.what')}</p>
          <ul className="ai-consent-list" data-testid="ai-consent-items">{AI_CONSENT_ITEMS.map(x => (
            <li key={x.id} data-item={x.id} data-new={news.includes(x.id) ? '1' : undefined}>
              {t(`ai.consent.item.${x.id}` as Key)}{news.includes(x.id) && <> <Badge tone="amber">{t('ai.consent.new')}</Badge></>}
            </li>
          ))}</ul>
          <p>{t('ai.consent.when')}</p>
          <p>{t('ai.consent.never')}</p>
          <p>{t('ai.consent.whom', { provider: def.name })}</p>
          <p className="amber">{t('ai.consent.free')}</p>
          <p className="meta">{t('ai.consent.key')}</p>
          {/* 0.32.0: souhlas se starší verzí seznamu: dotazy stojí, dokud hráč nesouhlasí s tím, co přibylo */}
          {outdated && (
            <div className="ask-note" role="status" data-testid="ai-reconsent">
              <p><b>{t('ai.consent.changed')}</b></p>
              <ul>{news.map(id => <li key={id} data-item={id}>{t(`ai.consent.item.${id}` as Key)}</li>)}</ul>
              <Btn variant="primary" onClick={() => actions.aiConsent(true)} data-testid="ai-reconsent-accept">{t('ai.consent.reaccept')}</Btn>
            </div>
          )}
          {p.consentAt > 0
            ? <p className="row"><Badge tone={outdated ? 'amber' : 'success'}>{t(outdated ? 'ai.consent.givenOld' : 'ai.consent.given', { when: fmtDateTime(p.consentAt) })}</Badge>
                <Btn size="sm" variant="ghost" onClick={() => actions.aiConsent(false)} data-testid="ai-consent-revoke">{t('ai.consent.revoke')}</Btn></p>
            : <Btn variant="primary" onClick={() => actions.aiConsent(true)} data-testid="ai-consent-accept">{t('ai.consent.accept')}</Btn>}
        </section>

        <label className="toggle">
          <input type="checkbox" checked={p.on} disabled={!p.consentAt} onChange={e => actions.setAi({ on: e.target.checked })} data-testid="ai-on" />
          {t('ai.set.on')}
        </label>
        {!p.consentAt && <p className="meta">{t('ai.set.onNeedsConsent')}</p>}

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 240 }}>
            <Select label={t('ai.set.provider')} value={p.provider} onChange={x => actions.setAi({ provider: x as AiProvider })}
              options={AI_PROVIDERS.map(x => ({ value: x.id, label: x.name }))} />
          </div>
          <div className="field" style={{ minWidth: 260 }}>
            <label className="field-label" htmlFor="ai-model">{t('ai.set.model')}</label>
            <input id="ai-model" className="input mono" value={model} maxLength={100} placeholder={def.model} spellCheck={false} autoComplete="off"
              aria-invalid={modelBad} onChange={e => setModel(e.target.value)} onBlur={commitModel} onKeyDown={e => { if (e.key === 'Enter') commitModel(); }} data-testid="ai-model" />
          </div>
        </div>
        <p className="meta">{modelBad ? <span role="alert">{t('ai.set.modelBad')}</span> : t('ai.set.modelHint', { model: modelOf(p) })}</p>
        <p className="meta" data-testid="ai-provider-note">{t(`ai.prov.${p.provider}` as Key)}</p>
        <div className="stack-sm"><ExtLink url={def.keyUrl}>{t('ai.set.keyPage', { provider: def.name })}</ExtLink></div>

        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); void saveKey(); }}>
          <div className="field" style={{ minWidth: 300 }}>
            <label className="field-label" htmlFor="ai-key">{t('ai.set.key', { provider: def.name })}</label>
            <input id="ai-key" className="input mono" type="password" value={key} maxLength={256} autoComplete="off" spellCheck={false}
              onChange={e => setKey(e.target.value)} disabled={!v.available || busy} data-testid="ai-key" />
          </div>
          <Btn type="submit" icon={KeyRound} disabled={!key.trim() || busy || !v.available} data-testid="ai-key-save">{t('ai.set.keySave')}</Btn>
          <ConfirmButton variant="ghost" icon={Trash2} disabled={!v.hasKey || busy} title={t('ai.set.keyClearTitle')} text={t('ai.set.keyClearText', { provider: def.name })}
            confirmLabel={t('ai.set.keyClear')} onConfirm={() => void clearKey()}>{t('ai.set.keyClear')}</ConfirmButton>
        </form>
        <p className="meta" data-testid="ai-key-status">{v.hasKey ? t('ai.set.keyStored', { provider: def.name }) : t('ai.set.keyMissing', { provider: def.name })}</p>
        {msg && <p className={msg.tone === 'err' ? 'danger' : 'success'} role={msg.tone === 'err' ? 'alert' : 'status'} data-testid="ai-key-msg">{msg.text}</p>}
        <p className="meta" data-testid="ai-today">{t('ai.set.today', { count: todayCount(p, dayKey(Date.now())) })}</p>
        <p className="meta">{t('ai.set.limits')}</p>
      </div>
    </Panel>
  );
}
