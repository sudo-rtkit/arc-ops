# AI asistent Ops, fáze 1: návrh (14. 11. 2026)

Navazuje na roadmapu (`2026-11-13-strategie-roadmapa.md`, bod 4). Rozhodnutí hráče z 14. 11.: běží v cloudu, ideálně
zdarma, a nespěcháme. Dokument popisuje první verzi. Lokální model zatím ne, protože by zatěžoval počítač při hraní.

## Cíl

Hráč se zeptá vlastními slovy, například:
- „Proč si mám nechat Wires?“
- „Co prodat, když potřebuju místo?“
- „Co mi chybí na další úkol?“

Ops odpoví nad jeho vlastními daty v aplikaci. Čísla počítá stávající deterministický kód (rádce „Co dál?“, karta
předmětu, Příprava na raid, Úklid). Jazykový model je jen vysvětluje a vybírá, co je k otázce důležité.

## Zásady

1. **Ve výchozím stavu vypnuto.** Aby šel asistent zapnout, musí hráč:
   - souhlasit s krátkým textem, co se posílá, komu a že bezplatné služby mohou data použít ke zlepšování svých modelů;
   - vložit vlastní klíč.
2. **Vlastní klíč (BYOK).** Aplikace ani repozitář žádný klíč neobsahují. Repozitář je veřejný.
3. **Jen čtení.** Model nevolá nic, co mění data. Případná akce, třeba přidání do nákupního seznamu, je jen návrh
   s tlačítkem, které stiskne hráč.
4. **Nikdy v raidu a nikdy tak, aby vzal hře focus.** Na ploše se dá ptát Bedňáka kliknutím. Ve hře jen v overlayi,
   který hráč sám otevře zkratkou mimo raid. Podrobnosti v části Rozhraní.
5. **Odpověď uvádí zdroj.** Pod odpovědí je seznam údajů, ze kterých vycházela. Ke každému je jeho původ (z 0.21.0)
   a jistota.
6. **Posílá se jen nutné minimum.** Nikdy se neposílají:
   - snímky obrazovky;
   - jména jiných hráčů;
   - celá záloha;
   - cesty k souborům;
   - e-mail.

## Poskytovatel

Volba v Nastavení, pevný seznam hostitelů. Všichni níže nabízejí rozhraní kompatibilní s OpenAI (chat completions).
Stačí tedy jeden klient v Rustu.

| Poskytovatel | Zdarma (podle přehledů z 11/2026, ověřit při implementaci) | Pozor |
|---|---|---|
| **Groq** (výchozí návrh) | bez karty; ~30 dotazů/min, ~1000 dotazů/den na gpt-oss-120b | jen open-weight modely; ověřit podmínky použití dat |
| Google Gemini API | bez karty; jen Flash a Flash-Lite, limity se mění a jsou nízké | data z bezplatné verze Google používá ke zlepšování produktů a mohou je číst lidé |
| OpenRouter (modely `:free`) | ~50 dotazů/den bez dobití | seznam bezplatných modelů se často mění; někteří provozovatelé trénují na vstupech |

Zdroje: [Gemini API pricing](https://aistudio.google.com/docs/pricing), [OpenRouter: free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/), [byoklist: free AI API keys](https://byoklist.com/guides/free-ai-api-keys).
U každého poskytovatele aplikace ukáže odkaz na jeho stránku s klíči a jednu větu o tom, co dělá s daty.

## Architektura

```
Hlavní okno (React)                     Rust (Tauri)                      Poskytovatel
  AiPanel: otázka ──► sestaví kontext ──► ai_ask(provider, model, msgs) ──► HTTPS, pevný hostitel
     ▲               (jen čtecí nástroje,    │ klíč z Windows Credential       (api.groq.com …)
     │                limit velikosti)       │ Manageru, nikdy do WebView
     └──── odpověď + seznam zdrojů ◄─────────┘ časový limit, max. délka odpovědi
```

- **Otázky z buddyho a overlaye** jdou do hlavního okna přes relay. V allow-listu je jedna nová akce s omezenou
  délkou otázky. Odpověď se vrací stávající cestou hub → buddy/overlay. `ai_ask` tedy volá jen hlavní okno.
- **Síť jen přes Rust.** CSP ve WebView zůstává bez sítě. Nový příkaz `ai_ask`:
  - je jen pro hlavní okno, ověřené podle štítku okna;
  - má pevný seznam hostitelů a jen HTTPS;
  - používá časový limit 30 s, omezení velikosti dotazu i odpovědi a nejvýš 1 současný dotaz;
  - má vlastní limit dotazů za minutu, aby hráč nevyčerpal bezplatnou kvótu omylem.
- **Klíč** je ve Windows Credential Manageru (crate `keyring`). Příkazy `ai_key_set`, `ai_key_clear` a `ai_key_status`
  vrací jen ano/ne, nikdy klíč. Klíč se nedostane do úložiště aplikace, do zálohy, do záznamu chyb (0.28.0) ani do
  WebView.
- **Kontext.** Model nedostane volné nástroje. Aplikace podle typu otázky sama připraví malý balík údajů ze
  stávajících výpočtů a pošle ho jako data, ne jako pokyny:
  - předmět a jeho použití;
  - chybějící materiály;
  - rady nechat/prodat/recyklovat;
  - stav skrýše.

  Nejdřív jsou jen tři typy otázek: Inventář, Úkoly a dílna, Příprava na raid. Analytika přijde v další fázi.
- **Prompt injection.** Názvy předmětů a poznámky hráče jdou do zprávy jako data v ohraničeném bloku. Odpověď modelu
  se zobrazuje jako prostý text, ne jako HTML ani Markdown s odkazy. Model nemá k dispozici žádnou akci, kterou by
  mohl spustit sám.

## Rozhraní

**AI asistent je Bedňák.** Nejde o samostatnou „AI“ vedle něj. Hráč se ptá Opse a Ops odpovídá:
- ve své bublině, ve zvolené povaze (Věcný / Kamarádský / Drzý), s animací thinking → talk;
- delší odpověď se zdroji ukáže v polní konzoli.

Kde se dá ptát:
- **Na ploše:** kliknutím na Bedňáka. Hra není v popředí, takže Ops smí vzít klávesnici.
- **V overlayi, který si hráč sám otevře zkratkou,** a jen mimo raid. Využije se k tomu signál „v raidu“ z 0.20.0.
  Overlay už dnes přijímá vstup jen na vyžádání hráče.
- **V raidu ani v Hra režimu nikdy.** Hráč tam nemá psát, Ops nesmí brát hře focus a AI během hraní je šedá zóna,
  dokud se nevyjádří Embark.

**Návrhy „co dál“.** Bedňák sám navrhuje další kroky:
- **Základ je zdarma a bez AI:** stávající rádce „Co dál?“ (0.17.0). Když hráč klikne na Bedňáka nebo otevře konzoli
  mimo raid, Ops nabídne 3 nejlepší kroky:
  - úkol, na který už má materiál;
  - co vyrobit nebo vylepšit;
  - co prodat nebo recyklovat, když dochází místo;
  - na co se zaměřit v příštím raidu.
- **AI k tomu přidá:**
  - vysvětlení („proč zrovna tohle?“) a odpovědi na doplňující otázky;
  - shrnutí po raidu: co se povedlo, co přineslo a co dělat dál. Vychází z vyhodnocení po raidu a deníku.
- **Navrhuje jen mimo raid** a jen se zapnutými dialogy. Nikdy nevyskočí sám během hraní a nikdy nevezme focus.
  AI dotaz se pošle až na vyžádání hráče, aby se zbytečně nečerpala bezplatná kvóta.

Ovládání:
- **Nastavení → AI asistent:**
  - přepínač;
  - výběr poskytovatele a modelu;
  - vložení a smazání klíče;
  - text, co se posílá;
  - počítadlo dnešních dotazů.
- **Panel „Zeptej se Opse“** v hlavním okně a tlačítko „Zeptat se“ na kartě předmětu. Ukazuje odpověď, pod ní zdroje
  a malé upozornění „vytvořeno AI, čísla počítá aplikace“.
- **Chybové stavy (cs + en):**
  - chybí klíč;
  - neplatný klíč;
  - vyčerpaná bezplatná kvóta;
  - bez připojení;
  - hra v popředí.

  Nikdy neskončí „přemýšlením“ bez konce.

## Testy

- Rust:
  - seznam hostitelů;
  - limity velikosti a času;
  - vynucení hlavního okna;
  - že klíč nikdy neopustí Rust;
  - zkušební server místo skutečné služby.
- TS:
  - sestavení kontextu (velikost, žádné citlivé údaje, ohraničení dat);
  - chybové stavy;
  - že bez souhlasu a klíče se nic nevolá.
- Bezpečnostní testy ACL pro nové příkazy.
- E2E se zkušebním poskytovatelem, bez sítě.

## Rozdělení do verzí

- **Fáze 1 (jedna verze):** nastavení, klíč, `ai_ask`, Inventář a karta předmětu.
- **Fáze 2:** Úkoly a dílna, Příprava na raid (AI Raid Planner).
- **Fáze 3:** analytika nad statistikami (Personal AI Analyst), vždy s velikostí vzorku.

## Otevřené otázky pro hráče

1. Výchozí poskytovatel Groq? Je bez karty, má nejvyšší bezplatné limity a podmínky použití dat ověřím.
2. Rozhodnuto 14. 11.: AI je přímo Bedňák a odpovídá ve své povaze.
