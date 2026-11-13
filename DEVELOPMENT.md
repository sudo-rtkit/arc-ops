# Development

[User guide](README.md) · [Changelog](CHANGELOG.md) · [Specifications](docs/superpowers/specs/)

Tauri 2, React 19, TypeScript (strict), Vite and pnpm. Plain CSS uses the graphite/apricot design tokens in `src/ui/`. Chakra Petch, Inter and JetBrains Mono are bundled locally with OFL notices. The public project is MIT licensed.

## Run and check

Install Node.js/pnpm and the Rust/Tauri Windows build prerequisites, then:

```sh
pnpm install
pnpm dev             # browser development, isolated localStorage
pnpm tauri dev       # native desktop
pnpm test            # Vitest
pnpm build           # TypeScript check + Vite build
pnpm e2e             # Playwright against the built app
```

Native checks and packaging:

```sh
cd src-tauri
cargo test
```

```sh
pnpm tauri build     # Windows NSIS installer, CS/EN installer languages
```

Do native/window tests with the game closed. Never focus or send input to the game for automation. Browser tests do not validate Windows foreground handling, native hotkeys, acrylic or anti-cheat compatibility.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests (read-only token, no secrets; a newer run cancels the older one for the same branch or pull request):

| Job | Runner | Steps |
|---|---|---|
| Web | `ubuntu-latest` | `pnpm install --frozen-lockfile` (pnpm store cached), `tsc --noEmit`, `pnpm test`, `pnpm build`, `playwright install --with-deps chromium` (browser cache), `pnpm e2e` |
| Rust | `windows-latest` | stable toolchain, `Swatinem/rust-cache`, placeholder `dist/index.html`, `cargo test --locked` in `src-tauri` |

- **Browser:** locally `playwright.config.ts` uses the installed Microsoft Edge (`channel: 'msedge'`). With `CI` set it uses Playwright's Chromium, retries a failing test once, writes the HTML report to `playwright-report/` and keeps traces; the job uploads the report and `test-results/` as the `playwright-report` artifact on failure. Reproduce locally with `pnpm exec playwright install chromium`, then `CI=1 pnpm e2e` (or `PW_CHANNEL=chromium pnpm e2e` without the CI behaviour).
- **Rust:** the job does not need Node. `tauri::generate_context!` only needs `../dist` to exist at compile time, so the job writes a placeholder page. The Windows-only code in `ops.rs` compiles there. The NSIS installer is built locally only (`pnpm tauri build`).
- **Local-only fixtures:** the player's screenshots in `tests/fixtures/vision/own/` are git-ignored. Vitest, Playwright and the Rust header tests that need them skip themselves when the files are missing, so CI runs the same suites minus those cases.
- **Keep it green:** a new test must not depend on Edge, Windows paths, the local time zone (dates in tests are built from local `Date` parts) or files outside the repository. Pushing a change to the workflow file needs a token with the `workflow` scope.

## Architecture

| Directory | Responsibility |
|---|---|
| `src/core/` | Pure calculations, state normalisation, reference data, recognition and import proposals; no React or disk I/O |
| `src/storage/` | Storage interface, native and browser adapters |
| `src/store/` | Shared state, actions, automatic saving |
| `src/modules/` | Main application screens, using core calculations and store actions |
| `src/ui/`, `src/shell/` | Tokens, shared components, charts, navigation and tutorial |
| `src/ops/` | Buddy/overlay rendering, message bus, validated main-window hub |
| `src-tauri/` | Native storage, capture, hotkey/window handling, installer |
| `tests/` | Core, recognition, safety, language and browser checks |
| `reference/` | Original diary reference, read only |

Keep core independent. Modules read state and call actions, rather than writing storage or duplicating calculations. Browser `localStorage` is for development/testing; desktop storage uses native files. Map screenshots (0.14.0) live in the webview's IndexedDB (`src/storage/mapImages.ts`), not in the state file. Normalisation migrates older state and rejects unsupported newer backup schemas. Use the implemented schema in `src/core/state.ts` as authority rather than historical examples in specifications.

Post-raid evaluation (0.15.0) lives in `src/core/raidEval.ts` and reuses raid prep (`raidList`, `scoreMaps`, `validGoals`) goal by goal; it never writes. The store only attaches its result to a raid entry (`addRaid(..., { withPlan })`, `attachRaidPlan`). Plan history statistics are `planMapStats` in `src/core/runs.ts`; the overlay saves through the hub action `raidPlanSave`.

The overlay's **App** entry (0.16.0, `src/ops/OverlayApps.tsx`; a button after the tablist, not a tab, so the tab order stays fixed) renders the real modules from the registry, lazily loaded. The main window stays the only writer: the overlay store is a *mirror* (`app.setMirror()`, never `ready`, never saves). `src/store/relay.ts` wraps the overlay's actions: each call runs on the local copy for immediate feedback and is sent to the main window (`action` on the bus) with its arguments and the ids it generated (`recordIds`). The hub accepts only names in `RELAY_ACTIONS`, decodes plain data (size and depth limits), replays the ids (`replayIds`) so new records share ids, applies the same store action and acknowledges in the next state push. The overlay rebases unacknowledged calls on every pushed state and drops them after 5 s, so an acknowledged overlay state is exactly the main window's. Every store action must be listed in `RELAY_ACTIONS` or `BLOCKED_ACTIONS` (a test enforces this). Modules must not import `src/ops/mainHub.ts`, `src/shell/windowCtl.ts` or the Settings modules; use `src/shell/host.ts` (`hostSound`, `inOverlay`, `openInApp`) and `src/ui/InAppOnly.tsx` for parts that need files or the main window. A test walks the overlay import graph. The panel's size and position are per-PC (`localStorage` key `arcops:overlay:panel`, `src/ops/ovPanel.ts`), not in the state or backups.

Provenance (0.21.0, schema 18): `src/core/provenance.ts` keeps `state.provenance` (per area a map key → latest record `{ src, at, conf?, ver, prev? }`, plus a short log). `change(fn, ctx)` in `src/store/app.ts` diffs the tracked areas before and after each action (`stampChanges`) and stamps what changed; the default context is a manual, confirmed edit, and imports pass `{ src, ver, conf }`. Do not write provenance from modules or trust a source from action arguments; the store (main window) decides. To track a new value, extend `domainValues`; `seedMigration` follows automatically. UI: `ProvDot` and `ProvenancePanel` in `src/ui/Provenance.tsx`.

Search everywhere and the item card (0.18.0): `src/core/search.ts` builds the index (items, quests, projects, stations, skills, builds, maps, ARC, tips; modules and Settings sections are passed in from the UI) and ranks results (`fold` = lower case without diacritics, CS and EN names in one entry). `src/core/itemCard.ts` composes the card from the advice need list (`collectNeedList` + `needIndex`), `raidList`, recycling, loot areas and map points; it never computes needs on its own. The UI is `src/ui/SearchPalette.tsx` (Ctrl+K via `useSearchShortcut`, sidebar field, recents in `localStorage` key `arcops:search:recent`) and `src/ui/ItemCard.tsx` (`ItemLink`, `ItemCardHost`), opened through `useUi` (`openSearch`, `openItemCard`). Deep links: `#quests/q=<id>`, `#workshop/<station>`, `#skills/skill=<id>`, `#settings/<section>`.

## Text and translations

**Every new UI string must be present in both languages.** `tests/i18n/guard.test.ts` prevents hard-coded UI text in modules, shell and UI.

- Add keys to `src/i18n/cs.ts` (source of truth) and `src/i18n/en.ts`. TypeScript checks missing English keys; dictionary tests check parity and empty values.
- Components use `const t = useT()` and `t('key', { name, count })`. Plurals use `{ one, few, other }` with Czech 1/2–4/5+ and English 1/other. Number parameters use the UI locale; `{x:pct}` formats percentages and `{x:raw}` bypasses formatting.
- Use `src/ui/format.ts` for numbers, dates and times (`fmt`, `fmtDate`, `pct`, etc.).
- Czech game-data descriptions are in `src/core/data/*`, English in `src/core/data/en.ts`; `src/core/gametext.ts` selects language. Item, map, ARC, skill, station and weapon names stay in their game spelling.
- Never rewrite existing user text when switching languages. Create default content in `settings.lang`.
- Further notes: [i18n plan](docs/superpowers/plans/2026-11-12-i18n-en.md).

## Reference data and recognition

`scripts/gen-catalog.mjs` generates catalogue/weapon statistics from MetaForge, including each item's loot areas (`loot_area`, since 0.14.0). `scripts/gen-arctracker.mjs` generates quest/project/item reference data from public ARC Tracker endpoints. Both support cached offline generation (`--offline`); cache directories are ignored. Data generation is a developer action, not background user-account synchronisation. Do not redistribute game artwork or screenshots.

Recognition lives in `src/core/vision/`; reviewed changes in `visionImport.ts` / `progressImport.ts` are applied only after confirmation and a state snapshot. Unknown values must remain unknown. Game UI text must be English for supported recognition.

Digit/letter/head/body glyph generators live in `tests/vision/`. Some generators and local regression tests need private player samples: do not publish those samples. `tests/fixtures/vision/own/` is local-only; tests skip when required samples are unavailable. Use synthetic screen builders for public tests and demo data for published app screenshots.

## Manual smoke test (Windows release build)

Run it before a release that touches native windows. Never use the real game or the owner's real data without a byte-identical backup.

1. Back up `%APPDATA%\cz.arcops.companion` (for example `robocopy /MIR` to a scratch folder and compare SHA-256 of every file afterwards). Restore it byte-identical at the end.
2. Stand in for the game with a dummy foreground window whose process is named `PioneerGame.exe` (for example a small borderless full-screen WinForms window compiled with the .NET Framework `csc.exe` to `PioneerGame.exe` in a scratch folder). Check with `tasklist` that the real game is not running.
3. Start the release build with Ops enabled (Settings → Buddy and hotkey) and “Buddy lets clicks through to the game (recommended)” on.
4. Focus checks (0.22.1): with the dummy game in front, the Ops window has `WS_EX_NOACTIVATE`, `WS_EX_TRANSPARENT` and `WS_EX_LAYERED`; `WindowFromPoint` at the Ops centre returns the dummy game; a real click there keeps the dummy game as the foreground window and opens nothing. With the app window or the desktop in front, `WS_EX_TRANSPARENT` is gone and `WindowFromPoint` returns Ops; a click opens the field console. Turning the setting off makes Ops clickable over the game but still non-activating. Repeat the foreground-window checks for the widget window in Play (always transparent and non-activating) and after leaving Edit by switching back to the game. Regression check for the reveal bug: with the app's main window in front, make the game window appear (Ops is then created and placed); the main window must stay the foreground window, never Ops or the widget window. If synthetic input is blocked in your shell (an injected click never reaches the dummy and `GetLastInputInfo` does not reset), rely on the window styles and `WindowFromPoint`, which decide where a real click goes, and do the real click by hand.
5. Hotkeys still work during play (capture, widget Edit, Hide / show).
6. Quit the app, restore the data folder and verify the hashes.

## Native privacy boundary

No game memory reads, injection, game-file modification or game input. Optional buddy automation checks process names and foreground/window visibility. Since 0.22.1 the Ops window is non-activating and lets clicks through while the game is in the foreground; only window APIs are used (no hooks, no input injection, no cursor or key-state reads). Capture operates on monitor pixels and discards images after recognition. External data-source links are opened only by explicit user action. Installer detection closes Companion only, not the game.

Never use the owner's native data directory for demos, captures or tests. Use fresh browser contexts with explicit localStorage seeds. Keep screenshots free of game art and private information.

## Design and release documentation

The [specifications](docs/superpowers/specs/) describe intent; [plans](docs/superpowers/plans/) hold implementation details. Some specifications are historical, so verify behaviour against current code and tests before making user-facing claims. The [changelog](CHANGELOG.md) records changes from 0.4.0 to 0.16.0. The [original Czech README](docs/history/README-0.13.1.cs.md) retains the detailed technical release notes.
