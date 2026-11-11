import { defineConfig } from '@playwright/test';

/* Kouřový test UI v Edge nad sestavenou aplikací (úložiště localStorage). Spuštění: pnpm build && pnpm e2e */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'msedge', viewport: { width: 1280, height: 800 }, locale: 'cs-CZ' },
  webServer: { command: 'pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000 },
});
