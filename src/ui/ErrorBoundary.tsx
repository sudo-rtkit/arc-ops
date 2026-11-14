/* 0.28.0: hranice chyb pro kořen každého okna. Chyba vykreslení se zapíše do místního deníku (reportError) a místo
   prázdného okna se ukáže malý dvojjazyčný náhradní obsah s tlačítkem pro nové načtení okna.
   - full: hlavní okno a overlay (otevřel je hráč);
   - pill: okno widgetů nad hrou (jen malý štítek v rohu, nic přes hru);
   - icon: okno buddyho (96 px, jen kulaté tlačítko).
   Nic se neaktivuje ani nepřebírá fokus: žádné focus(), autoFocus ani ukázání okna. Styly jsou vložené, protože
   okna buddyho a widgetů nenačítají components.css. */
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { getLang } from '../i18n/core';
import { CRASH_TEXT } from '../i18n/crashText';
import { reportError } from '../shell/diagLog';

export type CrashVariant = 'full' | 'pill' | 'icon';

const reload = () => { try { window.location.reload(); } catch { /* nic */ } };

const BOX: CSSProperties = {
  margin: '48px auto', maxWidth: 440, padding: 20, borderRadius: 6, background: 'var(--bg-panel, #1D2225)',
  border: '1px solid var(--border-subtle, #363E43)', color: 'var(--text-primary, #F2EEE7)', fontFamily: 'var(--font-ui, sans-serif)',
};
const BTN: CSSProperties = {
  cursor: 'pointer', border: '1px solid var(--border-control, #849095)', borderRadius: 4, background: 'var(--bg-raised, #272D31)',
  color: 'var(--text-primary, #F2EEE7)', fontFamily: 'var(--font-ui, sans-serif)', fontSize: 13, padding: '6px 12px',
};

export function CrashFallback({ variant }: { variant: CrashVariant }) {
  const tx = CRASH_TEXT[getLang()] ?? CRASH_TEXT.cs;
  if (variant === 'icon') {
    return <button type="button" data-testid="crash-fallback" aria-label={tx.short} title={tx.short} onClick={reload}
      style={{ ...BTN, position: 'fixed', left: 8, top: 8, width: 32, height: 32, padding: 0, borderRadius: 16, fontSize: 16 }}>↻</button>;
  }
  if (variant === 'pill') {
    return <button type="button" data-testid="crash-fallback" title={tx.text} onClick={reload}
      style={{ ...BTN, position: 'fixed', left: 12, top: 12, borderRadius: 14 }}>↻ {tx.short}</button>;
  }
  return (
    <div role="alert" data-testid="crash-fallback" style={BOX}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontFamily: 'var(--font-head, sans-serif)' }}>{tx.title}</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--text-secondary, #C8C7C2)', lineHeight: 1.45 }}>{tx.text}</p>
      <button type="button" style={BTN} onClick={reload}>↻ {tx.reload}</button>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode; variant?: CrashVariant }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { reportError(error, 'error', 'render', info.componentStack ?? undefined); }
  render() { return this.state.failed ? <CrashFallback variant={this.props.variant ?? 'full'} /> : this.props.children; }
}
