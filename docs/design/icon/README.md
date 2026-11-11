# Ops / aplikační ikona — průzkumník

Dvě původní pixelové varianty pro ARC Raiders Companion (Windows / Tauri 2). **Aktuální zadání používá podobu explorer, levely 15–29**, nikoli rookie. Návrhy nejsou nasazené v aplikaci.

## Doporučení

**V2 jako hlavní aplikační ikona.** Větší hledí a meruňkové oči jsou výraznější v titulku okna a na hlavním panelu. Vysoká anténa a samostatná pravá průzkumná čočka zachovávají identitu průzkumníka. V1 je vhodná, pokud má mít přednost celá postava s batohem a botami, především na ploše a ve Startu.

- **V1 / Celý průzkumník:** nízká kovová bedna, delší stožárek s přijímačem, boční čočka, malý měděný batoh, krátké boty. Zjednodušený typický průzkumnický vzhled; drobné odemykané nástroje, číslo levelu a sběratelské díly jsou vypuštěné kvůli čitelnosti.
- **V2 / Tvář průzkumníka:** samostatně překreslená hlava s větším hledím, očima, anténou a čočkou. Bez batohu a bot.
- Společná grafitová dlaždice s pixelově zaoblenými rohy, tlumeným měděným horním lemem a meruňkovým zkosením vpravo nahoře. Rohy jsou průhledné.

Otevřete [preview.html](preview.html). Český offline náhled má relativní odkazy, vložené CSS, žádné fonty ani síťové závislosti. Ukazuje obě varianty ve všech sedmi velikostech 1 : 1 na světlém a tmavém pozadí, v maketě hlavního panelu, Startu a titulku okna. Jde o makety, ne ověření v nativním Windows.

## Soubory v každé variantě

| Soubor | Rozměr / účel |
|---|---|
| `icon.png` | 1024 × 1024, hlavní předloha |
| `icon16.png`, `icon24.png`, `icon32.png` | Samostatně navržené malé rastry; oči, anténa a čočka mají vlastní celé pixely |
| `icon48.png`, `icon64.png` | Samostatné opticky upravené konstrukce |
| `icon128.png`, `icon256.png` | Celočíselné zvětšení kresby 64 px metodou nejbližšího souseda |
| `icon.ico` | Přesně vložené PNG rastry 16, 24, 32, 48, 64, 128, 256 px; žádné automatické zmenšení |
| `favicon.png` | 64 × 64, s dlaždicí |
| `tray-dark-16.png`, `tray-dark-32.png` | Průhledná hlava, světlá vnější kontura pro tmavý hlavní panel |
| `tray-light-16.png`, `tray-light-32.png` | Průhledná hlava, tmavá vnější kontura pro světlý hlavní panel |
| `tray16.png`, `tray32.png` | Výchozí kopie varianty `dark`; použít odpovídající soubor podle motivu Windows |
| `tauri-icons/` | Kompletní alternativní sada názvů stávajících aplikačních assetů |

Tray hlava je v obou návrzích záměrně shodná. Dvojí kontura pomáhá rozlišit tmavý obrys na grafitu i na krémové; samotné hledí zůstává tmavé a oči světlé. Podpora změny souboru podle motivu je budoucí práce aplikace.

## Náhradní sada pro Tauri

Každá složka `tauri-icons/` obsahuje všechny současné souborové názvy (18 souborů):

- `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` (256 px).
- `icon.png` a `source.png` (1024 px), `icon.ico` a volitelný `icon.icns`.
- `Square30x30Logo.png`, `Square44x44Logo.png`, `Square71x71Logo.png`, `Square89x89Logo.png`, `Square107x107Logo.png`, `Square142x142Logo.png`, `Square150x150Logo.png`, `Square284x284Logo.png`, `Square310x310Logo.png` — rozměry odpovídají názvům.
- `StoreLogo.png` (50 × 50).

Pro nepravidelné rozměry Store se postava zvětšuje pouze celočíselně a centruje do dlaždice vykreslené v cílovém rozměru. Pixely postavy nemají nestejné šířky ani interpolaci. `icon.png` v náhradní sadě má oproti staré 512px ikoně požadovaných 1024 px. Neproběhla záměna `src-tauri/icons/` ani změna konfigurace.

## Výtvarný původ a zpracování

Referencí je původní Bedňák B, zejména `../buddy/layers/README.md`, manifest `ops-layers.json`, tělo `bodies/explorer/idle.png`, výchozí outfit `composite/level-15.png`, katalog dílů v `parts/` a starší `../buddy/final/` i `../buddy/concepts/b/`. Autoritativní je nynější explorer: kovové čelo, tmavé hledí, párové meruňkové oči, měděný spodní panel a scout stožárek s čočkou. Nejde o pouhé oříznutí starého sprite ani o změnu jeho souborů.

Grafika je vlastní deterministická pixelová kresba v Pillow, navazující na existující programatický systém vrstev. Bez generativního modelu, herních assetů, loga ARC Raiders / Embark, duhových pruhů, přechodů, vyhlazování nebo částečné alfy. Paleta navazuje na „Teplý grafit“ z `src/ui/tokens.css` a paletu Ops. Master 1024 px zvětšuje základ 64 px přesně 16×; žádné malování detailů mimo pixelovou mřížku.

## Reprodukce a kontrola

Python 3 + Pillow (ověřeno s Pillow 12.2.0). Z kořene repozitáře:

```powershell
python docs/design/icon/tools/build.py
python docs/design/icon/tools/verify.py
```

Skripty zapisují jen dovnitř `docs/design/icon/`. Build čte názvy a rozměry existujících Tauri PNG, nikoliv jejich grafiku. `tools/validation.json` eviduje rozměry, hashe, paletu, binární alfu, přesnou shodu jednotlivých rastrů uvnitř ICO, úplnost náhradní sady a offline odkazy. `tools/inline-review.html` je pomocná kopie náhledu s vloženými PNG pro zobrazení v konverzaci. Případné kontaktní listy v `tools/` slouží k vizuální kontrole pixelů.

Rozsah: pouze grafické podklady. Bez změny aplikace, bez commitu a bez pushe.
