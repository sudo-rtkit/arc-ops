<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/github/hero-light.png">
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/github/hero-dark.png">
  <img src="docs/assets/github/hero-dark.png" alt="ARC Raiders Companion — Plan the next raid. Keep your progress close. Bedňák, the Ops buddy." width="1280">
</picture>

# ARC Raiders Companion

[Česky](README.cs.md) · [Install on Windows](#install-on-windows) · [Changelog](CHANGELOG.md) · [Development](DEVELOPMENT.md)

![Windows](https://img.shields.io/badge/platform-Windows-272D31?style=flat-square)
![Version 0.17.0](https://img.shields.io/badge/version-0.17.0-F4AD82?style=flat-square)
![Offline](https://img.shields.io/badge/data-local%20%26%20offline-91CFAB?style=flat-square)
![MIT licence](https://img.shields.io/badge/licence-MIT-91BDE6?style=flat-square)
![Czech and English](https://img.shields.io/badge/languages-CS%20%2F%20EN-C6AFF1?style=flat-square)

Your offline operations desk for ARC Raiders. Keep your stash, workshop upgrades, quest objectives and skill plans together, then take the essentials into a compact window or the optional Ops field console. Review locally recognised screenshot data before writing any changes. Between raids, spend a little downtime with Bedňák — your customisable pixel-art buddy. No account login, no cloud sync, no subscription.

**Unofficial fan app. Not affiliated with or endorsed by Embark Studios.**

## A clearer plan for the next run

All views below use **demo data** from the browser build. The desktop app provides native windows, hotkeys and optional capture; Windows glass effects are not shown here.

<table>
<tr>
<td width="50%"><img src="docs/assets/github/feature-1.png" alt="Plan: stash, workshop and shopping lists"><br><b>Your operations desk</b><br>Profile, priorities, raid records, workshop upgrades and material shopping lists.<br><a href="docs/assets/github/dashboard@2x.png"><img src="docs/assets/github/dashboard.png" alt="Demo dashboard with level 20 profile and upgrade priorities"></a></td>
<td width="50%"><img src="docs/assets/github/feature-5.png" alt="Keep close: compact window and optional Ops buddy"><br><b>A smaller window</b><br>Pin quests, see have/need counts and jump to raid logging or stash cleanup.<br><a href="docs/assets/github/compact@2x.png"><img src="docs/assets/github/compact.png" alt="Demo compact window with three pinned quests and Gear Bench shopping list"></a></td>
</tr>
<tr>
<td><img src="docs/assets/github/feature-2.png" alt="Track: quests, objectives and raid notes"><br><b>One objective at a time</b><br>Check quest objectives, pin tasks and track seasonal projects. Checking every objective does not automatically complete the quest.<br><a href="docs/assets/github/quests@2x.png"><img src="docs/assets/github/quests.png" alt="Demo Shoring Up Defenses detail showing two of four objectives checked"></a></td>
<td><img src="docs/assets/github/feature-4.png" alt="Build: skill plans and build comparisons"><br><b>Make your skill points count</b><br>Browse 12 builds, load a plan, save your own and compare with your current tree. Theory builds are labelled.<br><a href="docs/assets/github/builds@2x.png"><img src="docs/assets/github/builds.png" alt="Demo skill-build catalogue with branch summaries and miniature trees"></a></td>
</tr>
<tr>
<td><img src="docs/assets/github/feature-3.png" alt="Review: screenshot changes need your approval"><br><b>You approve every import</b><br>Local recognition for supported inventory, loot and progression screens. Review confidence and changes; a state snapshot is saved before writing.<br><a href="docs/assets/github/import-review@2x.png"><img src="docs/assets/github/import-review.png" alt="Demo profile import review comparing four recognised values with the app state before confirmation"></a></td>
<td><img src="docs/assets/github/feature-6.png" alt="Unwind: Tetris, recycling quiz and Ops’s Hack"><br><b>A break with Ops</b><br>Stash Tetris, a recycling quiz and Ops’s Hack. Resume saved rounds and unlock cosmetic paints; rewards do not change game progress.<br><a href="docs/assets/github/minigames@2x.png"><img src="docs/assets/github/minigames.png" alt="Demo Ops’s Hack minigame with a rotatable circuit grid"></a></td>
</tr>
</table>

### What next?

The Dashboard's **What next?** card ranks your next best actions from your own data, Blitz-style: an upgrade you can build now, a raid to evaluate, a pinned quest ready to hand in, free skill points, unfinished Weekly Trials, a full stash, an old backup or a goal that is due. Each tip says why, opens the right module in one click and can be hidden until its condition changes or snoozed for a day. The top tip also shows in the compact window and the field console, and Ops says it in your chosen personality while you use them, never over the game.

### Meet Bedňák, callsign Ops

An optional, draggable desktop buddy with level-based outfits, paints, animations and three personalities. Click Ops to open the field console: profile, quests, inventory, workshop, skills, shopping, capture review and the active raid plan. The **App** button opens any full module (skill tree, recipes, item database, maps, journal, statistics, minigames…) in a larger panel over the game; settings and backups stay in the main window. Buddy features start **off** and can be enabled in Settings.

[![Demo field console with Ops and local profile data](docs/assets/github/overlay.png)](docs/assets/github/overlay@2x.png)

**Raid prep and your own map.** Pick goals (quests, the next station level, a project or money), get one list of what is still missing with the loot area from the item catalogue, a recommended map with its reasons, and the plan in the console's Raid tab with keep/sell/recycle lookups. The interactive map uses a screenshot of the in-game map that you add yourself; no game maps are bundled. Your points and plan highlights sit on top. After the raid, the plan is compared with what you found (from a confirmed FINDINGS capture or your stock change), shows what is still missing and which upgrades are ready, suggests the next raid and can be saved to the raid journal; statistics then show which maps help with your goals.

Also included: stash cleanup advice, item recycling references, blueprints, weapon comparison, a personal tier list, raid journal, statistics, checklists and local JSON backup/restore. Data references may lag game updates; you can adjust supported data inside the app.

## Install on Windows

1. Use the Windows **NSIS installer** (`.exe`) supplied by the maintainer. For published installers, check [Releases](https://github.com/sudo-rtkit/arc-ops/releases); if no release assets are available, follow the [build instructions](DEVELOPMENT.md#run-and-check). Local builds place the installer in `src-tauri/target/release/bundle/nsis/`.
2. Install with the game closed, or use the game's **borderless window** mode. Opening another window over exclusive fullscreen can take focus from the game.
3. Launch Companion, choose Czech or English in **Settings & Backup**, and set up your profile. Czech is the default language.
4. Enable Ops and choose a capture hotkey only if you want those features.

For an upgrade, use the newer installer over the existing installation; local data is retained. Export a JSON backup in Settings before upgrading. The installer does not launch the app automatically. If the game is already running, the app starts minimised without taking focus.

## Your data stays with you

- Works offline with no account login, telemetry or cloud upload. Nothing is sent to a server by the app; external source links open only when you choose them.
- Screenshots are processed locally. Native hotkey capture stays in memory and is discarded after reading; imported screenshot images are not saved. Map screenshots you add yourself are stored only on this device and go into a backup only if you choose. Learned numeric icon fingerprints and confirmed values may be stored locally.
- No game-memory access, code injection, game-file modification or automated game input. Optional “open with game” checks process names and window visibility/foreground status; it does not open the game process for memory access.
- Recognition proposes changes; you review and confirm them. Unreadable fields stay unknown. State snapshots and JSON export/restore help you recover from mistakes.
- Stash advice never sells, recycles or deletes anything in the game.

## FAQ

**Does this sync with my game account?** No. Enter data manually or review supported screenshots. The app has no account connection and cannot know your live raid state.

**Can I use Czech in the app?** Yes — Czech is the default, English is available in Settings. Screenshot recognition expects the **game UI in English**. Item and skill names retain their game names.

**Will every screenshot work?** No. Recognition supports specific screens and may be uncertain, especially at smaller resolutions. Check every proposal. Skill overview totals are informational; individual skill ranks come from tooltips.

**Is this approved for use by Embark or guaranteed safe from anti-cheat action?** No endorsement or such guarantee is claimed. The app stays outside game memory and does not send input to the game. Use your own judgement and the game's current rules.

**Does it include game artwork or maps?** This presentation uses original Ops artwork and demo app UI. No game screenshots, game artwork or Embark logos are included in these assets.

**How do I report a problem?** Open a [GitHub issue](https://github.com/sudo-rtkit/arc-ops/issues). Include the app version and reproduction steps; remove personal information from any attachments.

## Unofficial project

ARC Raiders Companion is an independent, unofficial fan project. It is not affiliated with, sponsored by, or endorsed by Embark Studios. ARC Raiders and related names belong to their respective owners. The name is used only to identify the game this tool accompanies.

## Development

Built with Tauri 2, React 19, TypeScript and plain CSS. See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, checks, architecture and translation rules; [CHANGELOG.md](CHANGELOG.md) for release history; and the [design specifications](docs/superpowers/specs/) for technical context.

## Licence

[MIT](LICENSE). Bundled fonts retain their SIL Open Font License notices. Ops / Bedňák is the project's original artwork.
