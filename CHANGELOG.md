# Changelog

Condensed from the existing Czech README. Versions below describe shipped behaviour, not planned features. Newest first. Implementation references remain in the [plans](docs/superpowers/plans/) and [specifications](docs/superpowers/specs/).

The [original Czech technical release notes](docs/history/README-0.13.1.cs.md) are preserved in full, including the intermediate 0.12.1 buddy fix later extended by 0.13.1. Release notes describe implemented versions; they do not imply an installer has been uploaded to GitHub Releases.

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
