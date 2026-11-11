# ARC Raiders Companion — vizuální návrh v2

11. listopadu 2026 · podklad pro implementaci v Tauri 2 / React 19 / čistém CSS. Pouze desktop 1024–1920 px. Tento dokument je nový návrh podle existujícího UI. Starý `docs/visual-design.md` nebyl čten ani měněn. V této práci nebyl změněn aplikační kód.

## 1. Koncept: Teplý grafit / pracovní konzole

Companion má působit jako soukromý pracovní stůl pro přípravu dalšího raidu. Matný grafit, lehce teplý bílý text a meruňková barva ovládání vytvářejí vlastní, civilnější sci-fi atmosféru. Charakter nesou pravoúhlé bloky, technické nadpisy Chakra Petch a přesná čísla JetBrains Mono; ne obrázky zbraní, hologramy nebo dekorativní rámečky. Nevytváříme kopii herního rozhraní, nepoužíváme oficiální značky ani artwork. „ARC OPS“ je nynější textové označení v kódu; v návrhu jde o obyčejnou sazbu, nikoli nové logo. Názvy hry a herních položek zůstávají pouze jako existující textový obsah neoficiálního nástroje.

Hráč mezi raidy hledá odpověď během několika sekund: kolik chybí, co lze upgradovat, zda byl loot převeden a jak se mu daří. Proto je pořadí vizuální váhy číslo → jeho význam → kontext → vedlejší akce. Meruňková znamená aktivní ovládání a aktuální místo, zlatá ekonomiku a chybějící množství, zelená úspěšný výsledek, růžová chybu či ztrátu. Význam vždy podporuje text nebo ikona. Profilové mince nejsou totéž co výdělek raidů; stejná rodina barev nesmí smazat jejich popisky a vysvětlení.

Pro dlouhé sezení používáme tmavé, ale rozlišitelné vrstvy, bez čistě bílých velkých ploch, záře, zrnění pod textem nebo pohyblivého pozadí. Hustotu získáme zarovnáním a čitelnými 13–14px řádky, ne zmenšením celé aplikace. Povinné informace se neztrácejí v tooltipu. Scroll patří obsahu, velkým tabulkám a stromu; nejde o mobilní ani webový redesign.

## 2. Co bylo skutečně prozkoumáno

Zdroje: `src/App.tsx`, `src/main.tsx`, celý `src/shell/`, `src/ui/tokens.css`, `base.css`, `components.css`, `modules.css`, `components.tsx`, `charts.tsx`, `ItemList.tsx`, `RaidForm.tsx`, všech 14 hlavních modulů a podpůrné `Goals`, `Recs`, `Planner`, `Loadouts`, `shared`. Kontrola `vite.config.ts`, `playwright.config.ts` a existujících e2e testů. Přesné navigační pořadí je níže, nikoli pořadí v zadání:

| # | ID / hlavní soubor | Aktuální text navigace | Záložky / důležité části |
|---|---|---|---|
| 1 | dashboard / Dashboard | Dashboard | Přehled, Cíle, Doporučení |
| 2 | profile / Profile | Player Profile | Profil, Souhrn, Vývoj v čase; Level/Mince/XP/Kola/Reward Pass |
| 3 | skills / SkillTree | Skill Tree | Strom, Plán krok za krokem, Buildy a porovnání |
| 4 | workshop / Workshop | Workshop | Stanice, recepty, Outpost, Amplified |
| 5 | inventory / Inventory | Inventory | Zásoba, Nákupní seznam, Lov ARC, Material Planner |
| 6 | maps / Maps | Maps | Osa odemykání, karty, poznámky v dialogu |
| 7 | arc / ArcDb | ARC Database | Seznam, filtry, detail, vlastní záznamy |
| 8 | weapons / Weapons | Weapons | Tier list, Loadouty |
| 9 | money / MoneyRuns | Money Runs | Graf, Statistiky tras, Průvodci trasami, Co prodávat |
| 10 | trials / Trials | Weekly Trials | Výzvy, Reward Pass, Historie týdnů |
| 11 | journal / Journal | Raid Journal | Filtry, tabulka, rozbalený detail |
| 12 | checklist / Checklist | Raid Checklist | Šablony, příprava, kroky trasy |
| 13 | stats / Statistics | Statistics | Období, KPI, cíle, výsledky, mapy, trasy, loadouty, loot/ztráty |
| 14 | settings / Settings | Settings & Backup | Data, Export a import, Snímky, Odkazy, O aplikaci, Nebezpečná zóna |

Názvy hlavních modulů jsou v implementaci anglické, podpůrné popisky české. Mockupy zachovávají tuto realitu; plošný překlad navigace není součást CSS. Skupiny Přehled / Rozvoj / Průzkum / Raidy / Systém zůstávají.

### Zachycení současného stavu

`pnpm dev` běžel na `http://127.0.0.1:1420`, samostatný Playwright používal headless Edge podle konfigurace projektu. `capture-current.mjs` byl znovu spuštěn; vytvořil 21 PNG: 14 modulů v 1280×800, 4 vložené záložky, rozbalený raid, prázdný první Dashboard a Dashboard 1920×1080. Přehled: `current/contact-sheet.jpg`; přesná data: `current/capture-manifest.json`. Žádné pageerror, žádný dokument přesahující viewport. To nevylučuje lokální scroll tabulek či stromu.

Prohlížeč je pouze prostředek dokumentace již implementované desktopové aplikace. Izolovaný pomíjivý browser context používá `SAMPLE_V1` z testů a explicitní ukázkový loot, cíle stanic a týden, aby šly hodnotit naplněné obrazovky. Nejde o osobní data ani živá herní data. První snímek zachycuje výchozí prázdný profil. Nic z fixture se nepropsalo do desktopového úložiště.

## 3. Kompletní tokeny

Následující celý blok lze vložit místo obsahu `src/ui/tokens.css`. Zachovává **všech 57 existujících názvů**. Přidává sémantiku stavů, typografickou škálu a rozměry, celkem 126 proměnných. Samostatná identická kopie: `tokens-v2.css`. Vložení tokenů samo nepřepíše pevná čísla a hex barvy v ostatním CSS: implementátor musí upravit také pravidla uvedená v kapitole 5. Tento dokument takový zásah neprovádí.

```css
:root {
  --bg-app: #141719;
  --bg-sidebar: #101315;
  --bg-panel: #1D2225;
  --bg-raised: #272D31;
  --bg-hover: #323A3F;
  --bg-selected: #3A302A;
  --border-subtle: #363E43;
  --border-control: #849095;
  --text-primary: #F2EEE7;
  --text-secondary: #C8C7C2;
  --text-muted: #A2A8AA;
  --accent: #F4AD82;
  --accent-hover: #FFC69F;
  --accent-pressed: #DE966F;
  --on-accent: #241810;
  --amber: #E6C66D;
  --amber-bg: #35301F;
  --orange: #F3B18A;
  --success: #91CFAB;
  --success-bg: #22352C;
  --danger: #F09B9E;
  --danger-bg: #3B272B;
  --branch-conditioning: #91CFAB;
  --branch-mobility: #91BDE6;
  --branch-survival: #C6AFF1;
  --cond: var(--branch-conditioning);
  --mob: var(--branch-mobility);
  --surv: var(--branch-survival);
  --font-head: 'Chakra Petch', sans-serif;
  --font-ui: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 48px;
  --radius-control: 4px;
  --radius-panel: 8px;
  --radius-dialog: 12px;
  --shadow-dialog: 0 24px 64px #00000080;
  --backdrop: #080B0DCC;
  --z-sticky: 10;
  --z-shell: 20;
  --z-dropdown: 40;
  --z-backdrop: 80;
  --z-dialog: 90;
  --z-toast: 100;
  --z-tooltip: 110;
  --t-fast: 120ms ease-out;
  --t-dialog: 160ms ease-out;
  --sidebar-w: 224px;
  --topbar-h: 64px;
  --content-pad: 24px;
  --gap: 16px;
  --warning: var(--amber);
  --warning-bg: var(--amber-bg);
  --info: #91BDE6;
  --info-bg: #24323E;
  --accent-bg: var(--bg-selected);
  --accent-border: #B78060;
  --warning-border: #A89255;
  --success-border: #6E9D81;
  --danger-border: #AF7378;
  --info-border: #6D91B1;
  --orange-bg: #392E26;
  --orange-border: #B48266;
  --danger-hover-bg: #503137;
  --danger-pressed-bg: #633A41;
  --surface-inset: #181C1F;
  --chart-1: #F4AD82;
  --chart-2: #91BDE6;
  --chart-3: #91CFAB;
  --chart-4: #C6AFF1;
  --chart-5: #E6C66D;
  --chart-6: #F09B9E;
  --chart-7: #79CECC;
  --chart-grid: #465158;
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-h3: 16px;
  --font-size-h2: 18px;
  --font-size-h1: 28px;
  --font-size-kpi: 32px;
  --font-size-stat: 24px;
  --font-size-clock: 44px;
  --line-xs: 18px;
  --line-sm: 20px;
  --line-md: 22px;
  --line-lg: 24px;
  --line-h1: 36px;
  --line-kpi: 40px;
  --line-clock: 52px;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --tracking-label: 0.06em;
  --tracking-head: 0.01em;
  --space-0: 0;
  --space-half: 2px;
  --radius-pill: 999px;
  --shadow-panel: none;
  --shadow-popover: 0 12px 32px #00000059;
  --line-thin: 1px;
  --line-strong: 2px;
  --line-indicator: 3px;
  --focus-width: 2px;
  --focus-offset: 3px;
  --focus-color: var(--accent);
  --duration-fast: 120ms;
  --duration-dialog: 160ms;
  --duration-slow: 240ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --control-sm: 32px;
  --control-md: 36px;
  --control-lg: 44px;
  --table-row-h: 44px;
  --table-head-h: 36px;
  --nav-item-h: 36px;
  --sidebar-compact-w: 64px;
  --page-max-w: 1680px;
}
```

### Typografická pravidla

Inter 400 text, 500 formuláře a metadata, 600 ovládání. Chakra Petch 600 nadpisy, 700 pouze krátké textové označení aplikace. JetBrains Mono 400/500 čísla, datum, čas; vždy `font-variant-numeric: tabular-nums`. Žádná syntetická 700 pro čísla: není importovaná. Všechny tři rodiny a české latin-ext řezy jsou již importované v `src/main.tsx`. Žádný další font ani závislost není potřeba.

| Role / selektor | Velikost / řádek / váha | Rodina |
|---|---|---|
| body | md 14 / md 22 / regular | ui |
| h1 | h1 28 / h1 36 / semibold | head |
| h2 / h3 | h2 18 / lg 24 / semibold; h3 16 / lg 24 / semibold | head |
| .label, .note-head, .table th | xs 12 / xs 18 / semibold; tracking-label; uppercase jen krátké názvy | ui |
| .meta, hint, badge | xs 12 / xs 18 / medium | ui |
| .table td | sm 13 / sm 20 / regular | ui, čísla mono |
| .kpi-val / .stat-val | kpi 32 / kpi 40; stat 24 / 32; medium | mono |
| .kpi-val.sm | 20 / 28 / medium, delší název mapy ui | mono / ui |
| .clock | clock 44 / clock 52 / medium | mono |

Číselné pole nesmí změnit šířku při úpravě hodnoty. Mezery mezi tisíci dle stávajícího `fmt`, desetinná čárka zůstává. Chybějící údaj „—“ či „Neuvedeno“ není nula. Čísla nezalamovat po jednotlivých znacích; při dlouhé hodnotě zmenšit KPI na 28px v užší mřížce.

### Kontrast

Výpočty níže jsou sRGB relativní luminance `(Lsvětlé + 0,05)/(Ltmavé + 0,05)`, bez průhlednosti. Text cíl AA ≥ 4,5:1 i pro metadata; klíčové ovládací hranice ≥ 3:1. Kontrast se vztahuje na konkrétní páry, nikoli automaticky na všechny možné kombinace tokenů.

| Popředí | Pozadí | Poměr | Použití |
|---|---|---:|---|
| `--text-primary` | `--bg-app` | 15.57:1 | Text, cíl ≥ 4,5:1 |
| `--text-primary` | `--bg-panel` | 13.89:1 | Text, cíl ≥ 4,5:1 |
| `--text-secondary` | `--bg-panel` | 9.49:1 | Text, cíl ≥ 4,5:1 |
| `--text-muted` | `--bg-panel` | 6.67:1 | Text, cíl ≥ 4,5:1 |
| `--text-muted` | `--bg-raised` | 5.79:1 | Text, cíl ≥ 4,5:1 |
| `--text-muted` | `--bg-hover` | 4.81:1 | Text, cíl ≥ 4,5:1 |
| `--text-primary` | `--bg-selected` | 11.10:1 | Text, cíl ≥ 4,5:1 |
| `--on-accent` | `--accent` | 9.19:1 | Text, cíl ≥ 4,5:1 |
| `--on-accent` | `--accent-pressed` | 7.17:1 | Text, cíl ≥ 4,5:1 |
| `--success` | `--success-bg` | 7.26:1 | Text, cíl ≥ 4,5:1 |
| `--danger` | `--danger-bg` | 6.54:1 | Text, cíl ≥ 4,5:1 |
| `--amber` | `--amber-bg` | 7.94:1 | Text, cíl ≥ 4,5:1 |
| `--info` | `--info-bg` | 6.64:1 | Text, cíl ≥ 4,5:1 |
| `--border-control` | `--bg-raised` | 4.25:1 | Hranice ovládání, cíl ≥ 3:1 |
| `--accent` | `--bg-panel` | 8.52:1 | Text, cíl ≥ 4,5:1 |


`--border-subtle` je dekorativní dělení, nikoli jediný identifikátor vstupu. Aktivní vstupy používají `--border-control`. Focus má `--focus-width`, offset `--focus-offset` a `--focus-color`; na meruňkovém tlačítku je oddělený tmavým odstupem. Zakázaný prvek má explicitní barvy a dashed okraj, nikoli opacity celé komponenty. Bílý text na akcentové výplni nepoužívat. Pruhy a body grafu mají textové legendy a tvary; šest barev není zárukou rozlišení každou poruchou barvocitu.

## 4. Mapování všech dosavadních tokenů

Jména se neruší. „Náhrada“ znamená novou hodnotu pod stejným názvem; existující `var(...)` tedy fungují. U `cond/mob/surv` zůstávají aliasy kvůli `branchVar` a datům větví. Identická tabulka je i v `token-mapping.md`.

| Existující token | Stará hodnota | Náhrada v novém bloku |
|---|---|---|
| `--bg-app` | `#101419` | `#141719` |
| `--bg-sidebar` | `#13191F` | `#101315` |
| `--bg-panel` | `#192128` | `#1D2225` |
| `--bg-raised` | `#222D36` | `#272D31` |
| `--bg-hover` | `#2A3943` | `#323A3F` |
| `--bg-selected` | `#183C40` | `#3A302A` |
| `--border-subtle` | `#35434E` | `#363E43` |
| `--border-control` | `#718491` | `#849095` |
| `--text-primary` | `#EDF3F5` | `#F2EEE7` |
| `--text-secondary` | `#BBC8D0` | `#C8C7C2` |
| `--text-muted` | `#94A7B4` | `#A2A8AA` |
| `--accent` | `#52DDD0` | `#F4AD82` |
| `--accent-hover` | `#7BE9DE` | `#FFC69F` |
| `--accent-pressed` | `#32BCAE` | `#DE966F` |
| `--on-accent` | `#102322` | `#241810` |
| `--amber` | `#F4BE62` | `#E6C66D` |
| `--amber-bg` | `#382E1E` | `#35301F` |
| `--orange` | `#F49B68` | `#F3B18A` |
| `--success` | `#85D7A0` | `#91CFAB` |
| `--success-bg` | `#21352B` | `#22352C` |
| `--danger` | `#FF959A` | `#F09B9E` |
| `--danger-bg` | `#3B252C` | `#3B272B` |
| `--branch-conditioning` | `#85D7A0` | `#91CFAB` |
| `--branch-mobility` | `#F4D46A` | `#91BDE6` |
| `--branch-survival` | `#FF959A` | `#C6AFF1` |
| `--cond` | `var(--branch-conditioning)` | `var(--branch-conditioning)` |
| `--mob` | `var(--branch-mobility)` | `var(--branch-mobility)` |
| `--surv` | `var(--branch-survival)` | `var(--branch-survival)` |
| `--font-head` | `'Chakra Petch', sans-serif` | `'Chakra Petch', sans-serif` |
| `--font-ui` | `'Inter', sans-serif` | `'Inter', sans-serif` |
| `--font-mono` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` |
| `--space-1` | `4px` | `4px` |
| `--space-2` | `8px` | `8px` |
| `--space-3` | `12px` | `12px` |
| `--space-4` | `16px` | `16px` |
| `--space-5` | `20px` | `20px` |
| `--space-6` | `24px` | `24px` |
| `--space-7` | `32px` | `32px` |
| `--space-8` | `48px` | `48px` |
| `--radius-control` | `4px` | `4px` |
| `--radius-panel` | `6px` | `8px` |
| `--radius-dialog` | `8px` | `12px` |
| `--shadow-dialog` | `0 16px 48px #00000066` | `0 24px 64px #00000080` |
| `--backdrop` | `#080C10B8` | `#080B0DCC` |
| `--z-sticky` | `10` | `10` |
| `--z-shell` | `20` | `20` |
| `--z-dropdown` | `40` | `40` |
| `--z-backdrop` | `80` | `80` |
| `--z-dialog` | `90` | `90` |
| `--z-toast` | `100` | `100` |
| `--z-tooltip` | `110` | `110` |
| `--t-fast` | `120ms ease-out` | `120ms ease-out` |
| `--t-dialog` | `160ms ease-out` | `160ms ease-out` |
| `--sidebar-w` | `224px` | `224px` |
| `--topbar-h` | `64px` | `64px` |
| `--content-pad` | `24px` | `24px` |
| `--gap` | `16px` | `16px` |


## 5. Specifikace existujících komponent

### Společné stavy

Všechny interaktivní prvky: default → hover pouze při `:not(:disabled)` → active → focus-visible → disabled. Focus nezávisí na hoveru a nesmí být oříznut `overflow:hidden`. Přechody pouze background, border-color, color, opacity přes `--t-fast`; dialog přes `--t-dialog`. Žádné `transition:all`, animace číslic, skákání rozměrů nebo blikání. Stávající `prefers-reduced-motion` zachovat. Stavy tabulek a badge nejsou samy o sobě tlačítka.

### Panel, PageHead, KPI, seznamy

`Panel` / `.panel`: panel background, subtle 1px border, panel radius, bez stínu. `.panel-head` padding 16px 16px 0, min-height 44px; `.panel-body` 12px 16px 16px, gap 12px; `.flush` ponechá okraje tabulce. `headExtra` se vejde před actions, při nedostatku šířky přejde na další řádek. Klikatelný `.list-row` min-height 44px, 8px 4px (ARC seznam 16px boční), hover `bg-hover`, selected `bg-selected` + 3px akcent vlevo, focus prstenec. Neklikatelné panely nemají hover zesvětlení, cursor ani celoplošný stín.

`.page-head`: min-height 52px, title a subtitle vlevo, actions vpravo, gap 16px. Nadpis 28px; subtitle secondary 14/22, max 90 znaků na řádku, delší vysvětlení zůstává v obsahu. `.kpi` padding 16, min-height 116px, label/value/context gap 4; číslo 32/40, kontext muted 12/18. `.stat` 24px číslo; `.stats-row` minmax 150px jako dosud. Všechny karty mohou růst, nikdy pevná výška ořezávající text.

### Btn, IconBtn, link-btn

| Varianta | Default | Hover | Active |
|---|---|---|---|
| secondary `.btn` | bg-raised, text-primary, border-control | bg-hover | bg-selected |
| primary | accent, on-accent, accent border | accent-hover + stejný border | accent-pressed + stejný border |
| ghost | transparent, text-secondary, transparent border | bg-hover, text-primary | bg-selected, text-primary |
| danger | danger-bg, danger text a border | danger-hover-bg | danger-pressed-bg |

Výška md 36, sm 32, lg 44; padding 16/12/20px, mezera ikony 8px, radius-control. Inter 600 14/20 (sm 13/20). Ikony Lucide 18px, stroke 1,75. Focus společný, nemění fill; pro všechny varianty včetně danger. Disabled všech variant: bg-panel, text-muted, dashed border-subtle, žádný hover/active, native disabled. Primary použít pro jednu dominantní akci v lokální skupině, nepřevádět všechna tlačítka na meruňková.

`IconBtn`: sm 32×32, md 36×36, ikona 16/18; stejné stavy jako secondary/ghost. Přidat active bg-selected také pro ghost. Label a title zachovat, u coarse pointer 44×44. `link-btn` 13/20 semibold accent → accent-hover → accent-pressed, underline při hover/focus; focus outline. `ExtLink` zachovává ikonu a text „vyžaduje internet“, nic nestahuje samo.

### Formuláře: NumberField, TextField, Select, Search, Stepper, Check

`.input/.select` min-height 36, padding 0 12, bg-raised, text-primary, 1px border-control, radius-control; hover border text-secondary; focus akcentový outline; invalid danger border + viditelné vysvětlení FieldError. Placeholder muted bez opacity, nesmí nahrazovat label. Disabled bg-panel, muted, dashed subtle border; readonly inset surface, secondary, plný subtle border. `.textarea` 96px min, 10px 12px, 14/22, resize vertical. `select` zůstává nativní, option bg-raised, pravé místo 28px. Počet 0 u xpNext zachovává význam nevyplněno.

`.field` gap 4, label 12/18 secondary, hint 12/18 muted, err 12/18 danger + CircleAlert 14. Popis rozsahu po ořezu v NumberField/Stepper se neztrácí. Nezavádět falešné „Uložit“: NumberField potvrzuje blur/Enter, TextField blur/Enter, Escape ruší draft. Stav invalid s propojením aria-describedby je požadavek na JSX, viz kapitola 9.

`Search`: width 320px / max-width 100%, vstup odsazení 34px z obou stran, lupa 16px, clear button 32px. V Journalu při 1280 filtry rozložit do dvou předvídatelných řádků; ne náhodný jediný osamělý select. `.filter-bar` gap 12, align-items end.

`Stepper`: tlačítka 32, mezery 4, vstup 72×32 (wide 120); číslo vpravo mono; celý blok 144px. Na min/max je vypnutá pouze příslušná šipka. Tabulková buňka musí mít alespoň 168px včetně paddingu. Není to progress, zvýšené pozadí vyjadřuje editaci.

`Check`: min-height 44, padding 10px 8px; box 18×18, radius 3, border-control; hover řádek bg-hover, active bg-selected; checked success fill + tmavá fajfka. `.done` secondary text, bez přeškrtnutí dlouhých instrukcí. Focus přímo na checkboxu. `.toggle` 16px checkbox s akcentem; nezaměnit za nově navržený switch. `.seg` výška 36, jednotlivé části 34, border-control; selected bg-selected + primary text, good success, bad danger; hover bg-hover a focus viditelný uvnitř, pokud rodič ořezává outline.

### ItemList a RaidForm

`ItemList` je skutečný fieldset/legend. Inset pozadí, subtle border, padding 12, radius-control, gap 8. Existující řádky jméno / počet 80px / odebrat 32px, nové jméno roste a „Přidat“ zůstává vidět. Hover pouze na akcích, prázdný text muted. Datalist je nativní lokální seznam, nenavrhovat vlastní vyhledávací síťovou službu.

RaidForm používá wide dialog, form-grid minmax 200px. Mapa / Typ raidu / Trasa nahoře, Výsledek seg, pak Výdělek / Délka / Datum a čas, Loadout, dvě kolony Výbava / Ztracená výbava, loot, propojené cíle a Poznámka. Ponechat české labely a rozsahy 0–120 po půl minutách. Při smrti je výdělek disabled 0; žádná červená celé obrazovky. Loot checkbox a jeho dopad jsou zřetelně oddělené 1px hranou; přenos není automatický. Footer a header se neposouvají s dlouhým tělem dialogu.

### Tabulky

`.table`: 13/20, full width, collapse; header 36px, bg-panel, muted 12/18 600, sticky top 0, z-sticky; řádky min 44, padding 10px 12px, subtle spodní linka. S polem nebo badge řádek roste, nepoužívat fixní line-height jako náhradu výšky. První název primary, doplňující řádek muted 12px; čísla mono vpravo, th.num UI vpravo. Hover bg-hover, selected bg-selected s akcentovým indikátorem první buňky. Selected hover zůstává selected. Focus-within 2px akcent uvnitř řádku, focus samotného ovládání zůstává.

`.table-wrap` overflow auto, vlastní scrollbar 12px; `.tall` max-height min(560px, dostupná výška), nesmí skrýt akce pod tabulkou. Orientační min-width: stock 920px, Journal 1080px, planner material 920px. Při 1024 je dovolen horizontální scroll uvnitř tabulky, nikoli celé aplikace. Dlouhé „Odkud/Na co“ zalamovat, `.actions-cell` nowrap. Žádné skryté důležité sloupce. Journal datum a čas mohou být v užším zobrazení na dvou řádcích; stávající inline nowrap vyžaduje úpravu, viz kap. 9.

Rozbalený raid `.detail-row > td`: surface-inset, 3px accent levý okraj, padding 16; `.raid-detail` žádné další boxy. `dl` dt 156px / dd 1fr, gap 8px 20px, label muted, hodnoty primary. Ztráty danger, loot primary, stav převodu badge. Převod primary sm; vrácení secondary sm. Zdůraznit „Převést rozdíl“ jako odlišný text stávající logiky; nikdy nevymýšlet přepočet profilu.

### Tabs a badge

`Tabs` výška 40, jednotlivě padding 14, gap 4, bottom border subtle; selected primary text + 2px accent spodní linka; hover bg-hover, active bg-selected, focus společný. Neaktivní secondary. Šipky/Home/End a aria-selected již existují, zachovat. Badge v tabu zůstává 22px; nedávat dalšímu řádku vyšší tab. Tab není vyplněný primary button.

`Badge` min-height 22, padding 0 7, 12/18 medium, radius-control, border 1px. Default bg-raised / secondary / subtle; accent accent-bg/accent/accent-border; amber warning-bg/warning/warning-border; orange orange-bg/orange/orange-border; success success-bg/success/success-border; danger danger-bg/danger/danger-border. `.tier` mono 13/18 min-width 26. Badge nemá hover/active/disabled, pokud je pouhá informace. Focus má obal, pokud by byl klikací. „Deník“, „Vlastní“, „Upraveno“, „Rešerše · neověřeno“ ponechat textově. Tone `info` nynější typ Badge neumí; nepřidávat bez potřeby nové API.

### Progress, Ring, pips, hvězdy

`Progress` track bg-raised, height 6, radius 3; fill accent nebo amber/success/danger podle existujícího tone. Při zvýšeném podkladu použít surface-inset na track. Text label i číselný poměr nad ním, nikoli v úzkém pruhu; gap 6. 0 nic nevyplní, 100 % celé, max=0 nesmí způsobit falešné dokončení. Překročené skill body mají explicitní danger text (clamp pruhu zůstává). `Ring` stávající 40 / profil 72, stroke 3, track border-subtle, accent fill oblouku, číslo mono; nesmí pulsovat.

Pips stanic 14×6 gap 3: inactive bg-raised/subtle border, active accent. Fáze 1–4 segmenty 28px: hotovo success-bg/success, current selected/accent border, čeká raised/muted. Skill větve mají vlastní conditioning/mobility/survival barvu a viditelný název, bez celoplošného zabarvení karet. `.node.next` accent border; `.invalid` danger-bg/danger border; `.full` success-bg (odstranit starou pevnou zelenomodrou). Locked text zůstává čitelný, ne opacity.

Trials hvězdy: tlačítka 36×36, výplň amber pro získané, prázdné text-muted, hover bg-hover, focus outline, active bg-selected; nula samostatná ohraničená možnost. Zachovat roving tabindex a radiogroup. Stav 0/3 není disabled.

### Banners, SaveState, Toasts, Empty

`.banner`: min-height 48, padding 10px content-pad, gap 12; ikona 18; text 14/22 primary. Danger danger-bg + danger ikona a 1px dolní hrana, amber warning-bg/warning, info info-bg/info. Viditelná akce 32px. Při zalomení řádku roste, nic nepřekrývá content. Save error se neodhazuje ani automaticky neschovává; uložený stav secondary + success fajfka. Vývojový localStorage text v Settings je jen vlastnost snímku, do nativního okna se nepřenáší.

Toast 360px, padding 12px 14px, raised, border-control, 3px levý stavový okraj, panel radius, popover shadow, pravý dolní roh 20px, gap 8; text primary. Použít `.warning`, nikoli přidat jiný název k nynější logice. Success mizí po 4 s, info/warning po 6 s, danger až zavřením; tuto logiku nepřepisovat v designu. Zavírací focus a hover jako ghost.

`Empty`: padding 24px 16px, min-height 128, max-width textu 54ch, centered; ikona 24px muted, text secondary 14/22, button 36. Chybný filtr nabízí „Vymazat filtry“, první raid „Zapsat raid“, dokončení zelenou fajfku. Bez velké ilustrace zabírající tabulku. Nula raidů má pomlčku u úspěšnosti a coinů/h; nevyrábět smyšlené grafy.

### Dialog, Confirm, popover, tooltip

`Dialog` standard 480, wide 720, side 440px. „Side“ je nyní užší **centrovaný dialog**, nikoli drawer; zachovat. Max-width viewport−32, max-height viewport−48, backdrop token, radius-dialog, shadow-dialog, border-control. Header 16px 20px, body 16px 20px s gap 16 a overflow-y auto, footer 12px 20px; footer footNote má min 200px. Vstupní focus, Escape, návrat focusu a trap již existují. `Confirm` bezpečná akce první, nebezpečné tlačítko danger; busy zakáže opakování. Reset s „SMAZAT“ zachovat. Žádné automatické potvrzování.

QuickProfile `.popover` width 320, padding 16, raised/control border/dialog radius/popover shadow, z-dropdown. Tooltip 12/18, raised/control border, padding 4px 8px, offset 10, z-tooltip. Současný pseudo-tooltip v overflow navigaci může být oříznut; korektní portál je volitelná strukturální úprava. Neschovávat jméno navigace jen do neviditelného oříznutého boxu.

### Grafy charts.tsx a Maps UnlockAxis

Ponechat existující `ResultChart`, `LineChart`, `HBars` a `UnlockAxis`. Nezavádět radar, donut úspěšnosti ani falešnou telemetrii. Result: amber sloupec výdělku, success kroužek extrakce, danger křížek smrti na nule; Line: accent, u mincí amber; HBars amber, loot success, ztráty danger. Šest kategoriálních barev chart-1 až chart-6 je připraveno pro skutečné víceřadé srovnání, současné grafy je nepotřebují všechny současně.

SVG viewBox 720, left 64 (osa map 150), height 200/240 podle existujícího API; čára 2px, body 4px / focus 5px, mřížka chart-grid 1px, popisky muted 12px UI. Mřížku výnosu neměnit na nápadné velké plochy. Při renderování širokého SVG hlídat fyzickou velikost popisků: panel grafu max 960px, na 1920 dva grafy vedle sebe lze jen po označené strukturální změně. Jediný bod nekreslí trend. Nula má osu bez NaN. Textový souhrn, legenda a `Data grafu v tabulce` zůstávají; hover i keyboard focus ukazují stejné údaje. Barevný bod legendy doplnit tvarem, pokud se někdy přidá více sérií. Stávající stroke/fill tokeny v JSX lze pro tuto paletu ponechat; mřížku přesměrovat explicitně, CSS token sám to nezajistí.

## 6. Shell a mřížka desktopového okna

Sidebar je pevná na celou výšku, topbar uvnitř pravé části, bannery mezi topbar a content. `.content` flex:1/min-height:0/overflow-y:auto, `.main` min-width:0. Body overflow hidden; shell min-width 1024px. Pro 1024 nejde o přepnutí na mobil, ale stávající kompaktní navigaci. Při 1280+ je možné sbalení ručním tlačítkem, uložená preference zůstává. Tauri dekorace okna nejsou součást PNG; uvedené rozměry jsou CSS klientská plocha.

| Viewport | Sidebar | Content pad / gap | Vnitřní šířka stránky | Mřížky |
|---|---:|---|---:|---|
| 1024×800 | 64 kompaktní, současná logika App | 16 / 12 | 928 | KPI 3×2; Dashboard 2 sloupce, raidy přes oba; stanice 2; profil pod sebou; tabulky vlastní scroll |
| 1280×800 | 224, nebo uživatelem 64 | 24 / 16 | 1008 při rozbalené | KPI 3×2; Dashboard 2 sloupce; stanice 2; profil 480 + zbytek; filtry Journal 2 řádky |
| 1920×1080 | 224, nebo 64 | 24 / 16 | 1632 při rozbalené | KPI 6×1; Dashboard 12 sloupců; Další kroky 5 / Fáze 4 / Trials 3; Raidy 8 / Materiály 4; stanice 3 |

`.page` max-width 1680 včetně paddingu, center; ve 1920 je available 1696px, tedy 8px mezera vně na každé straně a skutečně 1632px vnitřní grid při max-width 1680. **Upřesnění tabulky:** 1648 je dostupný prostor po paddingu před capem; implementovat výsledných **1632px**. Preferovat měření kontejneru, ne předpoklad šířky viewportu. Dashboard breakpoint inner 1320 ponechat, pod 760 jedna kolona je pouze záloha při neočekávané úzké ploše, žádný mobilní scope.

Sidebar header 64, nav item 36, gap 2, padding 8; group 12/18, horní mezera 12px. Nav aktivní bg-selected a 3px accent vlevo, ne plná akcentová plocha. Ikony 18/1,75. Settings dole, „Offline · lokální data“ 12/18. Nevyžadovat ve 800px všech 14 položek bez scrollu při zvětšeném textu: nav má flex:1/min-height:0/overflow-y:auto, footer zůstává dostupný.

Topbar min-height 64, padding 8px content-pad, čísla 14/20 mono, label 12/18 muted. Zachovat dva tb-group bloky a spacer před save-state. Na 1024 skrýt `.long-label`, ne hodnoty; dovolit zvětšení výšky při zoomu. Profilový popover se otevírá z hodnot jako dosud. Žádný nový globální search ani tlačítko online sync.

V desktopovém minimu strom potřebuje 960px, má ale jen 928px. Je proto správně malý horizontální scroll pouze `.tree-scroll`. Na 1280 1008px tři větve po ≥300px projdou; snížit rozestupy v uzlech místo ořezání názvů. ARC detail při 1280 už používá `wide` JS podmínku a 420px postranní panel: ponechat seznamu zbytek, na 1024 centrovaný side dialog. U 1920 má seznam více prostoru, detail se neroztahuje neomezeně.

Pořadí Dashboard karet je uživatelské. CSS nesmí pomocí `order` nebo grid dense zrušit uložené pořadí ani odpojit pořadí klávesnice od obrazu. Mockup zobrazuje výchozí první karty, spodní obsah pokračuje scrollem. Při 1280 KPI zabírají dva řádky záměrně; není nutné vtěsnat všech devět karet nad přehyb.

## 7. Konkrétní zásahy do všech modulů

Následující kritika odkazuje na skutečné snímky `current/*-1280.png`, nikoli na nedokončený minulý návrh. Každý modul se opírá o již existující data.

### Dashboard

Slabé: v 1280 velké množství stejných boxů a dvouřadé KPI posouvají praktické kroky nízko; v 1920 samotné okraje všech panelů soutěží s čísly. Hover zachycený na řádku upgrade není persistentní doporučení. Zvýraznit 32px KPI, 24px podstatné počty, tlumené kontexty; mincí profilu se netýká automatické sčítání raidů. Další kroky nechat první, Fáze vedle, Trials užší, poslední raidy 8/12. Slabý aktuální skill a upgrade řeší semibold a barevná hodnota, ne nový obrázek.

Cíle: prázdný Goal Tracker nemá být jako velká bezobsažná plocha; Empty min 128, jasné Nový cíl, filtry zůstávají. U GoalRow rozlišit název, prioritu a termín; červená jen vysoká priorita/po termínu dle logiky, ne každý otevřený cíl. Doporučení: nyní se dlouhá vysvětlení slévají; oddělit řádky gapem 12, title 14/22 600, why muted a Proč jako details, Otevřít vpravo. Nejde o AI online funkci, žádná AI ikona ani indikátor spojení.

### Player Profile

Slabé: formulář a Souhrn jsou stejně nápadné a některé vstupy vypadají jako pasivní hodnoty; Vývoj v čase je při jediné historii téměř prázdný. Vstupy raised/control border a štítky 12, souhrn čísla 24 a ring 72; profilové mince gold. Levý profil max 480 na 1280, 560 na 1920; pod 900px kontejneru pod sebe. XP a XP na další level ponechat samostatně. Prázdný graf vysvětlit existující větou o dalších dnech, nekreslit falešný trend.

### Skill Tree

Slabé: dlouhý toolbar a vysvětlení odsouvají uzly pod fold; drobný uzel a mnoho zakázaných tlačítek se obtížně skenují. Sticky skill-bar má body, reset a další bod jako tři hierarchické hodnoty; akce druhý řádek a text pravidel secondary. Větve Conditioning zelená / Mobility modrá / Survival fialová, název a body vedle sebe. Ponechat strom jako 3 vertikální seznamy, ne vymýšlet graf závislostí. Next accent border, invalid danger, locked čitelný důvod. Buildy a Plán krok za krokem používají stejnou tabulku/list, aktivní plán selected a badge, reset bezpečný confirm.

### Workshop

Slabé: úrovně stanic a podmínky se ztrácejí mezi opakovanými steppers; hráč těžko rozliší chybějící materiál od nesplněného levelu. Stanice title 18, úroveň mono 24, pips drobné; připravená success border a text Připraveno, blokovaná orange Lock + přesný důvod. Číslo potřebného materiálu right aligned, mám editovatelné. 2 karty při 1280 / 3 při 1920. Progress materiálu neoznačit jako hotový upgrade; tlačítko skutečné akce ponechat podle `can`. Recept a ruční oprava jsou secondary/ghost. Amplified je oddělený panel dole, nikoli hero.

### Inventory a Material Planner

Slabé: tabulka zásob má stejnou váhu v editaci Mám a vypočtených sloupcích; planner na prvním viewportu ukazuje hlavně stanice, jeho skutečný součet je níže. Zásoba: první název semibold, Kategorie a Odkud secondary, Mám raised input, Potřebuju mono primary, Chybí gold, nulové nedostatky muted. Záložkové počty chybějících zůstávají amber, Lov ARC má malé textové karty bez obrázků robotů.

Planner: zachovat sekce Cílové úrovně stanic → Crafting a vlastní cíle → Součet materiálu. Ve 1280 použít řádky tabulky 44px, hlavní nadpis 18, dlouhé vysvětlení 12/18, žádná obří grafika. Součet obsahuje přesně Materiálů v plánu / Potřeba celkem / Chybí / Souběh (24px, Chybí gold). Mám editovatelné, Potřeba výpočet, Chybí gold nebo zelené ✓, Odkud, Na co (bez duplicit). Souběh musí mít explicitní badge a vysvětlení, protože není totéž co aktuální nedostatek.

**Volitelná struktura P1:** malý souhrn stejných čtyř hodnot přesunout nad tabulku stanic, aby byl vidět ihned; neduplikovat odlišně počítaná čísla. Mockup pro základ zachovává současné pořadí a může ukázat nižší část scrollu. Cílová úroveň není příkaz upgradu a nespotřebuje materiál; žádné nové tlačítko „Vyrobit vše“.

### Weapons a Loadouty

Slabé: mnoho chips v tier listech vypadá jako hromada stejně hodnotných akcí; porovnání má malý checkbox bez výrazného výběru. Tier blok 36px head font, písmeno i barva; chip name 13/20 600, selected border accent + comparison checkbox. Anti-ARC badge je metadata, ne druhé primary tlačítko. Vlastní hodnocení a Deník oddělit textem v detailu. Porovnání maximálně tří zbraní přes existující tabulku; žádné vymyšlené damage číslice.

Loadouty: aktuální fixture je prázdná, na snímku velká prázdná karta. Použít Empty a Nový loadout; naplněné karty ze skutečného `Loadouts.tsx`: Zbraně, Augment, Štít, Výbava, Výsledky, Poznámka. Primární Zapsat raid s loadoutem, úprava/duplikace ghost; výsledky 13px s čitelným počtem raidů. Nezaměnit skill build za loadout výbavy.

### Raid Journal

Slabé: filtr Loadout se zalomí osamoceně; tabulka je hustá a detail vypadá téměř jako další row bez hierarchie. Dva předvídatelné řádky filtrů, summary 12/18 pod nimi. Výsledek badge s textem a ikonou, Coiny gold mono, délka mono; Datum 13px, čas muted. Rozbalený řádek inset plocha + accent linka, dt/dd mřížka. Výbava a loot přehled v běžném řádku zůstává krátký, detail obsahuje všechny nynější položky. Převést loot je lokální hlavní akce, Vrátit převod secondary. Na fixture 19:40 přenos ještě neproběhl; nezobrazovat souběžně Loot v Inventory.

### Raid Checklist

Slabé: šablony a dva různé progressy mají podobnou vizuální váhu, dlouhé kroky tras splývají. Šablony small secondary/selected, nahoře dva nezávislé pojmenované progressy. Levá karta příprava, pravá kroky zvolené trasy; číslování mono muted, checkbox 18 a řádek min 44. Dokončené instrukce jen secondary, stále čitelné. Reset „Nový raid, odškrtat vše“ ponechat confirm a nevyvolávat zápis raidu; úpravy/kopie šablony secondary. Zelená označuje pouze skutečně odškrtnuté.

### Money Runs

Slabé: stopky a Výnos vedle sebe nemají dobře odlišený rytmus, graf je při třech runech přehnaně velký a prázdný. Hodiny 44/52, Start primary; coiny/h ve Výnos 32, ostatní čísla 24; explicitní historie runů. Graf standard 200px, žádné natažení na většinu okna. 8 min orange a 10 min danger s textem i ikonou, timer bez pulsování. Statistiky tras drží počet runů a úspěšnost u coinů/h; průvodce master 280/detail zbytek; Co prodávat tabulka s původem a cenou, ne katalog s artworkem. Přenést čas do zápisu není automatické uložení.

### Maps

Slabé: dlouhá osa při 31 kolech končí textem na kraji a karty pod ní vypadají stejně, ať je mapa odemčená nebo ne. Osa má fixní rezervu pro pravé popisky (nyní R=110), žádné ořezání. Odemčeno success badge, uzamčeno Lock + „Ještě N kol“, nikoli opacity celé karty. Obtížnost orange 1–5 segmentů, nikoli barevné pozadí. Navštíveno muted číselný kontext. 2–3 sloupce podle šířky; karty min 280px, žádná skutečná mapa na pozadí. Živá mapa je označený externí link a nepovažuje se za offline část aplikace.

### Weekly Trials

Slabé: editační jména, nuly a poznámky vypadají jako soustava stejných polí, celkové 9/15 je jen drobný text v rohu. Panel header 9/15 mono 24 gold, progress 6px, pět řádků min 72px. Jméno zabírá 1fr, radiogroup pevné auto, poznámka 1.4fr; input raised, hvězdy dost prostoru pro focus. 0/3 možnost zůstává zřetelná. Reward Pass oddělený souhrn s vlastním labelem, historie table a prázdný stav. Žádný odpočet nové sezóny, který kód nezná.

### ARC Database

Slabé: bez výběru je dlouhý jednolitý seznam, nedostatky jsou na vzdáleném pravém okraji a metadata slabá. Název 14/22 600, popis 12/18 secondary, Chybí badge gold, chevron 16 muted. Aktivní stroj selected se 3px markerem. Při 1280+ detail 420px, seznam zbytek; při 1024 side dialog dle existující logiky. V detailu Slabiny/Taktika/Dropy přehledná dl a vlastní poznámky oddělené linkou. Původ dat a „Rešerše · neověřeno“ nikdy nezakrýt ve prospěch čistoty. Žádná generovaná podoba skutečných herních robotů.

### Statistics

Slabé: šest KPI na 1280 zabere dvě řady, pod nimi Dokončené cíle a extrémy odsouvají grafy hluboko; hodnoty nemají dost velký rozdíl proti kontextu. Ponechat 3×2/6×1 KPI, čísla 32, mapa 20 UI, podmínku počtu raidů u mapy. Filtry 3 pole + období summary; grafy nesmějí míchat profily a výdělek. Dokončené cíle mají vlastní období a nezávisí na filtru typu/loadoutu tak jako raidy: neoznačit je jako výsledek všech filtrů. Ztráty danger/ks, loot success/ks; žádné vymyšlené peněžní ztráty. Volitelná P1 změna struktury: dvě hlavní figury vedle sebe v 1920, až po oddělení wrapperem; aktuální JSX je má pod sebou.

### Settings & Backup

Slabé: dlouhá série stejně širokých panelů, důležité zálohy soupeří s technickým popisem úložiště; Nebezpečná zóna je až dole a mohla by se při přehnaném červeném rámu stát vizuálně dominantní. Export primary, import secondary; Data dl 13/20, cestu mono s wrap, žádné prázdné logo či cloud. Snímky tabulka, pole popisku max 280 a create secondary. Nebezpečná zóna danger 1px okraj, žádná velká červená výplň; potvrzovací texty a slovo SMAZAT zůstávají. O aplikaci musí zůstat neoficiální a offline vysvětlení, ne marketingový hero. U nativního okna skutečné dataDir, ne browser-only localStorage věta.

## 8. Assety, mockupy a přesné prompty

### Produkční assety

**Povinných nových bitmapových assetů: 0.** Paleta, linky a layout jsou CSS, ikony pocházejí z již instalovaného `lucide-react`. Existující BrandMark je vlastní geometrický SVG; lze jej ponechat, neimportovat znak hry. Použít nynější LayoutDashboard/UserRound/GitBranch/Hammer/Package/Map/Bot/Crosshair/Coins/Trophy/BookOpen/ListChecks/ChartNoAxesCombined/Settings; 18px stroke 1,75. Pro prázdné stavy BookOpen, Target, Crosshair, History, CircleCheck dle již existujících komponent. Pro tyto vektorové ikony není obrázkový generátor vhodný a žádný bitmapový prompt se nevyžaduje.

Volitelné ilustrace či textury nejsou součást základní implementace. Pokud je někdo později schválí, přesné prompty:

| Asset | Rozměr / použití | Přesný prompt pro gpt-image |
|---|---|---|
| empty-log.png | 320×200, pouze první prázdný Journal; nikdy za text | „Original minimalist vector-like raster illustration of an empty field notebook with three blank horizontal entry lines and a small unfilled square, off-white #C8C7C2 thin strokes with one apricot #F4AD82 bookmark, transparent background, centered isolated object, large clean negative space, no writing, no logos, no game art, no weapons, no drop shadow, flat 2D, 320 by 200 pixels.“ |
| console-grain.png | 512×512 tile, pouze v brand pásu max opacity .025 | „Seamless monochrome fine paper grain texture, uniform neutral gray, tiny stochastic grain, perfectly flat illumination, no directional pattern, no vignette, no scratches, no objects, no symbols, no text, no logos, tileable on all four edges, 512 by 512 pixels.“ |

Tyto dva volitelné assety se nyní negenerují, aby se nezvyšovala vizuální zátěž. Jejich nepoužití neomezuje návrh.

### Požadované obrazové návrhy

Čtyři PNG byly zadány nástroji gpt-image (`image_gen`), nikoli získány úpravou aplikačního CSS. Přesné konečné prompty jsou v `mockups/prompts.json`, společná paleta je shodná s tokeny. Dashboard je exportovaný na 1920×1080; ostatní mají desktopovou kompozici s cílem 1280×800. Mockupy jsou vizuální reference, **normativní specifikace jsou tokeny a pravidla tohoto dokumentu**, zvlášť u malého generovaného textu. Žádná z kreslených hodnot nesmí být implementována jako hardcoded údaj.

- `mockups/dashboard-gpt-image.png`: přehled s reálnými KPI 23 / 75, 184 500, 3, 67 %, 59 000, 99 718, kroky, fází, Trials a třemi raidy.
- `mockups/journal-gpt-image.png`: tři stejné raidy, první otevřený, Ferro a Bandage, loot Metal Parts/Fabric, nepřevedený stav.
- `mockups/planner-gpt-image.png`: Inventory / Material Planner se skutečnými sloupci cílů stanic a součtu.
- `mockups/components-gpt-image.png`: statická specifikační tabule skutečných komponent a jejich stavů, nikoli nová obrazovka aplikace.

Obsah screenshotů a výpočty aplikace mají při rozdílu v generovaném textu přednost. Odchylky a skutečné rozměry exportů jsou zaznamenány v `mockups/review.md`. Implementátor nemá převzít náhodné zaoblení, přebytečnou fajfku či plný barevný tab jen proto, že se objevily v bitmapě.

## 9. Převod do kódu a strukturální změny

### P0: proveditelné CSS bez změny struktury

Tokeny, typografická hierarchie, povrchy, výška řádků, grid, vybrané stavy, čitelnost formulářů a tabulek. V `base.css` a `components.css` přesměrovat pevné 11px labely na 12px a font-size/line-height na nové tokeny. V `modules.css` použít nové status backgrounds. Odstranit zbytky pevné tyrkysové: badge accent `#2c6e69/#15302f`, phase done/station ready `#3c6a4c`, node full `#1d2a2c`, locked map `#161c22`, danger hover `#4a2c35` a ostatní badge hex hodnoty. Nahrazení podle významu: badge border status-border, badge fill status-bg, node full success-bg, locked map surface-inset. Pouhé přepsání tokens.css by tyto staré barvy nechalo na místě.

### P1: konkrétní zásahy vyžadující JSX nebo chování (volitelné zlepšení)

1. **Planner.tsx:** přesun čtyř souhrnných čísel před cíle stanic. Vyjmout existující stats-row ze Součet materiálu do horního panelu se stejným `sum`; nepočítat druhý součet a neduplikovat interaktivní stav. Základní návrh funguje i v nynějším pořadí.
2. **Journal.tsx:** oddělit datum a čas do spanů a odstranit inline `whiteSpace: nowrap`, pokud chceme úsporné dvouřádkové datum. Přidání konkrétních className filtrům je čistší než přepis inline width přes `!important`. Pole ani filtr se neodebírá.
3. **Statistics.tsx:** wrapper pro dvě hlavní grafové karty, pokud mají být v 1920 vedle sebe. Na 1280 pod sebou, uvnitř grafu čitelné 12px popisky. Neměnit pořadí dokončených cílů a výpočty bez samostatného rozhodnutí.
4. **components.tsx + Sidebar:** tooltip portál mimo scrollující nav, pokud se potvrdí ořez pseudo-elementu. Zachovat tooltip při klávesnicovém focusu a aria-label; samotná z-index hodnota clipping nepřekoná.
5. **RaidForm/FieldError a případně NumberField:** propojit error ID s příslušným polem pomocí `aria-describedby/aria-invalid`. Nyní `.invalid` a FieldError existují, ale obecný stav chyby nemusí přiřadit konkrétní pole. Vzhled lze připravit CSS, sémantiku CSS nedoplní.
6. **charts.tsx / Maps.tsx:** pokud se použije samostatný `--chart-grid`, změnit SVG `stroke` z `--border-subtle` na něj. Doplňující tvary legendy případných více sérií rovněž vyžadují SVG/JSX. Existující grafy lze ponechat s původními tokenovými vazbami.

Plošný český překlad anglických jmen navigace, přejmenování značky, nové info tone v Badge, drawer místo `.side`, nové auto-save indikátory pro jednotlivá pole, vlastní dropdown a změny dat **nejsou nutné** pro tento návrh. Pokud je implementátor chce, jde o samostatný scope mimo CSS.

### Kontrola implementátora

Ve třech šířkách ověřit min 1024, 1280, 1920, zoom 125 % a dlouhé české popisky. Klávesnicí Sidebar → Tabs → filtrování → Stepper → rozbalení raidu → Dialog → návrat focusu. Zvlášť 0 dat, jediný raid, nulové minuty, 100% progress, přebytek skill bodů, souběh materiálů, pending/changed/applied loot, save error, dlouhá poznámka a velmi vysoké mince. Nativní ukládání a dialogy ověřit v Tauri; browserové screenshoty samy nedokládají native integraci. Offline ověřit bez síťových fontů; veškeré písmo je lokální @fontsource.
