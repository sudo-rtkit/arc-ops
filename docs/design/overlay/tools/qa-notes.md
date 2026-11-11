# Kontrola grafického mockupu

Rozsah: pouze offline návrhový artefakt, nikoli produkční aplikace nebo nativní okno. Desktopová kompozice je zadaná na 1920 × 1080. Proporcionální zmenšení je prohlížení grafického listu, ne mobilní reflow.

- Vizuálně zkontrolovány všechny záložky a list sedmi stavů. Opraveno původní oříznutí posledního úkolu a potvrzovacího tlačítka. Výsledný obsah se ve všech exportech vejde do 546px těla bez posouvání.
- Sklo používá samostatnou alfu a backdrop blur; text ani maskot se nezprůhledňují. Stín je box-shadow, aby rodičovský filter neizoloval potomkovský backdrop-filter od scény.
- Ověřeny skutečný klávesový fokus po přepnutí šipkou i hover po dokončení CSS přechodu. Barevné a rozměrové kontroly jsou v `render-validation.json`.
- Nejistý řádek nelze vybrat před kontrolou. Změna jeho počtu schválení ruší. Neznámý řádek zůstává zakázaný. Zápis je pouze vysvětlená simulace, bez ukládání.
- Přibalené fonty se načítají bez sítě, česká diakritika je viditelná v exportech. Všech pět rarity tokenů odpovídá přesně zadání.
- Source finish lint ze skillu design-qa hlásí `BUTTON_NO_ACTION`, protože zkoumá lokální řádky HTML a nevidí navázání přes `onclick` a smyčky ve spodním skriptu. Tyto nálezy byly ručně přiřazeny ke skutečným handlerům. Aktivní indikátor „Chybějící · 5“ je span, nikoli nefunkční tlačítko. Návrhová ovládání byla ověřena v izolovaném Playwright kontextu.
- Upozornění lintu na ilustrační data, KPI karty a číslování operací odpovídají zadání: jde o grafický mockup s realistickou ukázkovou náplní. Nejsou to tvrzení o živých herních datech.

Není ověřené: nativní Windows Acrylic, skutečná hra za oknem, always-on-top / RegisterHotKey, systémová průhlednost a DPI, asistivní technologie nebo úplná shoda WCAG. Jde o předání grafiky, nikoli výsledek těchto implementačních testů. Pravidla pro implementaci a otevřená sémantika zápisu množství jsou v README.
