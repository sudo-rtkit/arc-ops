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

Keep core independent. Modules read state and call actions, rather than writing storage or duplicating calculations. Browser `localStorage` is for development/testing; desktop storage uses native files. Normalisation migrates older state and rejects unsupported newer backup schemas. Use the implemented schema in `src/core/state.ts` as authority rather than historical examples in specifications.

## Text and translations

**Every new UI string must be present in both languages.** `tests/i18n/guard.test.ts` prevents hard-coded UI text in modules, shell and UI.

- Add keys to `src/i18n/cs.ts` (source of truth) and `src/i18n/en.ts`. TypeScript checks missing English keys; dictionary tests check parity and empty values.
- Components use `const t = useT()` and `t('key', { name, count })`. Plurals use `{ one, few, other }` with Czech 1/2–4/5+ and English 1/other. Number parameters use the UI locale; `{x:pct}` formats percentages and `{x:raw}` bypasses formatting.
- Use `src/ui/format.ts` for numbers, dates and times (`fmt`, `fmtDate`, `pct`, etc.).
- Czech game-data descriptions are in `src/core/data/*`, English in `src/core/data/en.ts`; `src/core/gametext.ts` selects language. Item, map, ARC, skill, station and weapon names stay in their game spelling.
- Never rewrite existing user text when switching languages. Create default content in `settings.lang`.
- Further notes: [i18n plan](docs/superpowers/plans/2026-11-12-i18n-en.md).

## Reference data and recognition

`scripts/gen-catalog.mjs` generates catalogue/weapon statistics from MetaForge. `scripts/gen-arctracker.mjs` generates quest/project/item reference data from public ARC Tracker endpoints. Both support cached offline generation (`--offline`); cache directories are ignored. Data generation is a developer action, not background user-account synchronisation. Do not redistribute game artwork or screenshots.

Recognition lives in `src/core/vision/`; reviewed changes in `visionImport.ts` / `progressImport.ts` are applied only after confirmation and a state snapshot. Unknown values must remain unknown. Game UI text must be English for supported recognition.

Digit/letter/head/body glyph generators live in `tests/vision/`. Some generators and local regression tests need private player samples: do not publish those samples. `tests/fixtures/vision/own/` is local-only; tests skip when required samples are unavailable. Use synthetic screen builders for public tests and demo data for published app screenshots.

## Native privacy boundary

No game memory reads, injection, game-file modification or game input. Optional buddy automation checks process names and foreground/window visibility. Capture operates on monitor pixels and discards images after recognition. External data-source links are opened only by explicit user action. Installer detection closes Companion only, not the game.

Never use the owner's native data directory for demos, captures or tests. Use fresh browser contexts with explicit localStorage seeds. Keep screenshots free of game art and private information.

## Design and release documentation

The [specifications](docs/superpowers/specs/) describe intent; [plans](docs/superpowers/plans/) hold implementation details. Some specifications are historical, so verify behaviour against current code and tests before making user-facing claims. The [changelog](CHANGELOG.md) records changes from 0.4.0 to 0.13.1. The [original Czech README](docs/history/README-0.13.1.cs.md) retains the detailed technical release notes.
