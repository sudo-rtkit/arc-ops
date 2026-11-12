# Poznámka k plánu: zvuky Opse a minihry

Datum: 12. 11. 2026. Stav: schváleno uživatelem jako směr, zatím bez implementace.

## Pořadí

1. Dokončit nového Opse (GPT-6.1 Sol připravuje tři moderní směry v `docs/design/buddy/v2/`, uživatel vybere).
2. **Zvuky** přidat spolu s novými animacemi Opse (stejný milník).
3. **Minihry** jako samostatný pozdější milník; začít Stash Tetrisem a recyklačním kvízem.

## Zvuky

- Hra se hraje podle zvuku (kroky, ARC, střelba): Ops nesmí přehlušit hru.
- Zvuky jen při práci s Opsem a overlayem: sken, hotovo, nejistota, chyba, nový level, otevření/zavření panelu,
  „pípavá řeč“ v bublinách tutoriálu. Když je hra v popředí a overlay zavřený, Ops mlčí.
- Nastavení: posuvník hlasitosti a vypnutí; výchozí hlasitost nízká.
- Vlastní zvuky generované v aplikaci (retro-futuristické cvaknutí, servo, rádiové praskání), žádné zvuky ze hry,
  offline, pár kB. CS/EN texty nastavení.

## Minihry

- Jen mimo raid (čekání na matchmaking, menu), nikdy nevyžádaně během hraní.
- Kandidáti:
  1. **Stash Tetris**: naskládat loot do omezeného batohu s co nejvyšší hodnotou (učí, co se vyplatí nosit),
  2. **Recyklační kvíz**: otázky z dat aplikace (recyklace, požadavky stanic, úkoly),
  3. **Opsův hack**: krátká logická hádanka, jen pro zábavu.
- Odměny jen kosmetické: díly pro Opse do šatníku (napojení na vývoj podle levelu). Nikdy nic, co mění herní data.
- Vše offline, CS/EN, bez síťových žebříčků.
