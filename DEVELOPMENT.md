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

## Native privacy boundary

No game memory reads, injection, game-file modification or game input. Optional buddy automation checks process names and foreground/window visibility. Capture operates on monitor pixels and discards images after recognition. External data-source links are opened only by explicit user action. Installer detection closes Companion only, not the game.

Never use the owner's native data directory for demos, captures or tests. Use fresh browser contexts with explicit localStorage seeds. Keep screenshots free of game art and private information.

## Design and release documentation

The [specifications](docs/superpowers/specs/) describe intent; [plans](docs/superpowers/plans/) hold implementation details. Some specifications are historical, so verify behaviour against current code and tests before making user-facing claims. The [changelog](CHANGELOG.md) records changes from 0.4.0 to 0.16.0. The [original Czech README](docs/history/README-0.13.1.cs.md) retains the detailed technical release notes.
