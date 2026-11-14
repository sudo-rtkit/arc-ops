# Pět volitelných podob Bedňáka

Uživatel chce pět verzí Bedňáka na výběr. Implementace 0.26.0 nabízí pět
existujících těl (Začátečník, Průzkumník, Mrchožrout, Veterán, Legenda) jako
samostatnou kosmetickou volbu v šatníku. Vedle nich zůstává automatický vývoj.

Pět karet má nativní náhled a běžný přepínač ovladatelný klávesnicí. Každou
podobu lze vybrat na libovolném levelu. Volba se ukládá jako nepovinné
`buddy.form`; chybějící nebo vadná hodnota znamená automatickou podobu.
Profil, odemykání dílů a číslo levelu na štítku se řídí skutečným levelem.
Automatické povýšení při ruční volbě nepřehrává proměnu do jiného těla.

Stejná volba platí pro okno buddyho, overlay, kompaktní okno, průvodce,
minihry, přípravu raidu a název podoby ve widgetu Opse. Vše automaticky
obnoví automatický výběr těla i dílů. Nové sloty návrhových sad oblečení se
v této úpravě nezapojují; tato práce řeší pouze výběr základního těla.

Ověření: core testy volby, normalizace, zachování profilu, uložení/načtení
a ručních událostí levelu; prohlížečové testy pěti voleb a obnovení v CS/EN.

Výsledek: 997 unit testů prošlo, 4 generátory jsou přeskočené. Prošly nové
E2E testy volby v CS/EN a související testy Opse a novinek (20 scénářů;
po doplnění nové verze opravené očekávání počtu starších vydání).
Typová kontrola, produkční build a NSIS instalátor 0.26.0 prošly.
Instalátor je v `src-tauri/target/release/bundle/nsis/`.
Zbývá ruční kontrola vzhledu v nativních oknech při hraní.
