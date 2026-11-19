import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  /* milník 5: okna buddyho a overlaye jsou samostatné stránky; 0.22.0 i okno widgetů */
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 1500, rollupOptions: { input: { main: 'index.html', buddy: 'buddy.html', overlay: 'overlay.html', widgets: 'widgets.html' } } },
  /* 0.30.0: výpočetně náročné testy rozpoznávání pod zátěží celé sady překračovaly výchozích 5 s, proto 20 s.
     Po zrychlení testů (rychlejší testovací resize, mezipaměti, vlastní snímky dekódované ve vláknech) trvá nejdelší
     test bez vlastního limitu pod zátěží asi 4 s; 10 s nechává rezervu pro pomalejší stroj. Dva přehledy přes všechny
     vlastní snímky (jen lokálně) mají vlastní delší limit.
     Lokálně pracovníků jako fyzických jader (polovina logických): s 15 procesy na 8 jádrech byla sada pomalejší
     (asi 13 s proti 11 s). V CI zůstává výchozí počet. */
  /* 0.25.0: oba slovníky registrované předem (aplikace je načítá po jazycích) */
  test: {
    include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup-i18n.ts'], testTimeout: 10_000,
    ...(process.env.CI ? {} : { maxWorkers: '50%' }),
  },
});
