# ARC Raiders Companion — overlay widgets

Design handoff only, 13 November 2026. Start with [review.html](review.html). All additions are in this folder; no product code, build, dev server or commit. Open HTML directly from disk. The little navigation script links static design states; controls do not implement dragging, saving, capture or native focus. Another agent implements those behaviours.

## Direction

Separate player-selected widgets leave the game visible between them. No navigation rail, central console or darkening in Hra. Graphite #141719 / #1D2225, apricot #F4AD82, cream #F2EEE7, secondary #C8C7C2, muted #A2A8AA, Chakra Petch headings, Inter 14px body and JetBrains Mono 12px metadata reuse overlay-v2. Small clipped-instrument accents and sparse frames retain the field-console identity without adding HUD noise. No ambient animation, pulsing badges or unsolicited Ops speech during play.

Only personal recorded data, goals, deterministic advice and progress belong here. No map, coordinates, compass, position, minimap, live loot, opponents, event predictions or tactical data. Loot chips classify the player's own plan; they do not claim spawn locations. Sample game items, upgrades and progress are fictional fixtures, not verified current game requirements. **Power Cable, Battery, Wires and Gear Bench 2 remain English in Czech UI.** Loot categories retain their catalog English names, codes and colours. Electrical #E6D16F / E, Technological #BAABF2 / T, Industrial #F2AA88 / I use the actual glyphs from maps/assets/glyphs; inline SVG inherits the chip colour and works offline. Shape + code + name are always present.

The roadmap classifies overlay and capture as yellow-zone features: opt-in, off until enabled, labelled “Čeká na ověření u Embarku / Awaiting verification with Embark” during setup. These designs are not an assertion of Embark approval. Automatic capture is also off and outside raids only; optional layout following must not introduce in-raid image analysis. Read the existing roadmap for release gating.

## Files

18 standalone HTML fixtures and 20 PNGs. Every fixture uses an original, seeded abstract industrial background (`scene.svg`), or a bright striped stress background. No real game or community screenshot. Sibling local font, glyph and Bedňák II assets are referenced, not duplicated; keep the neighbouring design directories available for offline HTML viewing. Their provenance and OFL font licences stay in the source folders. PNGs are standalone.

| HTML / PNG stem | View |
|---|---|
| raid-1080, lobby-1080 | Hra, 1920×1080 |
| raid-1440, lobby-1440 | Hra, 2560×1440 |
| raid-ultrawide, lobby-ultrawide | Hra, 3440×1440 |
| edit, edit-en | Edit with toolbar, resize handles and all ten catalog entries; Czech / English |
| drag | Original outline, moved widget, edge guide and 8px grid snap |
| settings | Per-widget opacity, density, size, anchor, lock and removal |
| presets | One-click Raid / Lobby, save / rename, optional state-following |
| hidden | Widget canvas empty; optional Ops entry remains for recovery |
| hidden-clean | Absolutely no companion pixels; recover with configured hotkey or tray |
| catalog | All 10 widgets in both densities, 1920×2060 contact sheet |
| opacity-default, opacity-30 | Bright busy stress background; default and minimum setting |
| application | Explicitly opened larger app panel; schematic existing module, not an app redesign |
| search | Ctrl+K in Edit; explicit search field and result |
| settings@2x.png, widget@2x.png | DPR 2 detail crops; sizes in validation.json |

`tokens.css` is the visual token proposal. `build.py`, `mockup.css/js`, `render.mjs` and `build_review.py` are disposable fixture tooling. Recreate with `python docs/design/overlay-widgets/build.py`, `node docs/design/overlay-widgets/render.mjs`, then `python docs/design/overlay-widgets/build_review.py` using existing Playwright + Edge; no dependency install or server. `manifest.json` lists export dimensions. `validation.json` contains contrast mathematics, render inventory, font loading, bounds, runtime errors and network checks. It checks mockups, not the app.

## Widget registry and sizing

All sizes below are logical CSS pixels (width × height), including framing, excluding Edit handles. Suggested target heights may grow with translated content. They are sizing contracts for implementation, not hard clipped fixture boxes. Expanded rows show more detail; compact keeps the same essential goals and counts. Instance per module initially limited to one to prevent duplicate checklist ambiguity.

| Widget (CZ / EN) | Compact preferred | Expanded preferred | Minimum | Maximum |
|---|---:|---:|---:|---:|
| Seznam k nalezení / To find | 344×248 | 344×336 | 280×200 | 480×560 |
| Připnuté úkoly / Pinned quests | 344×128 | 344×176 | 280×112 | 480×480 |
| Nákupy / Shopping | 344×120 | 344×208 | 280×112 | 480×480 |
| Co dál? / What next? | 344×144 | 344×192 | 280×128 | 440×320 |
| Nechat / prodat / recyklovat / Keep / sell / recycle | 344×224 | 344×280 | 300×208 | 480×480 |
| Obsazenost skrýše / Stash capacity | 280×128 | 280×192 | 224×112 | 400×256 |
| Týdenní výzvy / Weekly challenges | 344×104 | 344×192 | 280×96 | 480×400 |
| Ops / Ops (optional information card) | 224×128 | 344×192 | 192×112 | 384×256 |
| Ke kontrole / To review | 224×104 | 344×152 | 192×96 | 400×240 |
| Automatické snímání / Automatic capture | 224×88 | 344×176 | 192×80 | 400×240 |

Ops entry is a separate fixed 96×96 utility with a 64px sprite, not the information card. Default bottom-right 24px inset, draggable in Edit. It may be disabled. Use the existing corner/levels/00.png static outfit; all sprite poses static in Hra, nearest-neighbour at integer scale. The outfit can later follow the selected buddy level without changing these bounds.

At minimum sizes, wrap titles and preserve counts; do not shrink fonts. If rows do not fit, show the first complete rows and an explicit “+ {n} dalších / + {n} more” summary (opens the widget in Edit); never silently crop a row. Expanded tall widgets scroll only in Edit. In Hra no mouse scrolling or interactive affordance: overflow remains a visible summary. Empty states: “Nic k nalezení / Nothing to find”, “Žádné připnuté úkoly / No pinned quests”, “Žádné nákupy / No shopping items”, “Žádný další krok / No next step”, “Vyhledej předmět v Úpravách / Search for an item in Edit”, “Skrýš není zadaná / Stash not recorded”, “Žádné zapsané výzvy / No recorded challenges”, “Připraven. / Ready.”, “Nic ke kontrole / Nothing to review”, “Vypnuto / Off”. Unknown counts use an em dash, not a fabricated zero. Keep stale/unknown state visible in expanded density: “Stav není aktuální / Data may be outdated”.

## Presets and placement

**Raid:** To find compact at top-left (24,24), quests compact at (24,300); optional Ops entry bottom-right (24,24 inset). Both lists include goal counts; the search list retains all three fixture items. Reserve central game area. No forced capture indicator if capture is disabled.

**Lobby:** What next expanded top-left (24,24); Shopping expanded left at (24,260); quests expanded top-right inset (24,24); stash expanded top-right inset (24,268). Optional Ops bottom-right. No capture or review widgets added automatically. The player may remove every data widget, including all default ones. The hidden state does not destroy the preset.

Switching a preset is one click on its card; edits to the current layout autosave locally before switching. Two shipped presets are templates: personal changes are overrides and can be reset without changing the other layout. Save as creates a named copy, Rename applies to the personal copy. Validate nonempty unique names (1–40 characters). Reset opens “Obnovit toto rozložení? / Reset this layout?” with “Zrušit / Cancel” and “Obnovit / Reset”; it resets layout only and remains undoable. Undo affects position, size, opacity, density, removal, additions and reset within the current Edit session. Keyboard Ctrl+Z / Ctrl+Shift+Z supports undo/redo.

Optional Follow game state is unchecked and requires separately opted-in capture. Use only an already available lobby/raid transition from allowed outside-raid screens, not continuous in-raid recognition. Unknown state keeps the current preset. Switching is silent and never focuses the app. Defer during Edit, a modal or a drag; apply after Done. Manual selection temporarily suspends following until the next explicit re-enable; show “Automatika pozastavena / Automatic switching paused”. No surprise layout changes over a player's manual choice.

## Modes, mouse and focus

**Hra / Play:** zero veil, display-only widgets, no checkboxes, input caret, handles or hover actions. Quest ticks show recorded progress; they are not active controls. Item lookup displays its last explicit result as text, with a passive “Hledání pouze v Úpravách / Search only in Edit” hint; no focusable input in the product's Play DOM. The catalog sheet illustrates its Edit field. Whole widget canvas ignores cursor events. Data refresh never requests focus. Ctrl+K is scoped to Edit, not a global game shortcut.

**Ops exception:** a click-through window cannot receive clicks. Do not solve this by watching cursor position, toggling the monitor's hit-testing under the mouse or globally intercepting game clicks. The optional 96×96 Ops entry is the only input island in Play, hosted separately. Clicking the sprite toggles Hide/Show; clicking its labelled lower **Úpravy / Edit** button opens Edit. The sprite and lower button have distinct accessible names, keyboard actions and tooltips. This deliberately divides the two requested Ops actions. Hide/Show itself is a non-activating action and leaves focus in the game. Clicking Edit is explicit permission to focus the companion. If the player wants absolutely every pixel and mouse position free, disable Ops entry and use the two configured global hotkeys (Edit and Hide/Show), or the tray. No invented global key combination; handle registration conflicts in setup. The hidden-clean export demonstrates zero pixels. Hidden with entry retains only the optional recovery utility, not a data widget.

**Úpravy / interakce / Edit / interact:** explicit hotkey or Ops lower button enables cursor events on the shared canvas, enables focus, then focuses the last valid Edit control (toolbar Add on first open). 20% veil, never 80%; game remains recognisable. Controls: Add, layouts, undo/reset, App, Ctrl+K, Hide all, Done. Drag and resizing never mutate player inventory or quest state. Checklists may be edited here as personal progress, using existing app semantics. Search and item lookup become interactive only here. App opens the existing full app in an explicitly requested, bounded larger panel (1000×650 at 1080p; use existing full modules rather than duplicating their logic); Back returns to Edit. No web or cloud lookup.

**Exit:** Done or Esc saves the layout and returns to Play; Esc first dismisses a popup/search and restores its opener. During drag/resize Esc cancels that movement; second Esc exits Edit. Focus restoration targets the game window that was foreground before entry, only if focus still belongs to the companion. If the player Alt+Tabbed elsewhere, do not steal it back. On ordinary exit: remove Edit UI, restore cursor ignoring and nonfocusable state, restore game focus via supported native handling. Never pass the closing click through to the game; do not replay mouse events. Update/screen changes/auto-follow must not open Edit. Hotkey handling and recovery need a native smoke test; static HTML cannot prove this.

## Snapping, anchors and screen changes

8px movement and size grid; 24px default safe inset. The 24px safety area is a default, not a forbidden strip: players can drag to the exact monitor edge (0px). Snap to edge, safe inset, other widgets' edges and centres within 8 logical px; nearest target wins, tie prioritises edge then aligned widget then grid. Show one horizontal and one vertical high-contrast apricot guide with dark underlay; no permanent grid in Hra. Hold Alt temporarily bypasses snapping. Clamp placement to visible monitor bounds; prevent accidental unreachable handles. Overlap is allowed intentionally; do not push other widgets automatically. Selected widget temporarily rises during Edit; release restores stored stacking order. Offer Bring forward / Send backward for intentional overlap.

Persist horizontal anchor left/right/centre and vertical anchor top/bottom/centre by nearest edge or midpoint after release; ties keep previous anchor to avoid oscillation. Positions store offsets in logical px from that anchor, not percentages of screen width. Edge snapping fixes the matching axis; a centre anchor stores a signed offset from monitor centre. Widget size stays in logical px when resolution changes. Recompute anchored coordinates, then clamp to the available monitor. The 1080p, 1440p and ultrawide exports show unchanged widget sizes/insets; right widgets remain attached to the right, not stranded at an old absolute x. No automatic stretching across ultrawide.

Resolve display in physical coordinates but do all layout in DIPs/CSS px using that monitor's actual DPI scale. 1920×1080 at 150% gives only 1280×720 logical space; do not apply an extra CSS transform. 2× detail crops demonstrate DPR, not larger content. On DPI or monitor changes migrate bounds atomically, reflow text, retain minimum readable font and clamp saved width/height to the current viewport. If the viewport is smaller than a widget's minimum, cap to available bounds and scroll in Edit with an overflow summary in Play. Do not downscale the whole UI. Re-evaluate max height minus the 24px safe margin; toolbar becomes two rows at narrow logical sizes and popovers become bounded scroll areas. Test Windows 100/125/150/200%, mixed-DPI monitors, negative monitor coordinates, unplug/replug and HDR natively. No automatic opening/focus on these events.

## Persistence

Store app-local machine preferences, separate from player records and all backups/exports/imports. Schema-versioned and written atomically. Local state includes named layouts, active layout, widget IDs/enabled flags, anchor axes/offsets, width/height, density, opacity, lock, z-order, monitor hint, optional Ops entry and follow-state preference. Stable IDs, not Czech strings; validate finite numbers, bounds and unknown IDs. Removed modules disappear gracefully; never auto-enable a new module. A disconnected monitor falls back to the game monitor/primary and clamps safely without a popup. Layout names may survive restart; Hide-all is transient session state so it cannot silently disable a restored session. A fresh PC starts from defaults, overlay still opt-in. Backup restoration must not overwrite this record.

Example design schema (not production implementation):

```json
{"version":1,"activeLayout":"raid","followState":false,"opsEntry":true,"layouts":[{"id":"raid","name":"Raid","widgets":[{"id":"to-find","anchorX":"left","anchorY":"top","offsetX":24,"offsetY":24,"width":344,"height":248,"opacity":0.85,"density":"compact","locked":false,"z":0}]}]}
```

## Keyboard and accessibility

In Edit, Tab / Shift+Tab visits toolbar then widgets in stable registry order, independent of visual placement. Enter/Space activates; all icon buttons have labels/tooltips. Catalog uses real buttons, dialog/popover focus is trapped when modal, Esc restores opener. Layout menu has arrow/Home/End navigation. Ctrl+K opens local search across widgets and full app modules without enabling them. Clear focus ring: 2px apricot + dark offset; no colour-only selection.

Focus a widget header and use arrows to move 8px, Shift+arrows 1px; Ctrl+arrows resize 8px, Ctrl+Shift+arrows resize 1px. Numeric position and size fields in the implementation's settings give a pointer-free alternative. Lock suppresses drag, resize and keyboard geometry changes, not settings/removal; a labelled lock badge explains why. Delete on a focused header removes the widget with an Undo announcement, never while typing in an input. Live region announces final geometry after release, save/removal and count updates only in Edit; no continual game-time narration. Restore focus to Add after deleting the focused widget. Respect reduced motion; no transitions needed for snapping. All control targets ≥36px; reserve 44px where space permits. Visible 9px corner handles need ≥24px hit targets and numeric alternatives; extend with transparent hit areas in Edit only. Eight resize handles (four corners and four edges) in implementation; illustrations emphasise the corners. Screen-reader headings identify widget purpose and density; progress bars have textual used/max equivalents.

High-contrast option: opaque graphite surfaces, no blur/translucency, same layout. Honour text scaling by reflow/scroll, not truncating actions. Checklist states use tick + words/counts. Don't use colour alone for capture status, stash fullness or loot areas. No focusable hidden widgets in Play. A display-only Play card should not announce every data refresh. The global shortcuts and tray provide recovery even with zero widgets.

## Contrast and opacity

Recommend **85% panel fill**; slider range **30–100%**, text ink always 100%. Retain a **90% minimum fill directly behind every text block**, including title, metadata and counts. It is a clamp on readable surfaces, not an invisible change to foreground alpha or whole-window opacity. The tiny outer frame can follow the requested slider value; the text interior remains protected. At 100%, everything is opaque. Edit toolbar, popovers and controls use opaque graphite; apricot buttons use #241810 text. No blur is needed or credited.

`validation.json` computes pure-white, bright warm and dark busy component backgrounds at both settings, checks all five text tokens and all three loot-chip colours, plus accent-button text and non-text control contrast. Minimum protected normal-text ratio is **4.914:1**, above 4.5:1. The file also records raw unprotected ratios, including failing low-opacity examples, to make the clamp requirement explicit. Calculation deliberately ignores extra darkening from the shell and Edit veil. White is the conservative upper bound for every sRGB backdrop channel; the stripe fixtures show spatial busyness. This is mathematical verification of design tokens, not certification of native HDR, antialiasing or visual performance in the real game.

## Native implementation recommendation

**One monitor-sized transparent widget canvas + one optional tiny Ops input window. Do not create one WebView/window per widget.** A shared canvas gives one React tree, cheaper data updates, straightforward alignment guides, atomic layout changes and one predictable z-order. Per-widget windows add WebViews, focus and DPI coordination, gaps in dragging and sibling-window ordering for no benefit while every card is read-only. A pure single native window is suitable only if the clickable Ops entry is disabled: window-wide cursor ignoring prevents any part of that same window from receiving clicks. The extra 96×96 nonactivating utility is an intentional, bounded exception, not one window per module. The optional larger app can use the existing app window or content surface; do not spawn duplicates of it.

Use Tauri 2 transparent, undecorated, always-on-top, skip-taskbar window, hidden on startup until opted in. Do not use exclusive fullscreen for the overlay. Rust `set_ignore_cursor_events(true)` in Hra, false only after explicit Edit entry; counterpart JS is `setIgnoreCursorEvents`. Manage focusable state deliberately rather than relying on CSS `pointer-events:none`, which cannot pass native clicks to another process. Official API documents the window-wide operation: [Tauri window reference](https://v2.tauri.app/reference/javascript/api/namespacewindow/) and [Rust WebviewWindow source](https://docs.rs/crate/tauri/2.0.0/source/src/webview/webview_window.rs). [Official custom window guide](https://v2.tauri.app/learn/window-customization/) describes decoration/customisation. Request only needed Tauri capabilities.

The Ops Play window must use native non-activation semantics for Hide/Show; `set_focusable` alone should not be assumed to guarantee every Windows mouse-activation case. Validate activation with the game's foreground HWND and Windows messages. Only its explicit Edit action enables/requests focus on the canvas. If non-activating behaviour cannot be delivered reliably, disable the Play entry and retain hotkey/tray access rather than relaxing click-through. Tauri JS focus does not restore another process's game focus by itself; implement native restoration within Windows foreground rules and test failure fallback.

Support **borderless windowed games only** for this feature; exclusive fullscreen is outside the supported overlay contract. Always-on-top is not a promise to cover exclusive fullscreen. No DLL injection, renderer hooks, process-memory access or game-input automation. Pause/hide overlay on a game monitor change as needed without stealing focus. Prototype background belongs only to these design documents and must never ship as a fake game view in the product.

## Complete Czech / English copy

Czech default. [labels.md](labels.md) and [labels.json](labels.json) list **every rendered UI string**; read this section together with that table as the bilingual UI specification. Keep dynamic game catalog values untranslated. Additional implementation-only strings specified here are listed below. Placeholder braces are parameters, not literal UI.

| Čeština | English |
|---|---|
| Hra | Play |
| Úpravy / interakce | Edit / interact |
| Skrýt vše | Hide all |
| Zobrazit vše | Show all |
| + {n} dalších | + {n} more |
| Nic k nalezení | Nothing to find |
| Žádné připnuté úkoly | No pinned quests |
| Žádné nákupy | No shopping items |
| Žádný další krok | No next step |
| Vyhledej předmět v Úpravách | Search for an item in Edit |
| Skrýš není zadaná | Stash not recorded |
| Žádné zapsané výzvy | No recorded challenges |
| Nic ke kontrole | Nothing to review |
| Stav není aktuální | Data may be outdated |
| Obnovit toto rozložení? | Reset this layout? |
| Zrušit | Cancel |
| Znovu | Redo |
| Automatika pozastavena | Automatic switching paused |
| Název rozložení | Layout name |
| Uložit | Save |
| Zadej jedinečný název (1–40 znaků). | Enter a unique name (1–40 characters). |
| Posunout dopředu | Bring forward |
| Posunout dozadu | Send backward |
| Zamčeno | Locked |
| Odemknout widget | Unlock widget |
| Vodorovná poloha | Horizontal position |
| Svislá poloha | Vertical position |
| Šířka | Width |
| Výška | Height |
| Vysoký kontrast | High contrast |
| Rozložení uloženo | Layout saved |
| Widget odebrán. Zpět | Widget removed. Undo |
| Widget přesunut: {x}, {y} | Widget moved: {x}, {y} |
| Velikost widgetu: {w} × {h} | Widget size: {w} × {h} |
| Zkratka je obsazená. Zvol jinou. | Shortcut in use. Choose another. |

Remaining native acceptance work for the implementer: verify the game always receives Play clicks, Ops Hide never activates, Edit focuses only on explicit entry, Esc correctly restores focus, no hidden focus targets survive, layout migration survives DPI/monitor changes, large text remains readable and capture never scans in raid. The supplied render checks cannot establish these native properties.
