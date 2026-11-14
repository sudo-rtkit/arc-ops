import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  /* milník 5: okna buddyho a overlaye jsou samostatné stránky; 0.22.0 i okno widgetů */
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 1500, rollupOptions: { input: { main: 'index.html', buddy: 'buddy.html', overlay: 'overlay.html', widgets: 'widgets.html' } } },
  /* 0.30.0: výpočetně náročné testy rozpoznávání (vlastní snímky ~2 s samostatně) pod zátěží celé sady překračovaly
     výchozích 5 s i na 0.29.0; delší limit jen proti falešným chybám, žádný test se tím nezpomalí */
  /* 0.25.0: oba slovníky registrované předem (aplikace je načítá po jazycích) */
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup-i18n.ts'], testTimeout: 20_000 },
});
