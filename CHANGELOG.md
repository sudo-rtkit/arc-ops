# Changelog

Condensed from the existing Czech README. Versions below describe shipped behaviour, not planned features. Newest first. Implementation references remain in the [plans](docs/superpowers/plans/) and [specifications](docs/superpowers/specs/).

The [original Czech technical release notes](docs/history/README-0.13.1.cs.md) are preserved in full, including the intermediate 0.12.1 buddy fix later extended by 0.13.1. Release notes describe implemented versions; they do not imply an installer has been uploaded to GitHub Releases.

## 0.19.0 — Polish: “What's new”, a refreshed guide and a faster start

- **“What's new” after an update** (`src/core/whatsnew.ts`, data in `src/core/data/whatsnew.ts`, card in `src/shell/WhatsNew.tsx`). When the app version is newer than the last version this PC has seen, a non-modal card at the top of the main window lists short CS/EN highlights of every version since then (newest open, older ones folded under “Older versions”). It never takes focus and never blocks the module below it; it waits while the first-run guide is on screen.
  - Highlights link to their module: Raid prep, Maps, “What next?”, Search (opens Ctrl+K), Item Database (item card), Buddy and overlay settings (overlay App), Minigames, Quests, Profile. Following a link or “Got it”/× closes the card for good.
  - **Settings → About** shows the real app version and a “What's new” button that reopens the card with all versions 0.10.0–0.19.0 (searchable with Ctrl+K too).
  - The highlights are a small structured data file; CHANGELOG.md is never read at runtime. A test keeps the newest entry equal to the version in `package.json`, `tauri.conf.json` and `Cargo.toml`.
  - **Schema 16:** `whatsNew.seen`, the last version this PC has seen. It belongs to this PC like the Ops preferences: importing a backup, restoring a snapshot or resetting never changes it. A fresh install starts at the current version (no card; the first-run guide handles it). An older state without the field gets the last version that wrote its schema (schema 15 → 0.18.0, 14 → 0.16.1, 13 → 0.14.0, …, below 8 → 0.9.0), so you only see what is new to you. Same version or going back to an older version shows nothing; closing the card stores the newer of the two versions, so a downgrade and re-upgrade does not repeat it. Newer schema 17 is rejected.
- **First-run guide** gets four short steps after the builds step: the “What next?” advisor, Raid prep with the overlay Raid tab, the interactive map from your own screenshot, and Ctrl+K search with the item card (“Show me” opens the palette). Every step can still skip the rest of the tour. Players who already finished or skipped the guide are not sent through it again; they get the What's new card instead.
- **Faster start, smaller windows.** All modules except the Dashboard now load on first use in the main window (`React.lazy`, the module registry is unchanged) and are prefetched when the app is idle, so the first switch does not wait; a small “Loading module…” state covers the gap. If a module fails to open, only that page shows a message; the rest of the window keeps working. The overlay already loaded full modules lazily and keeps its loading state. The i18n core (`src/i18n/core.ts`) no longer carries the dictionaries: the buddy window, which only needs Ops lines and one label, no longer loads both 135 KB dictionaries.

  | Loaded at start (JS) | 0.18.0 | 0.19.0 |
  | --- | --- | --- |
  | Main window | 1,985 KB (588 KB gzip) | 1,709 KB (509 KB gzip) |
  | Buddy | 791 KB (233 KB gzip) | 526 KB (151 KB gzip) |
  | Overlay | 1,687 KB (497 KB gzip) | 1,700 KB (503 KB gzip) |

  Measured with `node scripts/bundle-size.mjs` after `pnpm build` (entry script plus modulepreload). The rest of the main and overlay start-up is React, the item catalogue and both dictionaries.
- **Rough edges fixed:**
  - Settings → About said “ARC Raiders Companion 0.9”; it now shows the real version.
  - The guide's progress in Settings (“step n of 11”) disagreed with the guide card (“of 10”) and counted the screenshot branch as an extra step; both now use one counter.
  - Searching for “What's new” or “Co je nového” finds Settings → About.
  - “Show me” on the search step works from the compact window too (switches to the full app first).
  - Switching to a module for the first time shows a module loading state instead of the generic “Loading local data…”.
  - The sidebar could miss a window resize that happened during start-up and stay expanded (or collapsed) at the wrong width; it now re-reads the width once it listens.
- No new permissions, commands, events, bus routes or relayed actions. Closing the card (`whatsNewSeen`) is a main-window-only action: the overlay relay blocks it like the other per-PC settings.
- Tests: unit tests for the version logic (first install, upgrade by several versions, same version, downgrade, unknown values, schema migration, backup import/reset not changing it, relay block) and the guide counter; new E2E tests in CS and EN for the card after a simulated upgrade, opening a highlight link, reopening from Settings, fresh install and same version (no card), closing with ×, and the new guide steps.

## 0.18.0 — Search everywhere (Ctrl+K) and the item card: “Why do I need this?”

- **Item card** (`src/core/itemCard.ts`, `src/ui/ItemCard.tsx`): one view for any item, built only from existing logic (no second calculation):
  - name, rarity, type, value, weight and stack from the catalogue and the item data; your stock (Inventory and Equipment);
  - **where it is needed now**, with counts and how many you have towards each: the same need list as the keep/sell/recycle advice and Cleanup (next station levels, Planner targets and crafting, your goals, available quest deliveries, running projects, unlearned blueprints), so the total matches Inventory; items found during an available quest are listed but not counted;
  - **later**: further station levels, locked quests and later phases of running projects (shown, not counted);
  - the **active raid plan** row (need, have, missing, marked as found);
  - recycle outputs, what recycles into it (top 8 by yield), trader offers;
  - loot area types from the catalogue and **your own map points** with a matching area type;
  - the **keep / recycle / sell verdict** with its reasons: for items you have, exactly the Inventory advice (with the “always keep” toggle); for items you have none of, the raid-prep verdict for a found piece.
  - Unknown data stays unknown: missing rarity, value, weight, stack or area type is shown as “unknown”, salvage outputs are not in the data and say so, and an item outside the data says that its details come only from your own data.
  - Each need links to its source (quest detail, Workshop station, Planner, goals, blueprints, Raid Prep, map).
- **Item names open the card** in Inventory (stock, equipment, shopping list, Cleanup, Material Planner), Workshop recipes, Raid Prep (list and evaluation), Item Database (recycling both ways, blueprint targets, traders) and quest/project requirements. It works in the main window, in the overlay (full modules) and from the compact window's shopping list, which opens the card in the full app.
- **Search everywhere:** a command palette on **Ctrl+K** (a local window shortcut, no new global hotkey) and a search field in the sidebar header. It searches items, quests, projects, stations, skills and builds (catalogue and your own), maps, ARC, modules, Settings sections and the “What next?” tips.
  - Fuzzy and diacritics-insensitive, in Czech and English names at once (e.g. `priprava` finds Raid Prep, `silent thief` finds “Tichý zloděj” in Czech): exact name, name start, word starts, substring, letters in order (`adv mech`) and one or two typos (`wirse`, `baterry`). Every word of the query must match.
  - Results are grouped (best group first) and keyboard-navigable (↑/↓, Enter, Esc). Enter opens the target: the item card, the quest with its detail open (`#quests/q=<id>`), a station in Workshop, a skill in the tree, the Builds tab, a map, a module, a Settings section or the tip's own target.
  - In the overlay: a Search button next to App and Ctrl+K while the overlay has focus; modules open in the App tab, Esc closes only the palette or the card. The palette moves focus only when its window already has focus; nothing activates a window.
  - In the compact window Ctrl+K switches to the full app and opens the palette.
  - **Recent searches** are per PC (`localStorage`, `arcops:search:recent`, at most 8) and are not part of the state or backups; they can be cleared from the palette.
- No schema change (15). No new permissions, commands, events, bus routes or relayed actions; the card's “always keep” toggle uses the existing `adviceKeep` relay.
- Tests: unit tests for search ranking (diacritics, CS/EN names, typos, grouping, recents) and the item card aggregation on real items (Wires: After Rain Comes now and Clamoring for Attention later; Metal Parts: Gunsmith 1; Acoustic Guitar recycling; Wires loot areas and map points; raid plan; an unknown item; consistency with the Inventory advice); E2E for Ctrl+K → item → card with “Where it is needed”, quest detail from the card, recents, sidebar field, Inventory link, compact “open in app” and search in the overlay, in CS and EN.

## 0.17.0 — Ops as an advisor: “What next?”

- **One advisor engine** (`src/core/advisor.ts`) turns your current state into a ranked list of next best actions. Each tip has a priority with a readable reason (“Why: …”), a short CS/EN title and detail, a target (a module, or an action carried out there: start a plan, evaluate the raid, save a backup) and a condition key. Rules only fire when your own data supports them; nothing is guessed:
  - **Upgrade ready**: every material for the next station level is in stock and nothing blocks it (higher when the station is your Planner or goal target).
  - **Evaluate the raid**: the active plan has a raid with loot logged after it started, or finds ticked in the overlay, and the evaluation is not in the journal yet.
  - **Plan out of date**: the active plan's list changed since it started (stock or goals).
  - **Prepare a raid**: no active plan, the default goals still miss something; with the recommended map.
  - **Free skill points**: budget minus spent points, only when you track your skill tree.
  - **Weekly Trials**: the week is not finished (only when you track Trials), with the days left in the week; priority rises towards Sunday.
  - **Hand in a quest**: a pinned quest whose delivery items are all in stock, with the trader.
  - **Stash almost full / full**: from the used/max header of your latest STASH screenshot (at most 14 days old). Screen import now remembers this header (used/max, only without a category filter).
  - **Cleanup**: Cleanup has surplus to sell or recycle and frees slots (folded into the stash tip when the stash is full).
  - **Backup**: the last backup saved from the app is 14+ days old, or the app has no record of a backup for a player with at least a week of data. Exporting a backup now records its time (also inside the backup file).
  - **Goal due**: an open goal due within 3 days, or past due.
- **Dashboard:** a new **What next?** card (right after the KPI strip, also for existing dashboards; it can be hidden or moved like any card) with the top 5 tips, and an **All tips** tab with priority, reason, “snooze for a week” and the list of hidden and snoozed tips with Restore / Restore all.
- **Dismiss and snooze.** A dismissed tip comes back when its condition changes (e.g. a new station level, another free point, a new stash reading); a snoozed tip comes back after a day (or a week). This is game progress: it is part of the backup. Resetting the Dashboard module also restores hidden tips; the backup time survives imports and resets.
- **Compact window:** the top tip sits under Ops; clicking it opens the full app on the tip's target, × hides it.
- **Overlay:** the overview's next steps are now the advisor tips (after any capture to review); clicking one opens the full module right in the overlay (Settings in the main window), × hides it through the main window.
- **Ops speaks the top tip** in your chosen personality, CS/EN, with at least two variants per personality for every rule: in the compact window while you use it (window focused) and when the overlay opens. Never over the game: the existing rule that nothing pops up or plays sound while the game is in the foreground is unchanged. New Settings toggle **Ops says “What next?” out loud** (this PC only, not in backups); with it off, Ops keeps the previous upgrade hint and tips stay visible on the Dashboard and in the overlay.
- **Schema 15:** `advisor` (dismissed tips with their condition key, snoozed tips, last backup time) and `vision.stash` (latest STASH header). Older states and backups load unchanged with empty values; the What next? card is inserted after the KPI strip.
- **Security model unchanged:** no new permissions, commands, events or bus routes. Four relayed overlay actions were added to the allow-list (`advisorDismiss`, `advisorSnooze`, `advisorRestore`, `advisorRestoreAll`); they accept only tip ids matching a fixed pattern (max 121 characters), keys cut to 200 characters and 1–30 snooze days, and keep at most 300 entries.

## 0.16.1 — Security hardening

### Bezpečnost (security)

Fixes from a read-only security review of 0.15.0, extended to the 0.16.0 overlay relay. None was exploitable remotely: there is no remote content, no network at runtime and a strict CSP. These are defence-in-depth and robustness fixes.

- **Image memory budget.** Dimensions are now read from the file header (PNG, JPEG, WebP, GIF, BMP) before any decode. Screen import, the map screenshot and map screenshots from a backup are limited to **8192 px per side and 40 MP** (about 160 MB of RGBA). A larger image, or one whose header cannot be read, is refused with a clear message (CS/EN) and nothing changes; a small file with huge dimensions can no longer exhaust memory. Map screenshots from a backup go through the same check and the same 4096 px downscale as a normal map import; their size comes from the real image, not from the backup. A stored screenshot over the budget is not opened. Screen import keeps at most 12 screenshots at once.
- **Least privilege per window.** `build.rs` now declares every app command (Tauri 2 app manifest), so a command works only for windows whose capability grants it. Each window has its own capability without `core:default`: the main window can only listen to events and call its own commands; the buddy and the overlay can listen, read monitors, send messages to the main window and call the few commands they use. Tray, menu, image-from-file, path and JS-side window move/resize/show permissions are gone everywhere. The buddy and the overlay set their own size and position through `win_place` (and the buddy drags through `win_drag`); Rust applies these only to the calling window. Sensitive commands also check the caller's window label (state, snapshots, data folder, launch info, focus, capture, overlay open/close/toggle, links).
- **Events cannot be spoofed.** No window may emit events from JavaScript. Messages between windows go through the `bus_send` command: Rust stamps the real sender, allows only main ↔ buddy and main ↔ overlay, and limits the type name and size. Events only Rust may send (tray menu, window close, game running/visible, capture, overlay open/closed) use a separate `native:` channel that no window can produce. The main window accepts each message only from the window that may send it (for example overlay edits only from the overlay).
- **Overlay relay.** Action names are checked against a fixed set and must be own functions of the store actions; argument strings, lists and object sizes are limited in addition to the existing 256 K total.
- **`__proto__`, `constructor` and `prototype` keys** are dropped when the saved state, a snapshot or a backup is read, and every normalizer skips them, so a crafted backup can no longer swap the prototype of individual records. Window-message checks use `Object.hasOwn` instead of `in`.
- **Save limit equals the load limit (20 MB).** A state that would be too large to load is refused at save time with a warning (the last saved file stays, the app no longer rolls back silently to the older `.bak` on the next start); the same applies to snapshots and to the raw import copy. Inventory entries are capped at 5000.
- **Raw imports** in `imports/` are pruned to the newest 10, matching the browser build.
- **Export** writes through a uniquely named temporary file in the target folder and renames it atomically, so an unrelated `<name>.tmp` there is never overwritten.
- **Capture:** asking for a capture with an old id no longer discards the newer pending capture.
- **Focus restore** after closing the overlay checks that the remembered window still belongs to the same process; otherwise focus is not restored (no input is ever sent).
- **Privacy:** removed absolute local paths from a committed design preview and a personal first name from the prototype demo.
- No schema change (14). New tests pin the per-window permission sets, the command manifest, the label checks and the native event channel, so any broadening fails the test suite.

## 0.16.0 — The whole app from the overlay

- New **App** entry at the right end of the field console's tab bar. It is a separate button, not a tab, so the existing tabs, their order (Raid stays last) and their arrow-key navigation are unchanged; Tab reaches it after the tabs. It opens a module picker grouped like the sidebar, with arrow-key navigation and Enter to open. Every full module runs inside the overlay: dashboard, profile, skill tree and build editor, workshop with recipes, inventory with equipment, cleanup, shopping and Material Planner, quests, maps with the interactive map, ARC database, weapons and loadouts, item database, raid prep, money runs, weekly trials, raid journal with the raid form, checklist, statistics and minigames. Links between modules work inside the overlay.
- A module opens in a **larger panel**: the overlay grows to your saved panel (by default almost the whole work area, at most 1560 × 1000), can be moved by dragging its bar and resized with the grip in the bottom-right corner (or the grip's arrow keys; Shift + arrows moves it). **Default size** resets it. Size and position are remembered on this PC only (local webview storage), never in the app state or backups. Going back to the picker or to a tab restores the normal console size. The panel always stays fully on one monitor's work area.
- **One writer.** The overlay never saves. Edits in full modules run on the overlay's copy for instant feedback and are sent to the main window, which accepts only known store actions with plain-data arguments (size limited), applies them through the same store actions and sends the new state back with an acknowledgement. New records (raids, map points, routes, builds…) get the same id in both windows. Until the main window confirms, pending edits are replayed on top of every incoming state; after confirmation the overlay shows exactly the main window's state, and an unconfirmed edit is dropped after 5 s. With the buddy switched off, the main window ignores overlay edits.
- **Main window only** (“Open in app” brings the main window to the same place): Settings & Backup (files, dialogs, state snapshots, hotkey, window and language), choosing, pasting or removing a map screenshot (the map itself, its points and notes work in the overlay), screenshot import in Inventory, progress from a screenshot file in Profile, and loot from a screenshot file in the raid form. Over the game, use the capture hotkey and the From capture tab instead.
- Focus rules are unchanged: the overlay takes focus only when you open or click it; resizing and moving never activate a window. Esc still closes the overlay, except while editing a field or with a dialog open in a full module.
- No schema change (14). Modules no longer import the main-window hub; sounds and “Open in app” go through a small host interface, and a test checks that the overlay never loads the main-window hub, window control or Settings.

## 0.15.0 — Post-raid evaluation and plan history

- **After the raid (Raid prep, step 5).** With an active plan, the app compares what you found with the plan: found versus needed per item, what is still missing, and newly completed requirements (e.g. “Gear Bench 2: all materials ready”, “Quest: delivery items complete”). It appears on its own once a FINDINGS capture has been confirmed into a raid entry, and in the overlay's capture result right after confirming. Without a capture, **Evaluate raid** uses the stock change since the plan started.
- Starting a plan now snapshots the stock of the listed items and which goals were still missing something. Found = the higher of the stock increase and the loot recorded for the raid (never the sum), so loot moved to Inventory is not counted twice. The evaluation only reads: inventory still changes only through the existing confirmed capture or raid-log flows.
- **Next raid:** the same goals recalculated over the stock after the raid, with the same raid prep list and map recommendation (with reasons); one click starts the next plan with a fresh snapshot.
- Ops sums the result up in your chosen personality (CS/EN, two variants each per personality): everything found, partial, nothing found, and upgrade ready. In the overlay it uses the existing status line after you confirm the loot; nothing pops up over the game.
- **Raid history in the Raid Journal (no separate log).** “Save to journal” attaches the plan to the raid entry from the capture, or to the raid logged since the plan started; otherwise it opens the usual raid log with the plan attached. Logging a raid while a plan is active offers “Save the active plan with this entry” (on by default). The entry stores the goals, chosen map, loadout, found-from-plan counts, completed requirements and an estimated value of the found plan items (catalogue sell value, when known). A plan is stored with one entry only. Journal entries with a plan show a “Plan found/needed” badge and a **Plan** detail; older entries remain valid.
- **Statistics: “Which maps help with your goals”** per map with data: planned raids, average plan units found per raid and how often the plan was fulfilled (everything found, or a requirement completed). Fewer than 3 planned raids on a map are labelled “little data”.
- Raid prep's map score uses this history as one more readable reason (“on average 3 plan units per raid (5 planned raids)”, +1 when the average is at least one unit), only from 3 planned raids on that map.
- Schema 14: `raidPlan.snap` / `raidPlan.open` and the optional `raids[].plan`. Older states and backups load without loss; a plan started in 0.14.0 has no snapshot, so a capture-based evaluation reconstructs the stock before the raid from the loot already moved to Inventory, and the manual evaluation asks you to restart the plan. Newer schema 15 is rejected. Material renames also cover plan items.
- Not included: an evaluation for STASH captures (the stock-based evaluation covers them), and assigning loot areas to maps.

## 0.14.0 — Raid prep and your own interactive map

- New **Raid prep** module (Raids group): pick goals (quests, the next level of a station, the next phase of a running project, or making money). The default selection is the pinned and in-progress quests plus the next upgrade from the compact window.
- One summed search list: missing = requirement − stock, computed by the Material Planner over the selected goals (the same source is never counted twice; a goal picked twice counts once). Each row shows the reason (e.g. “3× Gear Bench 2, 5× Quest: After Rain Comes”) and the loot area. Quests also list items found during the quest.
- Loot areas come from the MetaForge `loot_area` field, added to the generated catalogue at dev time by `scripts/gen-catalog.mjs` from its offline cache (234 catalogue items, 13 area types). Missing data shows as “Unknown” and is never guessed. Loot areas are not assigned to maps.
- Map recommendation with readable reasons: open quests from the selection on that map, the best money-run route for your phase, and map difficulty against your phase. Locked maps are listed last. You can always pick another map. Loadouts: choose a saved loadout; a money route shows its recommended loadout as text.
- **Start plan** saves only the choices (goals, map, loadout, route, time). The list is always recalculated from the current state; the app notes when stock or goals changed since the start. Ops says a short line in the chosen personality (CS/EN, two variants each) in the app window only; nothing pops up over the game.
- **Overlay Raid tab** (added after the existing tabs): the list with counts and loot areas, orientational “Found” ticks that never change inventory, an item lookup with keep / sell / recycle and a short reason (Cleanup advice plus the plan), and a small passive preview of your map with highlights. Without a plan it links to raid prep. The search field never takes focus on its own.
- **Interactive map in Maps**, using a screenshot of the in-game map that you add yourself (file, paste or drop). No game or community maps are bundled. Zoom 100–300 %, pan by dragging or arrow keys, tactical grid, colour-harmonise toggle per map, filters and legend for 11 point types and 13 loot areas. Click to add a point (type, loot area, optional name and note), drag to move (written on drop, Esc restores), edit, delete with Undo, and a keyboard point list with editable coordinates. Points use relative coordinates. Matching points for the active plan are highlighted (loot area match or a quest objective on the plan's map), with a note that spawns are not guaranteed. “Open detailed map on the web” uses the existing link and opens only on click.
- Screenshots are stored locally in the webview's IndexedDB, not in the state file. Large images are reduced to 4096 px on import with a notice. Replacing a screenshot shows a preview first; with a different resolution you can clear point positions (points are never moved silently). A failed import keeps the old screenshot and points. Backups include map screenshots only if you tick the option in Settings (large ones are stored reduced).
- Schema 13: `raidPlan` (empty in older states and backups) and extended map points. Older name-only points migrate without loss as notes without a position; they stay in the list and can be placed. Newer schema 14 is rejected.
- Design: Sol's map layer (`docs/design/maps/`): tokens, pin states, icons and glyphs (inline SVG from the design sprite, kept in sync by a test).
- Not included: post-raid evaluation, raid history, point clusters, and using the last hotkey capture as a map (hotkey captures stay in memory and are discarded after reading).

## 0.13.1 — Buddy visibility and requirement items

- Automatic Ops is visible only while the game is visible, not minimised, and the foreground window belongs to the game or Companion. Foreign foreground windows hide it after 400 ms; brief task switching and a missing foreground window do not cause flicker. Revealing Ops does not activate it. Hiding Ops also closes its overlay.
- The existing watcher checks foreground state every 150 ms and process names once a second, only with “open with game” enabled. Manual show/hide remains available.
- Renamed Cable Strippers to Cable Stripper throughout saved state and imported backups, including stock, recipes, goals, planner, loot, learned fingerprints, advice and tier lists. If both stock names existed, the higher count wins. State schema is unchanged.
- Added 39 quest/project requirement items as materials for stock, recognition, shopping, planning and quest progress. Emperor Gateway Conduit and Remote Raider Flare remain equipment and now count in shared requirements too.
- Offline data audit: 0/110 material-name mismatches; only the two equipment items remain outside materials. Stash and Workbench are intentionally absent from station material planning. Outpost corresponds to Sheltered Retreat; levels 2–4 retain diary values pending sources.

## 0.13.0 — Resume minigames

- All three games save in-progress rounds after each move: Tetris placement/rotation/held item, quiz question/answer/score, hack node/rotations/moves. Opening a round alone does not start progress. The hub offers Continue and New round.
- Replacing a round asks first, including a conflicting numbered URL. Only that game's round is discarded; records, streaks and paints remain. Escape cancels and returns focus.
- Completed rounds record rewards and completion together; returning after restart cannot award twice or increase a quiz streak again. Results offer replay or a new round.
- Restored rounds are checked against bounds, generated-round fingerprints, placement and game rules. Invalid or incompatible rounds are discarded for that game only, with a message.
- Schema 12 migrates older data with empty rounds; newer schema 13 is rejected. Backup imports preserve this machine's existing rounds and fill missing games only. Resetting minigames also clears rounds.
- A resumed quiz retains its original language. Abrupt termination during the normal delayed save can lose the last move. Minigames are for outside raids; the app cannot detect raid state.

## 0.12.0 — Ops's Hack and station materials

- Added a circuit-rotation puzzle: three solvable, seeded grids (4×4, 5×5, 6×6), source-to-all-outputs objective, no dangling wires, and any valid solution accepted. Compare moves against Ops's reference solution. Mouse and keyboard support (arrows, Enter/Space, Q).
- Added personality-aware CS/EN lines and active-window-only game sounds; Circuit Board paint after three hack rounds and Uplink for par or better. Hack rounds also count toward shared round milestones.
- Quiz streaks save after each answer, even if the round is abandoned; records and round totals still require completion. A streak of ten unlocks Night Watch immediately.
- Station-detail recognition reads known material names and have/need counts with confidence per field. Unknown names stay unknown; level-data fallback is uncertain. Confident name + have count can optionally update stock, never preselected, with review and a state snapshot.
- Recognition checks over Gear Bench/Gunsmith synthetic and local samples covered 1366–3840 px; smallest text can merge. Reported local evaluation: names 27/30 from pixels, 30/30 with level data; have/need 30/30 and no incorrect confident values. These are sample results, not a guarantee.
- Schema 11 adds hack records and migrates older saves with empty hack progress.

## 0.11.0 — Minigames and paints

- Added an explicitly opened, off-raid minigame module with numbered reproducible rounds. No live raid detection or unsolicited game-window popup.
- Stash Tetris packs a 5×4 bag for value, with mouse/keyboard, rotation, comparison against Ops's greedy packing and tips. Shapes are simplified by item type, not real game grid sizes; UI states that limitation.
- Recycling quiz: ten questions about recycling, uniquely matched station/quest requirements and clearly different sale values, with explanations and keys 1–4.
- Six cosmetic paints: Field Olive, Rusty Crate, Arctic, Night Watch, Desert and Gilded. Unlocks cover first round, Tetris 90%/100% of Ops, quiz 8/10, streak ten and ten rounds. Paints recolour panels while preserving sharp pixels, eyes and apricot outline, across all Ops views.
- Cosmetic rewards change minigame records/paints only. Sounds play only in the active app window. Optional dialogue may suggest a game only in a focused compact window or open overlay when nothing is missing.
- Schema 10 migrates older saves; backups merge paint unlocks and retain higher records. Settings can reset this module.

## 0.10.2 — Quest objectives and installer upgrades

- Manual per-objective checkboxes and n/m progress. Completing objectives does not complete the quest; completing a quest does not alter objectives. Compact and overlay show objective progress once any objective is checked, otherwise delivery-item progress.
- Quest captures propose checked objectives only when count matches known data; uncertain recognition needs confirmation. Unchecking stored objectives is optional and never preselected. Screenshots never offer to complete a quest.
- NSIS defaults to installing over the current installation rather than uninstalling first; same-version reinstall is supported and local data remains. Restart Manager detects a running installed Companion, including tray-hidden windows, and asks to close it; the game is unaffected.
- Schema 9 adds objective progress; older saves migrate with no checked objectives, backups include progress.

## 0.10.1 — Progression recognition and overlay modules

- Local pixel recognition for English game screens: profile level/XP/coins; workshop overview and station detail; trader quest/objectives; skill overview totals and individual tooltip ranks. Supports scaled layouts, with uncertainty handling.
- Profile file/paste/drop and hotkey → overlay use review and explicit confirmation, with a state snapshot before writing. Confident fields can be preselected; uncertain values require approval, unreadable values stay “?”.
- Workshop overview has seven ordered station tiles; only Gear Bench/Gunsmith levels verified against detail are confident, others need confirmation. Scrappy has no readable level. Material rows were informational at this version (expanded in 0.12.0).
- Quest capture can establish “not completed”, offer correction and optional pinning; objectives were informational until 0.10.2. Skill branch totals never infer ranks; tooltip arrows identify current versus proposed rank.
- Overlay adds Profile, Inventory, Workshop and Skills with validated edits routed through the main store; full charts, recipes, builds and trees open in the main app. Tutorial can load a profile capture. Smaller Ops row in compact; tutorial card no longer obscures content.
- Schema remains 8.

## 0.10.0 — Bedňák 2.0, personalities and tutorial

- New original Ops art: 96 px corner, 128 px detail and exact 2× composition. Level 0–75 growth and collected parts remain compatible; unknown manual parts revert to automatic selection without losing the collection. App/tray icons use Bedňák art.
- All 23 animations connect to appearance, scan/review/write, outcomes, level-up, sleep/wake, drag/move, dialogue and tutorial events.
- Synthesised Web Audio sounds (no game assets), default 25% volume. Only the actively used app window or touched buddy plays; a foreground game with closed overlay stays silent.
- Matter-of-fact, Friendly (default) and Cheeky personalities, CS/EN line variations avoiding immediate repeats. Unsolicited dialogue only while interacting with Ops.
- Nonmodal, skippable first-run guide: profile/backup, first capture, inventory/workshop/quests/builds/compact and buddy setup. Hide until restart, resume, restart from Settings, or disable dialogue/tutorial. Does not take focus.
- Schema 8 adds local Ops preferences/tutorial progress; importing backups or resetting progress does not replace this machine's preferences.

## 0.9.0 — Compact main window

- Compact 420×720 main-window mode (380–480 wide, 520–900 high; short layout below 620). Profile/XP/coins/Ops status; 1–5 active quests, pinned first; have/need shopping with named rarities; next planned or reachable upgrade; persistent message area. Empty state leads to profile setup.
- Capture uses the existing buddy review path; disabled features show guidance. Raid logging and stash cleanup expand to their full-app location. Quests can be pinned.
- Toolbar, tray and local Ctrl+Shift+M toggle modes; position and size persist per mode, off-screen windows return to a monitor. Compact-only always-on-top (Ctrl+Shift+P), off by default, is removed in full mode and restored on return. Compact windows are excluded from capture.
- Close dialog offers tray/quit with remember choice; change later in Settings. Tray icon supports taskbar themes. See the compact design and implementation plan for native-window details.
- Tray actions: Open, Compact mode, Ops (when enabled), Quit. Left click restores the last mode; a second launch restores even a hidden window. Startup while the game runs stays in the background in either mode; data changes never activate the window.
- Schema 7 adds window preferences and pinned quests. Older saves use defaults; backup restore/import/reset preserve this machine's window settings even though backups carry them.

## 0.8.1 — Post-raid loot via Ops

- Capture distinguishes inventory STASH from post-raid FINDINGS; only backpack/quick-use loot is read on the latter. Unsupported screens are rejected; stash and loot batches never mix. Progression screens gained support later in 0.10.1.
- Overlay review selects a recent or new raid and subtracts its recorded gear/loadout. Without known gear, explicit manual review is required. Equipment is not read; loadout value never becomes coins or earnings.
- Confirmation and pre-write snapshot; loot optionally updates inventory by difference. Signatures prevent applying the same capture twice; a replacement capture explicitly replaces prior scanned loot rather than adding it. Schema remains 6.

## 0.8.0 — Skill build catalogue

- Twelve exact point-allocation builds, including 91-point variants and Buldozer/Ghost theory builds. Tags, sorting, miniature/large read-only trees, branch totals, three key skills, CS/EN descriptions, sources and game-version context (2.0–2.3).
- Load as plan, compare with current tree (extra/missing points and 2,000 coins per reset point), save as own build. Existing runner/looter plans remain. Source links open only on click; schema remains 6.
- Installer no longer auto-launches the app. Startup while PioneerGame is running is minimised without focus and shows an in-app notice.

## 0.7.0 — Buddy, overlay and hotkey

- Buddy is off by default: no window, hotkey or game watcher until enabled. Draggable transparent always-on-top Ops, remembered per-monitor position, 1×/2× size, level-driven forms/parts and wardrobe.
- Field console opens from Ops and closes with Ops/Escape/hotkey. Overview, quests, shopping and capture review; Windows 11 acrylic, opacity 70–100%. Writes go through the main window and a state snapshot.
- Registered hotkey captures the foreground monitor to memory, excluding Ops/overlay, then discards pixels after reading; unsupported screens are discarded. No input is sent to the game. Optional process-name-based game watcher (timing later changed). Schema 6.

## 0.6.0 — Stash advice and reference tools

- Keep/recycle/sell advice, player “always keep” choices, cleanup sorted by value per slot with freed-space/sale summaries. Nothing is automatically deleted or sold.
- Item Database: recycling both ways with owned-item highlighting; manual blueprint tracking/missing filter; dated trader offers with price/quantity/limit/level; personal S–D item/weapon tier lists with mouse/keyboard dragging.
- Compare 2–4 tier-I weapons with highlighted best values. Maps links to Embark's conditions page only on click. Project progress and next-stage needs feed keep advice.
- Numeric/reference data from public ARC Tracker and MetaForge, generated during development from cached data; no game artwork/descriptions. Schema 5 with migration/backups.

## 0.5.0 — Catalogue, equipment and quests

- Offline item catalogue: names, categories, rarity and icon fingerprints, no images/descriptions; unofficial MetaForge source disclosed in Settings. Generated only during development with offline-cache support.
- Tooltip names/labels/stack improve slot recognition. Equipment stock supports non-material items and exact reviewed counts. Raid screenshot loot subtracts entered gear before review.
- Trader quests with manual completion, delivery needs in shopping/planner, seasonal projects. Public ARC Tracker reference data is generated during development without account login/linking.
- Player-owned test screenshots stay local and ignored; tests requiring them skip when absent.

## 0.4.0 — Screenshot import

- Inventory → From screenshot accepts paste, drop or files. Reads STASH slots/counts, occupancy checksum and coins; confirmation table precedes replacing reviewed stock/coins and saving an import state snapshot.
- Screenshot images are not saved, only numeric learned icon fingerprints. At this version capture was manual (optional hotkey capture arrived in 0.7.0). No game communication.
