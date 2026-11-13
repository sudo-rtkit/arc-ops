import { defineConfig } from '@playwright/test';

/* Kouřový test UI nad sestavenou aplikací (úložiště localStorage). Spuštění: pnpm build && pnpm e2e
   Lokálně běží v nainstalovaném Microsoft Edge. 0.21.0: v CI (proměnná CI, GitHub Actions ji nastavuje) Playwrightův
   Chromium (pnpm exec playwright install chromium) a k tomu HTML report do playwright-report/ (artefakt při chybě).
   PW_CHANNEL=chromium vynutí Chromium i lokálně. */
const CI = !!process.env.CI;
const channel = process.env.PW_CHANNEL ?? (CI ? undefined : 'msedge');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  /* v CI jeden opakovaný pokus u nestabilního testu (report ho označí jako flaky) */
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 }, locale: 'cs-CZ',
    ...(channel && channel !== 'chromium' ? { channel } : {}),
    ...(CI ? { trace: 'retain-on-failure' as const } : {}),
  },
  webServer: { command: 'pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000 },
});
