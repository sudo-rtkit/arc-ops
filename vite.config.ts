import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  /* milník 5: okna buddyho a overlaye jsou samostatné stránky */
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 1500, rollupOptions: { input: { main: 'index.html', buddy: 'buddy.html', overlay: 'overlay.html' } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
