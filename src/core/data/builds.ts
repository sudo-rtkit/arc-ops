/* Katalog buildů skill tree (milník 6, verze 0.8.0). Přesné ranky po skillech; pravidla stromu hlídá
   tests/core/build-catalog.test.ts. Popisy píše tým ARC OPS vlastními slovy podle obecně známých faktů o buildech;
   texty ze zdrojových webů se nekopírují. Zdroj se zobrazí jako odkaz, který se otevře jen na kliknutí (ExtLink).
   Herní názvy skillů zůstávají anglicky jako ve hře. Stav hry: 2.0 Frozen Trail, skilly beze změny do 2.3. */
import type { BuildSourceRef, CatalogBuild } from '../types';
import { PLANS } from './skills';

export const BUILD_GAME_VERSION = '2.0–2.3';
/* Den, kdy byl katalog sestaven a zdroje zkontrolovány. */
export const BUILD_SOURCES_DATE = '2026-11-11';

/* Komunitní weby, ze kterých vychází rozdělení bodů. Jen domovské stránky, otevřou se jen na kliknutí. */
export const BUILD_SOURCE_URLS = {
  thearcraiders: 'https://thearcraiders.com/',
  boostingmarket: 'https://boostingmarket.com/',
  arcraidersuk: 'https://arcraiders.uk/',
  lfcarry: 'https://lfcarry.com/',
} as const;
const ref = (k: keyof typeof BUILD_SOURCE_URLS): BuildSourceRef => ({ label: BUILD_SOURCE_URLS[k].replace(/^https:\/\/|\/$/g, ''), url: BUILD_SOURCE_URLS[k] });
const web = (...keys: (keyof typeof BUILD_SOURCE_URLS)[]) => ({ kind: 'web' as const, refs: keys.map(ref), date: BUILD_SOURCES_DATE });
const diary = { kind: 'diary' as const, refs: [], date: BUILD_SOURCES_DATE };

export const BUILD_CATALOG: CatalogBuild[] = [
  {
    id: 'aggressive-pvp',
    name: { cs: 'Agresivní PvP', en: 'Aggressive PvP' },
    tags: ['pvp', 'solo'], difficulty: 3,
    points: {
      m_lungs: 1, m_climber: 5, m_fight: 5, m_scrambler: 5, m_roll: 1, m_spring: 1, m_effortless: 5, m_slide: 5, m_marathon: 5,
      m_swift: 5, m_back: 1, m_flow: 1, m_fumes: 1,
      c_used: 1, c_mule: 5, c_breaths: 4, c_vigorous: 1, c_feet: 1, c_arms: 1, c_shoulders: 5, c_downed: 5, c_crawl: 1,
      s_craft: 1, s_croucher: 5, s_ankles: 4, s_quickroll: 1,
    },
    keys: ['m_flow', 'm_fumes', 'c_feet'],
    desc: {
      cs: {
        summary: 'Build pro hráče, kteří raidy rozhodují v přestřelkách. Skoro polovina bodů jde do pohybu, zbytek do přežití po zásahu.',
        playstyle: 'Vyhledáváš kontakt, tlačíš na pozice a měníš úhel dřív, než soupeř zareaguje. Když souboj nevyjde, odpoutáš se skluzem a sprintem.',
        strengths: ['Nejvíc staminy a pohybu v boji ze všech buildů v katalogu', 'Vault Spring a In The Flow dávají nečekané úhly a rychlé přesuny', 'Back On Your Feet a Downed But Determined drží naživu po prohrané výměně'],
        weaknesses: ['Pomalé prohledávání, bez bonusů na loot', 'Bez Security Breach, takže Security Lockery zůstanou zavřené', 'Málo nosnosti navíc; na velký loot se nehodí'],
        synergies: ['Fight Or Flight + Marathon Runner + Sprinting On Fumes: stamina se v boji vrací a sprint skoro nedojde', 'Effortless Roll + Slip and Slide + In The Flow: řetězení úhybů a skluzů bez velkých nákladů', 'Agile Croucher + Quick Roll: rychlý pohyb za krytem a krátký úhyb'],
        loadout: 'Zbraň na střední a krátkou vzdálenost, lehký štít, léčení a granát nebo jiný nástroj na vyhnání z krytu. Málo věcí navíc, ať zůstaneš lehký.',
        leveling: 'Nejdřív Mobility: Youthful Lungs, Fight Or Flight a Nimble Climber, pak Vault Spring a Marathon Runner. Po 30 bodech v Mobility Sprinting On Fumes, pak Conditioning do Back On Your Feet. Survival s Quick Roll přijde nakonec.',
      },
      en: {
        summary: 'A build for players who win raids in gunfights. Almost half the points go into movement, the rest into surviving after taking hits.',
        playstyle: 'You look for contact, push positions and change angles before the enemy reacts. When a fight goes wrong, you break away with slides and sprints.',
        strengths: ['The most stamina and combat movement of any build in the catalog', 'Vault Spring and In The Flow give unexpected angles and quick repositioning', 'Back On Your Feet and Downed But Determined keep you alive after a lost trade'],
        weaknesses: ['Slow searching, no looting bonuses', 'No Security Breach, so Security Lockers stay closed', 'Little extra carry capacity; not suited for big hauls'],
        synergies: ['Fight Or Flight + Marathon Runner + Sprinting On Fumes: stamina comes back in combat and the sprint almost never runs dry', 'Effortless Roll + Slip and Slide + In The Flow: chain dodges and slides at a low cost', 'Agile Croucher + Quick Roll: fast movement behind cover and a short dodge'],
        loadout: 'A weapon for mid and close range, a light shield, healing and a grenade or another tool to flush enemies out of cover. Keep extras to a minimum so you stay light.',
        leveling: 'Mobility first: Youthful Lungs, Fight Or Flight and Nimble Climber, then Vault Spring and Marathon Runner. At 30 Mobility points take Sprinting On Fumes, then Conditioning up to Back On Your Feet. Survival with Quick Roll comes last.',
      },
    },
    source: web('thearcraiders'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'balanced-raid',
    name: { cs: 'Vyvážený raid', en: 'Balanced Raid' },
    tags: ['pve', 'pvp', 'loot', 'solo', 'squad'], difficulty: 1,
    points: {
      m_lungs: 1, m_climber: 5, m_scrambler: 5, m_roll: 1, m_vaults: 1, m_marathon: 5, m_swift: 5, m_fight: 5, m_effortless: 1, m_slide: 1, m_fumes: 1,
      c_used: 1, c_mule: 5, c_breaths: 3, c_vigorous: 1, c_gallop: 1, c_shoulders: 5, c_speedy: 5, c_arms: 1, c_pryer: 5, c_downed: 2, c_crawl: 1, c_breach: 1,
      s_craft: 1, s_instincts: 5, s_silent: 4, s_quickroll: 1, s_tinker: 1, s_ankles: 1, s_croucher: 1,
    },
    keys: ['c_breach', 'm_fumes', 's_quickroll'],
    desc: {
      cs: {
        summary: 'Nejčastěji doporučovaný univerzál. Otevře Security Lockery, unese hodně a pořád má dost pohybu na útěk.',
        playstyle: 'Hraješ podle situace: lootíš, plníš questy a do boje jdeš, když se vyplatí. Když ne, máš staminu na odchod.',
        strengths: ['Security Breach a Proficient Pryer na rychlé lockery', 'Sprinting On Fumes a Marathon Runner na dlouhé přesuny', 'Hodně nosnosti díky Broad Shoulders a Speedy Mule', 'Dobrý start pro nové hráče: nic zásadního nechybí'],
        weaknesses: ['V žádné oblasti není nejlepší', 'Jen jeden koncový skill v Mobility a Conditioning', 'Survival jen do Quick Roll, bez koncových uzlů'],
        synergies: ['Mule\'s Gallop + Speedy Mule + Broad Shoulders: s těžkým batohem pořád sprintuješ', 'Vaults on Vaults on Vaults + Vigorous Vaulter: překážky nestojí staminu', 'Looter\'s Instincts + Silent Scavenger: rychlejší a tišší prohledávání'],
        loadout: 'Univerzální zbraň na střední vzdálenost, střední štít, léčení a místo v batohu na lockery. Vezmi věc na breaching, když míříš na Security Lockery.',
        leveling: 'Mobility do Vaults on Vaults on Vaults a Marathon Runner, pak Survival do Quick Roll. Potom Conditioning: Mule\'s Gallop, Broad Shoulders, Proficient Pryer a po 30 bodech Security Breach. Sprinting On Fumes jako poslední velký krok.',
      },
      en: {
        summary: 'The most commonly recommended all-rounder. It opens Security Lockers, carries a lot and still has enough movement to escape.',
        playstyle: 'You play the situation: loot, do quests and fight when it pays off. When it does not, you have the stamina to leave.',
        strengths: ['Security Breach and Proficient Pryer for fast lockers', 'Sprinting On Fumes and Marathon Runner for long rotations', 'Lots of carry capacity from Broad Shoulders and Speedy Mule', 'A good start for new players: nothing important is missing'],
        weaknesses: ['Not the best at any single thing', 'Only one end skill in Mobility and Conditioning', 'Survival only up to Quick Roll, no end nodes'],
        synergies: ['Mule\'s Gallop + Speedy Mule + Broad Shoulders: you keep sprinting with a heavy backpack', 'Vaults on Vaults on Vaults + Vigorous Vaulter: obstacles cost no stamina', 'Looter\'s Instincts + Silent Scavenger: faster and quieter searching'],
        loadout: 'An all-round mid-range weapon, a medium shield, healing and backpack space for lockers. Bring a breaching tool when you head for Security Lockers.',
        leveling: 'Mobility up to Vaults on Vaults on Vaults and Marathon Runner, then Survival up to Quick Roll. Next Conditioning: Mule\'s Gallop, Broad Shoulders, Proficient Pryer and at 30 points Security Breach. Sprinting On Fumes is the last big step.',
      },
    },
    source: web('thearcraiders', 'boostingmarket', 'arcraidersuk', 'lfcarry'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'looter-breach',
    name: { cs: 'Looter / Security Breach', en: 'Looter / Security Breach' },
    tags: ['loot', 'pve', 'solo'], difficulty: 1,
    points: {
      m_lungs: 1, m_climber: 5, m_fight: 4, m_vaults: 1, m_marathon: 3,
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_vaultcarry: 1, c_gallop: 1, c_shoulders: 5, c_arms: 1, c_pryer: 5, c_speedy: 5, c_breach: 1,
      s_craft: 1, s_instincts: 5, s_silent: 5, s_ankles: 5, s_croucher: 1, s_quickroll: 1, s_tinker: 1, s_luck: 5, s_pressure: 5, s_extra: 1, s_warrior: 1,
    },
    keys: ['c_breach', 's_warrior', 'c_gallop'],
    desc: {
      cs: {
        summary: 'Nástupce „Solo Looter“ z deníku s přesnými body. Money runy, questy a PvE: lockery, rychlé prohledávání a velký batoh.',
        playstyle: 'Jdeš po místech s lootem a lockerech, boji se spíš vyhýbáš. Z raidu odcházíš s plným batohem.',
        strengths: ['Security Breach i Road Warrior: lockery a plná recyklace v raidu', 'Looter\'s Luck, Looter\'s Instincts a Silent Scavenger: rychlý a tichý loot', 'Mule\'s Gallop a Speedy Mule: sprint i s přetíženým batohem', 'Gentle Pressure a A Little Extra: tichý breaching, který dává suroviny'],
        weaknesses: ['Málo pohybu pro PvP, bez koncového skillu v Mobility', 'Bez Back On Your Feet, takže po zásahu se hůř zotavuješ', 'Proti agresivnímu týmu se spíš schováš, než ubráníš'],
        synergies: ['Security Breach + Proficient Pryer: lockery se otevírají rychle', 'Road Warrior + A Little Extra: víc surovin a munice bez cesty domů', 'Mule\'s Gallop + Vault \'n\' Carry + Speedy Mule: těžký náklad tě skoro nezdrží'],
        loadout: 'Levnější zbraň na obranu, lehký nebo střední štít, velký batoh, nástroj na breaching a místo pro cenné věci. Nebereš drahou výbavu, kterou by byla škoda ztratit.',
        leveling: 'Survival do Quick Roll a Looter\'s Instincts brzy, pak Conditioning až po Security Breach. Mobility jen na 14 bodů (Vaults on Vaults on Vaults). Road Warrior přijde nakonec, až má Survival 30 bodů.',
        notes: 'Starý plán „Solo Looter“ z deníku zůstává v nabídce plánů beze změny; tento build má vlastní přesné ranky.',
      },
      en: {
        summary: 'The successor of the diary\'s "Solo Looter" with exact points. Money runs, quests and PvE: lockers, fast searching and a big backpack.',
        playstyle: 'You go for loot spots and lockers and mostly avoid fights. You leave the raid with a full backpack.',
        strengths: ['Both Security Breach and Road Warrior: lockers and full recycling in the raid', 'Looter\'s Luck, Looter\'s Instincts and Silent Scavenger: fast, quiet looting', 'Mule\'s Gallop and Speedy Mule: sprint even with an overloaded backpack', 'Gentle Pressure and A Little Extra: quiet breaching that gives materials'],
        weaknesses: ['Little movement for PvP, no Mobility end skill', 'No Back On Your Feet, so you recover worse after taking hits', 'Against an aggressive team you hide rather than hold'],
        synergies: ['Security Breach + Proficient Pryer: lockers open quickly', 'Road Warrior + A Little Extra: more materials and ammo without a trip home', 'Mule\'s Gallop + Vault \'n\' Carry + Speedy Mule: heavy cargo barely slows you down'],
        loadout: 'A cheaper weapon for defence, a light or medium shield, a big backpack, a breaching tool and room for valuables. Leave expensive gear you would hate to lose.',
        leveling: 'Survival up to Quick Roll and Looter\'s Instincts early, then Conditioning all the way to Security Breach. Mobility only to 14 points (Vaults on Vaults on Vaults). Road Warrior comes last, once Survival has 30 points.',
        notes: 'The old "Solo Looter" plan from the diary stays unchanged in the plan list; this build has its own exact ranks.',
      },
    },
    source: web('thearcraiders', 'arcraidersuk'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'pve-loot',
    name: { cs: 'PvE loot', en: 'PvE Loot' },
    tags: ['pve', 'loot', 'squad'], difficulty: 1,
    points: {
      m_lungs: 1, m_climber: 5, m_fight: 4, m_spring: 1, m_marathon: 5, m_effortless: 5, m_swift: 5,
      c_used: 1, c_mule: 2, c_breaths: 5, c_vigorous: 1, c_vaultcarry: 1, c_gallop: 1, c_arms: 1, c_shoulders: 5, c_crawl: 5, c_downed: 5, c_speedy: 3, c_breach: 1,
      s_craft: 1, s_instincts: 5, s_silent: 4, s_quickroll: 1, s_tinker: 1, s_luck: 5, s_pressure: 1, s_extra: 1,
    },
    keys: ['c_breach', 'c_gallop', 's_luck'],
    desc: {
      cs: {
        summary: 'Lockery, nosnost a rychlé prohledávání s jediným koncovým uzlem. Body, které jinde jdou do koncových skillů, tady posilují střed všech tří větví.',
        playstyle: 'Klidné raidy proti ARC, questy a sběr surovin. Ve skupině vydržíš dlouho na zemi, než tě zvednou.',
        strengths: ['Security Breach otevře lockery', 'Looter\'s Luck a Looter\'s Instincts zrychlí prohledávání', 'Downed But Determined a Crawl Before You Walk: dlouho přežiješ sražený na zemi', 'Effortless Roll a Swift Start na úhyby před ARC'],
        weaknesses: ['Jen jeden koncový uzel (Security Breach)', 'Bez Sprinting On Fumes, při dlouhém sprintu dojde stamina', 'Na PvP je málo pohybu a ochrany'],
        synergies: ['Mule\'s Gallop + Broad Shoulders + Speedy Mule: plný batoh a pořád sprint', 'Downed But Determined + Crawl Before You Walk: čas, aby tě spoluhráč zvedl', 'Looter\'s Luck + A Little Extra: víc věcí z jednoho kontejneru a breachingu'],
        loadout: 'Zbraň účinná proti ARC, střední štít, dost léčení a velký batoh. Ve skupině se domluv, kdo nese nástroj na breaching.',
        leveling: 'Mobility do Vault Spring a Marathon Runner, potom Survival do Quick Roll a Looter\'s Luck. Conditioning: Mule\'s Gallop, Broad Shoulders, střední skilly a Security Breach po 30 bodech.',
      },
      en: {
        summary: 'Lockers, carry capacity and fast searching with a single end node. Points that other builds spend on end skills strengthen the middle of all three branches here.',
        playstyle: 'Calm raids against ARC, quests and gathering materials. In a squad you last a long time on the ground before someone picks you up.',
        strengths: ['Security Breach opens lockers', 'Looter\'s Luck and Looter\'s Instincts speed up searching', 'Downed But Determined and Crawl Before You Walk: you survive long when downed', 'Effortless Roll and Swift Start for dodging ARC'],
        weaknesses: ['Only one end node (Security Breach)', 'No Sprinting On Fumes, so long sprints run out of stamina', 'Too little movement and protection for PvP'],
        synergies: ['Mule\'s Gallop + Broad Shoulders + Speedy Mule: full backpack and still sprinting', 'Downed But Determined + Crawl Before You Walk: time for a teammate to revive you', 'Looter\'s Luck + A Little Extra: more items from one container and from breaching'],
        loadout: 'A weapon that works well against ARC, a medium shield, plenty of healing and a big backpack. In a squad, agree on who carries the breaching tool.',
        leveling: 'Mobility up to Vault Spring and Marathon Runner, then Survival up to Quick Roll and Looter\'s Luck. Conditioning: Mule\'s Gallop, Broad Shoulders, the middle skills and Security Breach at 30 points.',
      },
    },
    source: web('boostingmarket', 'lfcarry'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'solo-survival',
    name: { cs: 'Sólo přežití', en: 'Solo Survival' },
    tags: ['solo', 'stealth', 'pve'], difficulty: 2,
    points: {
      m_lungs: 1, m_climber: 5, m_fight: 5, m_vaults: 1, m_marathon: 5, m_effortless: 5, m_swift: 5, m_slide: 3, m_fumes: 1,
      c_used: 1, c_mule: 5, c_breaths: 3, c_vigorous: 1, c_feet: 1, c_arms: 1, c_shoulders: 2,
      s_craft: 1, s_instincts: 5, s_silent: 5, s_croucher: 5, s_ankles: 5, s_quickroll: 1, s_tinker: 1, s_pressure: 5, s_extra: 1, s_landing: 1, s_repair: 1,
    },
    keys: ['s_repair', 'm_fumes', 'c_feet'],
    desc: {
      cs: {
        summary: 'Pro sólo hráče, kteří se boji vyhýbají a vydrží v raidu dlouho. Field Repair opraví výbavu přímo v raidu.',
        playstyle: 'Pohybuješ se potichu, obcházíš nebezpečí a lootíš okraje mapy. Když tě někdo najde, utečeš, opravíš štít a pokračuješ.',
        strengths: ['Field Repair: oprava zbraní, štítů a gadgetů v raidu', 'Silent Scavenger, Agile Croucher a Gentle Pressure: tichý pohyb i loot', 'Sprinting On Fumes a Vaults on Vaults on Vaults na útěk', 'Back On Your Feet pro regeneraci po zásahu'],
        weaknesses: ['Málo nosnosti (Broad Shoulders jen 2)', 'Bez Security Breach', 'Na přímý souboj chybí ochrana i pohybové skilly do boje'],
        synergies: ['Field Repair + Traveling Tinkerer + In-Round Crafting: výbava vydrží celý raid', 'Agile Croucher + Silent Scavenger: přiblížíš se i lootíš bez hluku', 'Marathon Runner + Sprinting On Fumes + Vaults on Vaults on Vaults: odchod bez starostí o staminu'],
        loadout: 'Tichá zbraň nebo zbraň na střední vzdálenost, štít, který se vyplatí opravovat, suroviny na crafting a lehký batoh.',
        leveling: 'Survival do Quick Roll a Silent Scavenger, Mobility do Vaults on Vaults on Vaults. Pak Mobility na 30 a Sprinting On Fumes, Survival na 30 a Field Repair. Conditioning do Back On Your Feet nakonec.',
      },
      en: {
        summary: 'For solo players who avoid fights and stay in the raid for a long time. Field Repair fixes gear right in the raid.',
        playstyle: 'You move quietly, go around danger and loot the edges of the map. When someone finds you, you run, repair your shield and carry on.',
        strengths: ['Field Repair: repair weapons, shields and gadgets in the raid', 'Silent Scavenger, Agile Croucher and Gentle Pressure: quiet movement and looting', 'Sprinting On Fumes and Vaults on Vaults on Vaults for escapes', 'Back On Your Feet for regeneration after taking hits'],
        weaknesses: ['Little carry capacity (Broad Shoulders only 2)', 'No Security Breach', 'Lacks protection and combat movement for a straight fight'],
        synergies: ['Field Repair + Traveling Tinkerer + In-Round Crafting: gear lasts the whole raid', 'Agile Croucher + Silent Scavenger: approach and loot without noise', 'Marathon Runner + Sprinting On Fumes + Vaults on Vaults on Vaults: leave without worrying about stamina'],
        loadout: 'A quiet weapon or a mid-range weapon, a shield worth repairing, crafting materials and a light backpack.',
        leveling: 'Survival up to Quick Roll and Silent Scavenger, Mobility up to Vaults on Vaults on Vaults. Then Mobility to 30 and Sprinting On Fumes, Survival to 30 and Field Repair. Conditioning up to Back On Your Feet last.',
      },
    },
    source: web('thearcraiders'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'silent-thief',
    name: { cs: 'Tichý zloděj', en: 'Silent Thief' },
    tags: ['stealth', 'loot', 'solo'], difficulty: 2,
    points: {
      m_lungs: 1, m_climber: 5, m_fight: 5, m_spring: 1, m_marathon: 5, m_swift: 5, m_effortless: 5, m_slide: 3, m_fumes: 1,
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_gallop: 1, c_arms: 1,
      s_craft: 1, s_instincts: 5, s_silent: 5, s_ankles: 1, s_croucher: 5, s_quickroll: 1, s_pressure: 5, s_tinker: 1, s_luck: 5, s_extra: 1, s_warrior: 1,
    },
    keys: ['s_warrior', 's_silent', 'm_fumes'],
    desc: {
      cs: {
        summary: 'Tiché prohledávání, tichý breaching a plná recyklace v raidu. Záměrně bez Security Breach, body jdou do pohybu.',
        playstyle: 'Přijdeš, potichu vybereš kontejnery a dveře a zmizíš dřív, než si tě někdo všimne. Recykluješ v raidu a nosíš jen to cenné.',
        strengths: ['Silent Scavenger 5 a Gentle Pressure 5: loot i breaching skoro bez hluku', 'Road Warrior: plná recyklace a víc munice a Powercellů z ARC', 'Sprinting On Fumes a Vault Spring na rychlý odchod', 'Looter\'s Luck a Looter\'s Instincts: méně času u kontejneru'],
        weaknesses: ['Bez Security Breach, lockery zůstanou zavřené', 'Málo nosnosti, Conditioning jen na 14', 'Bez skillů na přežití po zásahu'],
        synergies: ['Agile Croucher + Silent Scavenger + Gentle Pressure: celý postup bez hluku', 'Road Warrior + A Little Extra: suroviny z recyklace i breachingu', 'Mule\'s Gallop: když batoh přetížíš, pořád sprintuješ'],
        loadout: 'Tichá nebo lehká zbraň, lehký štít, malý až střední batoh. Nástroj na breaching vždy s sebou.',
        leveling: 'Survival do Quick Roll a Silent Scavenger, pak Mobility do Vault Spring. Survival dál k 30 bodům a Road Warrior, potom Mobility na 30 a Sprinting On Fumes. Conditioning do Mule\'s Gallop nakonec.',
      },
      en: {
        summary: 'Quiet searching, quiet breaching and full recycling in the raid. Deliberately without Security Breach; the points go into movement.',
        playstyle: 'You arrive, quietly empty containers and doors and vanish before anyone notices. You recycle in the raid and carry only what is valuable.',
        strengths: ['Silent Scavenger 5 and Gentle Pressure 5: looting and breaching with almost no noise', 'Road Warrior: full recycling plus more ammo and Powercells from ARC', 'Sprinting On Fumes and Vault Spring for a fast exit', 'Looter\'s Luck and Looter\'s Instincts: less time at each container'],
        weaknesses: ['No Security Breach, lockers stay closed', 'Little carry capacity, Conditioning only 14', 'No skills for surviving after taking hits'],
        synergies: ['Agile Croucher + Silent Scavenger + Gentle Pressure: the whole approach without noise', 'Road Warrior + A Little Extra: materials from recycling and breaching', 'Mule\'s Gallop: if you overload the backpack you can still sprint'],
        loadout: 'A quiet or light weapon, a light shield, a small to medium backpack. Always bring a breaching tool.',
        leveling: 'Survival up to Quick Roll and Silent Scavenger, then Mobility up to Vault Spring. Survival on to 30 points and Road Warrior, then Mobility to 30 and Sprinting On Fumes. Conditioning up to Mule\'s Gallop last.',
      },
    },
    source: web('boostingmarket'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'stamina-runner',
    name: { cs: 'Stamina Runner', en: 'Stamina Runner' },
    tags: ['pvp', 'solo'], difficulty: 2,
    /* Přesně cíl vestavěného plánu `runner` z deníku (test to hlídá). */
    points: {
      m_lungs: 1, m_fight: 5, m_climber: 5, m_spring: 1, m_marathon: 5, m_effortless: 5, m_slide: 5, m_swift: 5, m_fumes: 1, m_roll: 5, m_back: 1, m_scrambler: 1, m_flow: 1,
      s_craft: 1, s_instincts: 5, s_silent: 4, s_quickroll: 1, s_landing: 5,
      c_used: 1, c_mule: 5, c_breaths: 4, c_feet: 1, c_shoulders: 5, c_speedy: 3,
    },
    order: PLANS.runner.steps, plan: 'runner',
    keys: ['m_fumes', 'm_flow', 's_quickroll'],
    desc: {
      cs: {
        summary: 'Plán „Stamina Runner“ z deníku: rychlý pohyb, hit and run a útěky. Mobility na 41 bodů s oběma koncovými skilly.',
        playstyle: 'Rychle se přesouváš mezi body zájmu, krátce zaútočíš a zmizíš. Souboj si vybíráš ty, ne soupeř.',
        strengths: ['Sprinting On Fumes a In The Flow: nejlepší stamina a řetězení pohybu', 'Stylish Landing 5 a Ready To Roll 5: seskoky z výšky bez trestu', 'Back On Your Feet pro regeneraci po zásahu', 'Plán je v aplikaci od začátku a jde rozdávat bod po bodu'],
        weaknesses: ['Bez Security Breach a bez lootovacích koncových skillů', 'Střední nosnost', 'Na dlouhé souboje na místě chybí ochrana'],
        synergies: ['Ready To Roll + Stylish Landing + Right Back At It: skok z výšky a hned dál', 'Swift Start + Marathon Runner + Sprinting On Fumes: sprint, který skoro nedojde', 'Effortless Roll + Slip and Slide + In The Flow: levné úhyby a skluzy za sebou'],
        loadout: 'Lehká zbraň s rychlým zaměřením, lehký štít, léčení a nástroj na odpoutání (kouř, past). Málo váhy.',
        leveling: 'Přesně podle vestavěného plánu: Mobility do Vault Spring a Marathon Runner, Survival do Quick Roll, pak Mobility až po Sprinting On Fumes a In The Flow, Stylish Landing a nakonec Conditioning.',
      },
      en: {
        summary: 'The diary\'s "Stamina Runner" plan: fast movement, hit and run, escapes. Mobility at 41 points with both end skills.',
        playstyle: 'You move quickly between points of interest, strike briefly and disappear. You choose the fight, not the enemy.',
        strengths: ['Sprinting On Fumes and In The Flow: the best stamina and movement chaining', 'Stylish Landing 5 and Ready To Roll 5: drops from height without a penalty', 'Back On Your Feet for regeneration after taking hits', 'The plan has been in the app from the start and can be applied point by point'],
        weaknesses: ['No Security Breach and no looting end skills', 'Medium carry capacity', 'Lacks protection for long stationary fights'],
        synergies: ['Ready To Roll + Stylish Landing + Right Back At It: jump from height and keep going', 'Swift Start + Marathon Runner + Sprinting On Fumes: a sprint that almost never runs out', 'Effortless Roll + Slip and Slide + In The Flow: cheap dodges and slides in a row'],
        loadout: 'A light weapon with fast aiming, a light shield, healing and a tool to break contact (smoke, trap). Little weight.',
        leveling: 'Exactly as the built-in plan: Mobility up to Vault Spring and Marathon Runner, Survival up to Quick Roll, then Mobility all the way to Sprinting On Fumes and In The Flow, Stylish Landing and finally Conditioning.',
      },
    },
    source: diary, gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'team-support',
    name: { cs: 'Týmová podpora', en: 'Team Support' },
    tags: ['squad', 'pve'], difficulty: 2,
    points: {
      m_lungs: 1, m_fight: 3,
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_vaultcarry: 1, c_feet: 1, c_downed: 5, c_crawl: 5, c_shoulders: 5, c_arms: 1, c_breach: 1,
      s_craft: 1, s_instincts: 5, s_silent: 5, s_ankles: 4, s_croucher: 5, s_mines: 1, s_pressure: 5, s_tinker: 1, s_extra: 1, s_luck: 5, s_turtle: 5, s_landing: 1,
      s_nomadic: 1, s_repair: 1,
    },
    keys: ['s_nomadic', 's_repair', 'c_breach'],
    desc: {
      cs: {
        summary: 'Squadová podpora z deníku s přesnými body: crafting a opravy pro tým, lockery a dlouhé přežití na zemi.',
        playstyle: 'Držíš se za týmem, craftíš munici a léčení, opravuješ výbavu a otevíráš lockery. Když tě srazí, vydržíš, než pro tebe dojdou.',
        strengths: ['Nomadic Crafting a Field Repair: tým má zásoby a opravenou výbavu', 'Security Breach otevře lockery pro celý tým', 'Downed But Determined, Crawl Before You Walk a Turtle Crawl: přežití na zemi', 'Minesweeper zneškodní miny a výbušniny v cestě'],
        weaknesses: ['Skoro žádná Mobility (4 body), sprint dojde rychle', 'Sólo hra je těžká', 'V přímém souboji spoléháš na tým'],
        synergies: ['Nomadic Crafting + Traveling Tinkerer + In-Round Crafting: crafting pro celý tým v raidu', 'Field Repair + A Little Extra: suroviny na opravy z breachingu', 'Back On Your Feet + Turtle Crawl + Downed But Determined: dlouhé přežití, dokud tě nezvednou'],
        loadout: 'Zbraň na střední vzdálenost, silnější štít, hodně surovin na crafting a velký batoh. Domluv se s týmem, co komu craftíš.',
        leveling: 'Survival do Minesweeper a Looter\'s Instincts, Conditioning do Back On Your Feet. Pak Survival na 30 a Nomadic Crafting, Conditioning na 30 a Security Breach, nakonec Survival na 40 a Field Repair. Mobility jen pár bodů.',
      },
      en: {
        summary: 'The diary\'s squad support with exact points: crafting and repairs for the team, lockers and long survival when downed.',
        playstyle: 'You stay behind the team, craft ammo and healing, repair gear and open lockers. When you go down, you last until someone reaches you.',
        strengths: ['Nomadic Crafting and Field Repair: the team has supplies and repaired gear', 'Security Breach opens lockers for the whole team', 'Downed But Determined, Crawl Before You Walk and Turtle Crawl: survival on the ground', 'Minesweeper defuses mines and explosives in the way'],
        weaknesses: ['Almost no Mobility (4 points), the sprint runs out fast', 'Solo play is hard', 'In a straight fight you rely on the team'],
        synergies: ['Nomadic Crafting + Traveling Tinkerer + In-Round Crafting: crafting for the whole team in the raid', 'Field Repair + A Little Extra: repair materials from breaching', 'Back On Your Feet + Turtle Crawl + Downed But Determined: long survival until you are revived'],
        loadout: 'A mid-range weapon, a stronger shield, lots of crafting materials and a big backpack. Agree with the team on what you craft for whom.',
        leveling: 'Survival up to Minesweeper and Looter\'s Instincts, Conditioning up to Back On Your Feet. Then Survival to 30 and Nomadic Crafting, Conditioning to 30 and Security Breach, and finally Survival to 40 and Field Repair. Only a few points in Mobility.',
      },
    },
    source: diary, gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'pvp-fighter',
    name: { cs: 'PvP Fighter', en: 'PvP Fighter' },
    tags: ['pvp', 'squad'], difficulty: 3,
    points: {
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_feet: 1, c_shoulders: 5, c_downed: 5, c_crawl: 5, c_arms: 1, c_pryer: 1, c_bash: 1,
      m_lungs: 1, m_climber: 5, m_fight: 5, m_spring: 1, m_effortless: 5, m_marathon: 5, m_slide: 5, m_swift: 3, m_flow: 1,
      s_craft: 1, s_croucher: 5, s_ankles: 4, s_quickroll: 1, s_turtle: 3,
    },
    keys: ['c_bash', 'm_flow', 'c_feet'],
    desc: {
      cs: {
        summary: 'PvP build z deníku s přesnými body: odolnost v boji, Weapon Bash na blízko a In The Flow na pohyb.',
        playstyle: 'Hraješ v týmu na pozice a vyhráváš výměny. Na blízko dorazíš úderem zbraní, po prohrané výměně vydržíš na zemi.',
        strengths: ['Weapon Bash pro souboje na blízko', 'In The Flow, Effortless Roll a Slip and Slide: rychlé změny pozice', 'Back On Your Feet, Downed But Determined, Crawl Before You Walk a Turtle Crawl: těžko tě vyřadí nadobro', 'Dobře funguje ve skupině, kde tě spoluhráč zvedne'],
        weaknesses: ['Bez Security Breach a bez lootovacích skillů', 'Bez Sprinting On Fumes, na dlouhém sprintu dojde stamina', 'Pomalé prohledávání'],
        synergies: ['Fight Or Flight + Marathon Runner: stamina zpět v boji', 'Back On Your Feet + Downed But Determined + Turtle Crawl: dlouhé přežití po zásahu', 'Vault Spring + In The Flow: nečekané úhly přes překážky'],
        loadout: 'Silná zbraň na krátkou a střední vzdálenost, silnější štít, hodně léčení a granáty. Lehký batoh.',
        leveling: 'Mobility do Vault Spring, Conditioning do Back On Your Feet, pak Survival do Quick Roll. Conditioning na 30 a Weapon Bash, Mobility na 30 a In The Flow. Turtle Crawl nakonec.',
      },
      en: {
        summary: 'The diary\'s PvP build with exact points: toughness in combat, Weapon Bash up close and In The Flow for movement.',
        playstyle: 'You play positions with a team and win trades. Up close you finish with a weapon strike; after a lost trade you last on the ground.',
        strengths: ['Weapon Bash for close-quarters fights', 'In The Flow, Effortless Roll and Slip and Slide: fast repositioning', 'Back On Your Feet, Downed But Determined, Crawl Before You Walk and Turtle Crawl: hard to take out for good', 'Works well in a squad where a teammate revives you'],
        weaknesses: ['No Security Breach and no looting skills', 'No Sprinting On Fumes, long sprints run out of stamina', 'Slow searching'],
        synergies: ['Fight Or Flight + Marathon Runner: stamina back in combat', 'Back On Your Feet + Downed But Determined + Turtle Crawl: long survival after taking hits', 'Vault Spring + In The Flow: unexpected angles over obstacles'],
        loadout: 'A strong close to mid-range weapon, a stronger shield, plenty of healing and grenades. A light backpack.',
        leveling: 'Mobility up to Vault Spring, Conditioning up to Back On Your Feet, then Survival up to Quick Roll. Conditioning to 30 and Weapon Bash, Mobility to 30 and In The Flow. Turtle Crawl last.',
      },
    },
    source: diary, gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'expedition-pvp',
    name: { cs: 'Expediční PvP', en: 'Expedition PvP' },
    tags: ['pvp', 'expedition'], difficulty: 3, only91: true,
    points: {
      m_lungs: 1, m_scrambler: 2, m_climber: 5, m_fight: 5, m_spring: 1, m_effortless: 5, m_marathon: 5, m_slide: 5, m_wall: 5, m_swift: 5, m_fumes: 1, m_wallrun: 1,
      c_used: 1, c_breaths: 5, c_mule: 3, c_vigorous: 1, c_gallop: 1, c_arms: 1, c_shoulders: 5, c_downed: 5, c_crawl: 5, c_speedy: 3, c_pryer: 3,
      /* Spec uvádí Sturdy Ankles 3 a Survival 17, ale ranky dávají jen 16 (celkem 90). Oprava: Sturdy Ankles 4. */
      s_craft: 1, s_instincts: 5, s_ankles: 4, s_silent: 1, s_quickroll: 1, s_luck: 5,
    },
    keys: ['m_wallrun', 'm_fumes', 'c_gallop'],
    desc: {
      cs: {
        summary: 'PvP build pro hráče s 15 body z Expedic (91 bodů). Mobility na 41 s Wall Run a Sprinting On Fumes, k tomu nosnost a přežití na zemi.',
        playstyle: 'Agresivní hra s pohybem po stěnách a dlouhými sprinty. Díky bodům navíc uneseš i loot a po zásahu vydržíš.',
        strengths: ['Wall Run a Off The Wall 5: pohyb po zdech, který soupeř nečeká', 'Sprinting On Fumes a Marathon Runner na dlouhé honičky', 'Mule\'s Gallop a Broad Shoulders: sprint i s plným batohem', 'Downed But Determined a Crawl Before You Walk: přežití na zemi'],
        weaknesses: ['Funguje jen s 91 body; bez Expedic ho nedosáhneš', 'Bez Security Breach a bez koncového skillu v Conditioning', 'Survival jen do Quick Roll'],
        synergies: ['Wall Run + Off The Wall + Vault Spring: vertikální pohyb, který mění úhly', 'Fight Or Flight + Swift Start + Sprinting On Fumes: stamina v boji i na útěku', 'Mule\'s Gallop + Speedy Mule + Loaded Arms: těžká výbava tě nebrzdí'],
        loadout: 'Zbraň na krátkou a střední vzdálenost, střední štít, léčení a granát. Díky nosnosti i místo na loot.',
        leveling: 'Do 76 bodů hraj jako Agresivní PvP nebo PvP Fighter: Mobility, pak Conditioning a Survival do Quick Roll. Body z Expedic dej do Off The Wall, Wall Run a Looter\'s Luck.',
      },
      en: {
        summary: 'A PvP build for players with 15 Expedition points (91 points). Mobility at 41 with Wall Run and Sprinting On Fumes, plus carry capacity and survival when downed.',
        playstyle: 'Aggressive play with wall movement and long sprints. Thanks to the extra points you can also carry loot and last after taking hits.',
        strengths: ['Wall Run and Off The Wall 5: wall movement the enemy does not expect', 'Sprinting On Fumes and Marathon Runner for long chases', 'Mule\'s Gallop and Broad Shoulders: sprint with a full backpack', 'Downed But Determined and Crawl Before You Walk: survival when downed'],
        weaknesses: ['Works only with 91 points; you cannot reach it without Expeditions', 'No Security Breach and no Conditioning end skill', 'Survival only up to Quick Roll'],
        synergies: ['Wall Run + Off The Wall + Vault Spring: vertical movement that changes angles', 'Fight Or Flight + Swift Start + Sprinting On Fumes: stamina in combat and on the run', 'Mule\'s Gallop + Speedy Mule + Loaded Arms: heavy gear does not slow you down'],
        loadout: 'A close to mid-range weapon, a medium shield, healing and a grenade. Thanks to carry capacity, room for loot as well.',
        leveling: 'Up to 76 points play it like Aggressive PvP or PvP Fighter: Mobility, then Conditioning and Survival up to Quick Roll. Put the Expedition points into Off The Wall, Wall Run and Looter\'s Luck.',
      },
    },
    source: web('lfcarry'), gameVersion: BUILD_GAME_VERSION,
  },
  {
    id: 'buldozer',
    name: { cs: 'Buldozer', en: 'Bulldozer' },
    tags: ['broken', 'loot', 'pvp', 'expedition'], difficulty: 2, theory: true,
    points: {
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_vaultcarry: 1, c_gallop: 1, c_arms: 1, c_shoulders: 5, c_speedy: 5, c_pryer: 5, c_downed: 5, c_crawl: 4,
      c_breach: 1, c_rush: 1,
      m_lungs: 1, m_climber: 5, m_fight: 5, m_vaults: 1, m_marathon: 5, m_swift: 5, m_effortless: 5, m_slide: 3, m_fumes: 1,
      s_craft: 1, s_instincts: 3,
    },
    variant91: {
      c_used: 1, c_mule: 5, c_breaths: 5, c_vigorous: 1, c_vaultcarry: 1, c_gallop: 1, c_arms: 1, c_shoulders: 5, c_speedy: 5, c_pryer: 5, c_downed: 5, c_crawl: 4,
      c_breach: 1, c_rush: 1,
      m_lungs: 1, m_climber: 5, m_fight: 5, m_vaults: 1, m_marathon: 5, m_swift: 5, m_effortless: 5, m_slide: 3, m_fumes: 1,
      s_craft: 1, s_instincts: 5, s_silent: 4, s_quickroll: 1, s_luck: 5, s_extra: 1, s_pressure: 2,
    },
    keys: ['c_rush', 'c_gallop', 'm_fumes'],
    desc: {
      cs: {
        summary: 'Vlastní „broken“ návrh ARC OPS: nezastavitelný nákladák. Přetížený sprint skoro bez konce, překážky bez staminy, lockery a Bull Rush, který odhodí hráče i ARC z cesty.',
        playstyle: 'Naložíš batoh přes limit a pořád sprintuješ. V úzké chodbě se schovanou zbraní prorazíš skrz, otevřeš locker a zmizíš dřív, než se soupeř zvedne.',
        strengths: ['Mule\'s Gallop, Speedy Mule 5, Stubborn Mule 5, Broad Shoulders 5 a Loaded Arms: nosíš mnohem víc a pořád běžíš', 'Sprinting On Fumes, Marathon Runner 5, Swift Start 5 a Fight Or Flight 5: sprint, který prakticky nedojde', 'Vaults on Vaults on Vaults, Vigorous Vaulter a Vault \'n\' Carry: přes překážky zdarma, i vyčerpaný a s nesenou věcí', 'Security Breach a Proficient Pryer 5: rychlé lockery', 'Bull Rush: ve sprintu odhodíš hráče i ARC, v úzkém místě tě nikdo nezastaví'],
        weaknesses: ['Skoro žádné Survival perky: pomalejší a hlasitější loot, v základní verzi bez Quick Roll', 'Bull Rush funguje jen se schovanou zbraní; proti soustředěné palbě nepomůže', 'Kombinace přetíženého sprintu a Bull Rush není ověřená ve hře'],
        synergies: ['Mule\'s Gallop + Speedy Mule + Stubborn Mule + Broad Shoulders + Loaded Arms: přetížení skoro bez trestu (podle náhledu stromu Speedy Mule 5 až +40 % rychlosti při přetížení, Broad Shoulders 5 +10 nosnosti)', 'Sprinting On Fumes + Marathon Runner + Swift Start + Fight Or Flight: stamina na sprint skoro nedojde', 'Vaults on Vaults on Vaults + Vigorous Vaulter + Vault \'n\' Carry: vault bez staminy, i vyčerpaný a s nesenou věcí', 'Bull Rush + Mule\'s Gallop: sprint s plným batohem, který zároveň razí cestu'],
        loadout: 'Zbraň, kterou rychle schováš a vytáhneš, střední štít, velký batoh a nástroj na breaching. Bull Rush potřebuje schovanou zbraň, takže zbraň tas až po průrazu.',
        leveling: 'Mobility do Vaults on Vaults on Vaults a Marathon Runner, pak Conditioning: Mule\'s Gallop, Stubborn Mule, Broad Shoulders, Speedy Mule. Conditioning na 30 a Security Breach, Mobility na 30 a Sprinting On Fumes, nakonec Conditioning na 40 a Bull Rush. S 15 body z Expedic doplň Survival (varianta 91).',
        notes: 'Teorie – vyzkoušej sám. Kombinace přetíženého sprintu (Mule\'s Gallop) a Bull Rush není ověřená ve hře; čísla vycházejí z náhledových hodnot ve stromu, ne z měření v raidu. Varianta 91 přidá Quick Roll, Silent Scavenger a Looter\'s Luck.',
      },
      en: {
        summary: 'ARC OPS\'s own "broken" design: an unstoppable freight truck. An overloaded sprint that barely ends, obstacles without stamina, lockers and Bull Rush that throws players and ARC out of the way.',
        playstyle: 'You load the backpack past the limit and keep sprinting. In a narrow corridor you burst through with your weapon holstered, open a locker and vanish before the enemy gets up.',
        strengths: ['Mule\'s Gallop, Speedy Mule 5, Stubborn Mule 5, Broad Shoulders 5 and Loaded Arms: you carry much more and keep running', 'Sprinting On Fumes, Marathon Runner 5, Swift Start 5 and Fight Or Flight 5: a sprint that practically never runs dry', 'Vaults on Vaults on Vaults, Vigorous Vaulter and Vault \'n\' Carry: free vaults, even exhausted and while carrying an item', 'Security Breach and Proficient Pryer 5: fast lockers', 'Bull Rush: while sprinting you knock players and ARC aside, nobody stops you in a choke point'],
        weaknesses: ['Almost no Survival perks: slower, louder looting and no Quick Roll in the base version', 'Bull Rush works only with the weapon holstered; it does not help against focused fire', 'The combination of overloaded sprint and Bull Rush is untested in the game'],
        synergies: ['Mule\'s Gallop + Speedy Mule + Stubborn Mule + Broad Shoulders + Loaded Arms: overloading with almost no penalty (tree preview: Speedy Mule 5 up to +40% speed when overloaded, Broad Shoulders 5 +10 carry capacity)', 'Sprinting On Fumes + Marathon Runner + Swift Start + Fight Or Flight: sprint stamina almost never runs out', 'Vaults on Vaults on Vaults + Vigorous Vaulter + Vault \'n\' Carry: vaulting costs no stamina, even exhausted and while carrying', 'Bull Rush + Mule\'s Gallop: a full-backpack sprint that also clears the way'],
        loadout: 'A weapon you can holster and draw quickly, a medium shield, a big backpack and a breaching tool. Bull Rush needs the weapon holstered, so draw it only after you break through.',
        leveling: 'Mobility up to Vaults on Vaults on Vaults and Marathon Runner, then Conditioning: Mule\'s Gallop, Stubborn Mule, Broad Shoulders, Speedy Mule. Conditioning to 30 and Security Breach, Mobility to 30 and Sprinting On Fumes, finally Conditioning to 40 and Bull Rush. With 15 Expedition points fill Survival (variant 91).',
        notes: 'Theory - try it yourself. The overloaded sprint (Mule\'s Gallop) + Bull Rush combo is untested in the game; the values come from the tree preview numbers, not from measurements in a raid. Variant 91 adds Quick Roll, Silent Scavenger and Looter\'s Luck.',
      },
    },
    source: { kind: 'own', refs: [], date: BUILD_SOURCES_DATE }, gameVersion: BUILD_GAME_VERSION,
  },
];
