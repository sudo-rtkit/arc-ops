# Kontrola obrazových návrhů

Čtyři konečné PNG vznikly pomocí vestavěného gpt-image / image_gen. Dashboard, Planner a komponentová tabule prošly další cílenou generativní opravou. Přesné prompty včetně oprav jsou v prompts.json. Obrázky jsou autorské vizuální reference; nejsou screenshoty implementovaného redesignu ani pixelově přesné CSS rendery.

## Priorita při implementaci

1. Skutečná datová pole a logika aplikace.
2. CSS tokeny a specifikace visual-v2.md.
3. Obrazová reference, která ukazuje náladu a hierarchii.

Nesamplovat hex z bitmapy: generátor vytváří jemné odstíny a antialiasing. Přímé barvy jsou v tokens-v2.css. Nepřebírat případné odlesky; pozadí má být ploché. Ikony použít skutečné Lucide z modules.ts, nikoli překreslovat jejich podobu z PNG. Písma importovat z nynějších @fontsource balíčků.

## Dashboard

Konečný PNG má export 1920×1080. Základní generativní rastr měl 1672×941; exportní přepočet pouze rozměrů zachovává kompozici, nejde o nové vykreslení CSS ve skutečném viewportu. Zobrazené hodnoty a tři raidy odpovídají fixture. Zbývající odchylky: části šířek panelů a stupnice typografie jsou orientační, aktivní segment fáze je v obrazu více vyplněný než specifikovaný tmavý selected stav, progress nejbližšího upgradu má být accent (zelená je pouze pro skutečně připravené). Money Runs musí patřit do skupiny Raidy, i když generátor posunul nadpis skupiny pod tuto položku. Nativní save-state je drobný text s ikonou, ne tlačítko. Sidebar má 224px a panely v první řadě 5/4/3 dle dokumentu; obraz je nenahrazuje číselným měřením.

## Raid Journal

Konečný PNG zachovává všechny sloupce, tři raidy a reálný rozbalený detail. Formulace a hodnoty odpovídají implementaci. Kompozice je záměrně vyšší než 1280×800, aby byl detail čitelný jako reference; pro skutečný 1280×800 slouží specifikované min-height a scroll. Generátor nevykreslil skupiny sidebaru a nadměrně zvýraznil svislé hrany tabulky; implementovat skupiny z kódu a pouze jemné horizontální dělení. Filtry při 1280 patří do dvou řádků, ne nepřiměřeně malé do jedné řady. Nezkracovat vysvětlení idempotentního převodu v kódu jen podle obrazového náčrtu.

## Inventory / Material Planner

Po opravě souhlasí všech 9 stanic, cílové úrovně, prázdné sloupce Z cílů, šest materiálů a všechny součty 6/27/27/0. Je zachováno pořadí sekcí. Tato kompozice je přehled dlouhé stránky; u 1280×800 bude její spodní část pod přehybem, nepřevádět řádky na 24px jen proto, aby se vešly celé. Sidebar skupiny musí začínat přesně podle modules.ts: Skill Tree patří Rozvoj, Money Runs a Weekly Trials patří Raidy. Settings musí mít plné existující jméno Settings & Backup. Checkbox zahrnutí cílů má mít podle komponentové specifikace zelené zaškrtnutí; na obrázku je akcentový.

## Komponenty

Konečný PNG ukazuje všechny čtyři varianty Btn a jejich default/hover/focus/active/disabled, dvě velikosti ikonových tlačítek, skutečná pole raidu, badge, progress, tabulku a podpůrné stavy. Badge jsou informační a nemají vymyšlené interakční stavy. Pro barvy včetně danger přesné tokeny, ne odstíny z obrázku. Tři řádky tabulky slouží k porovnání stavů, jejich rozdílná data nejsou další fixture raidů. Délka 150 je záměrný příklad neplatného vstupu, nikoli povolená hodnota. Popisek dalšího skill bodu je statický text, nemá sám o sobě fungovat jako odškrtávací položka. Confirm je zmenšený příklad; ve skutečnosti bude mít backdrop, centrování, focus trap a standardní rozměry z dokumentu.
