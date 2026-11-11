// Anglické verze popisných textů herních dat. České originály v ostatních souborech složky data/ zůstávají beze změny
// (hlídají je zlaté testy proti původnímu deníku). Herní názvy (předměty, materiály, mapy, ARC, skilly, stanice,
// zbraně) se nepřekládají. Tvar a úplnost těchto dat hlídá tests/i18n/gamedata.test.ts.
import type { TEXTS } from './texts';

export const TEXTS_EN: Record<keyof typeof TEXTS, string> = {
  treeRules: 'The tree rules are simplified: a choice after 10 points in a branch, the middle tier only after the choice, the first capstone after 30 and the second after 40 points in the branch.',
  workshopHint: 'Enter how much material you have in your stash. The same material is shared between stations and the shopping list. Priority: Gunsmith → Gear Bench → Scrappy → Medical Lab → Refiner → Utility → Explosives.',
  amplified: 'Gunsmith IV, Research Station IV, an Amplification Module from the Frigate or the Emperor, and a weapon at tier IV. Amplification is permanent and adds +70 max durability.',
  shoppingHint: 'Total material for the next level of all stations. ARC parts are at the top, go for them on purpose.',
  mapsHint: 'Maps are unlocked by the number of rounds played, not by level. A round in which you die counts too. Click + after every raid.',
  pendola: 'On Pendola Pass the loot value changes between matches (Dynamic Loot Zones). At the start of the raid, check which zones are marked as valuable.',
  runHint: 'Every recorded run also increases the number of rounds played.',
  sellRules: 'Rules: count coins per slot, no pointless PvP, head to extraction around minute 10, extract right after a big find, the most expensive item goes into the Safe Pocket.',
  tierHint: 'The C for the Equalizer, Hullcracker and Bettina applies to PvP. Against big ARC they are among the best.',
  trialsHint: 'Stars at 1,000, 2,500 and 4,000 points give an Uncommon, Rare and Epic item or blueprint. Every Monday the stars reset on their own.',
  rewardPassHint: 'Feats: Easy 15 RP, Medium 25 RP, Hard 50 RP. Weekly milestones at 4, 8 and 12 points give 250 RP each.',
};

/* Změny ve 2.0, které mění loadout (stejné pořadí jako PATCH_NOTES). */
export const PATCH_NOTES_EN: string[] = [
  'Grenades deal more than 50% more damage to ARC armour plates and about 30% less to fragile parts.',
  'Jupiter is stronger against armour, slightly weaker on weak points.',
  'Heavy Shield wears down less (0.15 instead of 0.20) and slows you by only 10%.',
  'Snap Hook has an 18 m range and costs 4% durability per use. Grappling Hook can also rappel and swing.',
  'Anvil is now blue (rare); Bantam took over the role of the cheap hand cannon.',
];

/* Mapy: „nejlepší na“ a klíčová místa (stejné pořadí míst jako v MAPS; navštívená místa se ukládají podle české podoby). */
export const MAPS_EN: Record<string, { best: string; places: string }> = {
  dam: { best: 'Getting started, small ARC, money runs', places: 'Research & Administration, Old Battleground (Baron Husk), Pale Apartments, Dome, Power Generation Complex' },
  buried: { best: 'Plants (Great Mullein), trinkets, medical', places: 'Space Travel, Research, Hospital, Library, Galleria, JKV, Town Hall (key room)' },
  spaceport: { best: 'Tech and industrial loot, quests for Shani', places: 'Departure Building, Arrivals Building, Control Tower A6' },
  bluegate: { best: 'Farms (Fertilizer), Outpost quest', places: 'Farmland Village, Ruined Homestead, Checkpoint, Barren Clearing (ARC loot), Ancient Fort' },
  riven: { best: 'The hardest map, ARC Turbine, Beachcombing', places: 'Exodus Hotel, beach and pool, Harbor Dockyard, Wreckage (ARC loot)' },
  stella: { best: 'Interiors, Shredder (only here), money', places: 'Assembly, Medical Research, Loading Bay' },
  pendola: { best: 'Outpost materials, Emperor, Frigate', places: 'Railyard, Cielo Sereno Observatory, Almatera Station, Fallen Emperor, Old Town' },
};

/* Podmínky map (stejné pořadí jako CONDITIONS; názvy jsou herní). */
export const CONDITIONS_EN: string[] = [
  'Better loot, more enemies, worse visibility. Best for money runs with gear.',
  'More rare plants, ideal for the Buried City Great Mullein run.',
  'More fruit and vegetables, i.e. Scrappy upgrades.',
  'A field of destroyed ARC with parts and no fighting.',
  'Good for Trials with flying ARC and ARC Probes.',
  'Pendola Pass only: Emperor Payloads for Gunsmith IV.',
  'Amplification Modules and Research Points.',
];

/* Výchozí „Dalších 10 kroků“ a checklist „Před raidem“ (stejné pořadí jako NEXT_STEPS a RAID_CHECK). */
export const NEXT_STEPS_EN: string[] = [
  'Open the Outpost tab; Sheltered Retreat is available from level 18.',
  'Buy the Advanced Camera from Shani for 3,000 coins, put it in the Safe Pocket and photograph the farmhouse at Ruined Homestead (Blue Gate).',
  'In the Workshop, track the materials for Gunsmith 2 and Gear Bench 2.',
  'Play 2–3 raids hunting small ARC: Wasp, Hornet and Snitch outside, Fireball, Tick and Pop in buildings.',
  'Build Gunsmith 2, then Gear Bench 2, then Refiner 2.',
  'Finish Sheltered Retreat: materials, then damage to flying ARC and the Bully.',
  'Scrappy 3 for 3 Lemon and 3 Apricot.',
  'Medical Lab 2, Utility Station 2, Explosives Station 2.',
  'Complete the Trials for 3 stars every week.',
  'When coins drop below 50,000, do the Galleria + JKV money run with a Free Loadout.',
];
export const RAID_CHECK_EN: string[] = [
  'I took all new quests from all traders',
  'I know which quests, Trials and Feats I will complete on this map',
  'I checked the map condition',
  'I have the materials for the next upgrade tracked',
  'The backpack is empty, the Safe Pocket is free',
  'I have a route plan and two possible extractions',
  'For a money run I have the Raider Hatch Key',
  'The weapon and shield have enough durability',
];

/* Vestavěné trasy Money Runs (název jen tam, kde obsahuje češtinu). */
export const ROUTES_EN: Record<string, { name?: string; risk: string; loadout: string; yield: string; steps: string[] }> = {
  galleria: { risk: 'Low', loadout: 'Free Loadout', yield: '~30,000 / raid', steps: [
    'Find the red-outlined Space Travel building. The target is the unmarked building next to it.',
    'Enter from the east under the GALLERIA SOLDANELLA sign and clear the small turret after the first stairs.',
    'On the first floor, harvest all Great Mullein in the flower pots, then do the same on the top floor.',
    'From the roof, find the building with the JKV sign and climb the scaffolding on the facade to the 6th floor.',
    'Loot two rooms, break the barricaded door between them with the pickaxe, then loot two more and the raider bag.',
    'Extract at the nearest Metro Station.'] },
  oldbattle: { risk: 'Low to medium', loadout: 'A decent weapon', yield: 'up to ~40,000 / raid', steps: [
    'Go to the Old Battleground area and clear the surroundings of the big machine (Baron Husk).',
    'Once it is safe, breach it and loot the ARC parts and valuables.',
    'On the paths around, intercept ARC Couriers and other targets with loot.',
    'Stay quiet and avoid big ARC patrols.',
    'With a full backpack and Safe Pocket, head to the nearest extraction.'] },
  rna: { name: 'Research & Admin lockers', risk: 'Medium', loadout: 'Weapon, ammo, 3 Light Grenades', yield: '60,000+ / raid', steps: [
    'Find the tallest Research & Administration building and approach from the south via the blue metal stairs.',
    'The Sentinel turret on the stairs takes about 3 grenades.',
    'Upstairs in the office, keep the drawers closed for now so you are not seen.',
    'Take the right corner door into the corridor and clear the small turret.',
    'At the end of the corridor, search all lockers in rooms 1 and 2.',
    'Go back to the junction with Fireballs and Ticks, clear it and loot the lockers and room 3.',
    'Extract with a heavy backpack; beyond this the yield drops and the PvP risk grows.'] },
  farmland: { risk: 'Higher (PvP)', loadout: 'Augment with a Safe Pocket', yield: '30,000–60,000 / raid', steps: [
    'Loot all buildings and containers in the village: shops, houses, bins.',
    'Search the dirt piles in the fields; each gives 3 Fertilizer (stacks to 5, ~1,000 each).',
    'Optional: the industrial building with the zipline has a guaranteed weapon crate behind the breached door.',
    'Extract via the Raider Hatch (with the key) or the nearest extraction.'] },
  assembly: { risk: 'Medium', loadout: 'Interior loadout', yield: 'not specified', steps: [
    'Priority: Assembly. Backup: Medical Research (red zone), Loading Bay (yellow).',
    'Loot only blue and better, extract around minute 10.'] },
  arrivals: { risk: 'Medium', loadout: 'Control Tower key', yield: 'not specified', steps: [
    'The Arrivals Building is usually less crowded than the Departure Building.',
    'The Control Tower A6 key opens more high-tier loot.',
    'Loot only blue and better, extract around minute 10.'] },
};

/* Prodejní ceník (stejné pořadí jako SELL): název jen tam, kde obsahuje češtinu, a poznámka. */
export const SELL_EN: { name?: string; note: string }[] = [
  { note: '0.2 kg, stacks to 3, best price per weight' },
  { note: 'trinket' },
  { note: 'trinkets' },
  { name: 'Watches, albums, vases', note: 'trinkets, approximate' },
  { note: 'per slot; check upgrades first' },
  { note: 'stacks to 5' },
  { note: 'also needed for the Charged Burst Amplified node' },
  { name: 'Amplification Module Mk. I and Mk. V', note: 'better recycle a duplicate into 7 Amplified Fragments' },
];

/* Kategorie materiálů (klíč = česká hodnota, která se ukládá ve stavu). */
export const MATERIAL_CATEGORY_EN: Record<string, string> = {
  'Základní suroviny': 'Basic resources',
  Komponenty: 'Components',
  'ARC díly': 'ARC parts',
  'Předměty z lootu': 'Loot items',
  'Stavební materiál': 'Building material',
  'Jídlo a rostliny': 'Food and plants',
  Výzkum: 'Research',
  Ostatní: 'Other',
};

/* Odkud se materiál bere (stejné klíče jako SOURCES). */
export const SOURCES_EN: Record<string, string> = {
  'Wasp Driver': 'ARC: Wasp',
  'Hornet Driver': 'ARC: Hornet',
  'Fireball Burner': 'ARC: Fireball (in buildings)',
  'Tick Pod': 'ARC: Tick',
  'Snitch Scanner': 'ARC: Snitch',
  'Pop Trigger': 'ARC: Pop',
  'Sentinel Firing Core': 'ARC: Sentinel',
  'Bastion Cell': 'ARC: Bastion',
  'Bombardier Cell': 'ARC: Bombardier',
  'Surveyor Vault': 'ARC: Surveyor',
  'Leaper Pulse Unit': 'ARC: Leaper',
  'Rocketeer Driver': 'ARC: Rocketeer',
  'ARC Motion Core': 'ARC: Rocketeer, Leaper, Bastion',
  'ARC Alloy': 'ARC: most machines',
  'ARC Powercell': 'ARC: most machines',
  'ARC Circuitry': 'ARC: Bastion',
  'Magnetic Accelerator': 'ARC: Queen',
  'Skulker Targeter': 'ARC: Skulker',
  'Bully Fragmenter': 'ARC: Bully',
  'Frigate Inductor': 'ARC Frigate',
  'Emperor Modulator': 'Inside the Emperor (Pendola Pass)',
  'Steel Cable': 'Pendola Pass: Railyard, Fallen Emperor; or Celeste for Assorted Seeds',
  Lemon: 'Fruit, more during Harvest Season',
  Apricot: 'Fruit, more during Harvest Season',
  'Prickly Pear': 'Fruit',
  Olives: 'Fruit',
  Mushroom: 'Plants',
  'Raider Logbook': 'Research item (100 RP)',
  'Exodus Technical Handbook': 'Research item (150 RP)',
  'ARC Data Module': 'Research item (200 RP)',
};

/* Stanice: role a poznámky k úrovním. */
export const STATIONS_EN: Record<string, { role: string; notes?: Record<number, string> }> = {
  gunsmith: { role: 'Weapons and mods' },
  gear: { role: 'Shields and augments' },
  medical: { role: 'Healing' },
  refiner: { role: 'Components for the other stations' },
  utility: { role: 'Gadgets' },
  explosives: { role: 'Grenades and mines' },
  scrappy: { role: 'Passive material after every raid' },
  outpost: { role: 'Surface base, unlocks the Research Station', notes: { 1: 'Sheltered Retreat: photograph the farmhouse at Ruined Homestead (Blue Gate), then 800 damage to flying ARC and 300 to the Bully.' } },
  research: { role: 'Research of blueprints and Amplified weapons', notes: { 1: 'The level I recipe differs between sources; verify it in the game.' } },
};

/* ARC: taktika z deníku podle jména záznamu deníku (stejné klíče jako ARC_DIARY.name). */
export const ARC_TACTICS_EN: Record<string, string> = {
  'Tick, Pop': 'Small; melee or any weapon will do.',
  'Wasp, Hornet': 'Flying drones, aim for the thrusters.',
  Snitch: 'Does not fight, gives you away and calls reinforcements. Kill it first, aim for the thrusters.',
  Fireball: 'Inside buildings, flamethrower and a burning floor. Keep your distance.',
  'Turret, Sentinel': 'Static and armoured, ideally grenades.',
  Surveyor: 'Harvest the Surveyor Vault from it for Medical Lab 3.',
  Leaper: 'Weak to fire (Blaze Grenade). Hide in a building it cannot fit into.',
  Rocketeer: 'Thrusters; needs a lot of damage. Wolfpack and Hullcracker.',
  Bastion: 'Rear plate and leg joints. One player lures it, the others hit the joints.',
  Bombardier: 'Same weak spots as the Bastion, no armour on the body. Spotters first, then cover with a roof.',
  Queen: 'Leg joints and the head core during the laser. Team, launchers, EMP.',
  Matriarch: 'Joints and the head core, Equalizer.',
  'Bully (2.0)': 'Fast and aggressive. Hit it from cover, a doorway or a roof.',
  'Skulker (2.0)': 'Attacks from the edge of your vision and retreats. Keep looking around.',
  'Hydra (2.0)': 'A three-part tower on the Frigate, the sections fire independently. Split them between you.',
};

/* ARC: údaje z rešerše (stejné klíče jako ARC_META). */
export const ARC_META_EN: Record<string, { type?: string; category?: string; weakness?: string }> = {
  Tick: { type: 'Ground, small', category: 'Hexapod', weakness: 'Any weapon destroys it.' },
  Pop: { type: 'Ground, small', category: 'Ball', weakness: 'Any weapon destroys it.' },
  Wasp: { type: 'Flying, small', category: 'Combat drone', weakness: 'Destroying the thrusters throws it off.' },
  Hornet: { type: 'Flying, small', category: 'Combat drone', weakness: 'Unarmoured rear thrusters; destroying the thrusters throws it off.' },
  Snitch: { type: 'Flying, small', category: 'Scout drone', weakness: 'Destroying the thrusters throws it off. It calls nearby ARC, kill it quickly.' },
  Fireball: { type: 'Ground, small', category: 'Ball', weakness: 'The weak spot (white core) is exposed when it opens to attack; one heavy ammo shot is enough.' },
  Turret: { type: 'Ground, static', category: 'Turret', weakness: 'Bait an attack and hide behind cover; usually 2 heavy ammo shots.' },
  Sentinel: { type: 'Ground, static', category: 'Turret', weakness: 'Yellow canister on the shoulder; bait an attack and hide behind cover.' },
  Surveyor: { type: 'Ground, small', category: 'Ball', weakness: 'The weak spot is exposed during the laser; stun it with a Hornet Driver or Showstopper, explosives recommended.' },
  Leaper: { type: 'Ground, large', category: 'Quadruped', weakness: 'Leg joints and the eye; explosives work fast, a stunned Leaper is defenceless.' },
  Rocketeer: { type: 'Flying, large', category: 'Combat drone', weakness: 'Thrusters and the scanner on top, silver canister on the back.' },
  Bastion: { type: 'Ground, large', category: 'Hexapod', weakness: 'Yellow leg joints and the rear canister; a stunned Bastion is defenceless.' },
  Bombardier: { type: 'Ground, large', category: 'Hexapod', weakness: 'Yellow leg joints and the rear canister; heavy ammo and the Hullcracker work best.' },
  Queen: { type: 'Giant', category: 'Hexapod (boss)', weakness: 'Shoot off the armour plates to reach the red core; yellow weak spots on the legs.' },
  Matriarch: { type: 'Giant', category: 'Hexapod (boss)', weakness: 'Shoot off the armour plates to reach the red core; yellow weak spots on the legs.' },
  Bully: { type: 'Ground, large', category: 'Quadruped', weakness: 'The legs and head can be destroyed.' },
  Skulker: { type: 'Ground, small', category: 'Hovering drone' },
  Hydra: { type: 'Ground, static', category: 'Turret', weakness: 'Weak spots on the back; the Hullcracker is recommended, easier in a group.' },
};

/* Nebezpečnost ARC (klíč = česká hodnota, která se ukládá ve stavu). */
export const ARC_DANGER_EN: Record<string, string> = { Nízká: 'Low', Střední: 'Medium', Vysoká: 'High', Extrémní: 'Extreme' };

/* Kategorie zbraní (klíč = česká hodnota z WEAPON_META). */
export const WEAPON_CATEGORY_EN: Record<string, string> = {
  'Útočná puška': 'Assault rifle',
  'Bitevní puška': 'Battle rifle',
  'Samopal (SMG)': 'Submachine gun (SMG)',
  Brokovnice: 'Shotgun',
  Pistole: 'Pistol',
  'Hand cannon': 'Hand cannon',
  'Lehký kulomet (LMG)': 'Light machine gun (LMG)',
  'Odstřelovací puška': 'Sniper rifle',
  Speciální: 'Special',
};

/* Fáze zbraní z deníku (stejné pořadí jako WEAPON_PHASES): úroveň, na hráče, na ARC. */
export const WEAPON_PHASES_EN: [string, string, string, string][] = [
  ['1', 'lvl 1–10', 'Whatever the Free Loadout gives, Rattler III from the first quest', 'Ferro'],
  ['2', 'lvl 10–20', 'Il Toro, Stitcher, Burletta', 'Stiletto'],
  ['3', 'lvl 20–45', 'Tempest, Canto, Bobcat, Bantam', 'Jupiter, Hullcracker, Renegade'],
  ['4', 'lvl 45–75', 'Vulcano, Dolabra', 'Equalizer, Amplified Anvil or Jupiter'],
];

/* Skill tree: názvy pater a popisy skillů (názvy skillů jsou herní). */
export const TIER_NAMES_EN: string[] = ['Start', 'Early skills', 'Choice after 10 points · 1 of 2', '6 more skills', 'Capstone after 30 and 40 points · 2 of 3'];
export const SKILL_DESC_EN: Record<string, string> = {
  c_used: 'Shields slow you down less',
  c_breaths: 'Faster recovery after running out of stamina',
  c_vigorous: 'Vaulting is not slowed when exhausted',
  c_mule: 'Heavy load slows stamina regeneration less',
  c_vaultcarry: 'Vault while carrying an item',
  c_gallop: 'Sprint even when overloaded',
  c_feet: 'HP regeneration when critically wounded (up to 40 HP in 2.0)',
  c_downed: 'Slower bleed-out when downed',
  c_crawl: 'Faster crawling when downed',
  c_shoulders: '+2 to +10 carry capacity',
  c_speedy: 'Smaller penalty when heavily overloaded',
  c_arms: 'The held weapon counts less towards weight',
  c_pryer: 'Faster breaching',
  c_breach: 'Opens Security Lockers',
  c_bash: 'Weapon strike',
  c_rush: 'Sprinting with your weapon holstered knocks back players and ARC',
  m_lungs: 'More max stamina',
  m_scrambler: 'Longer slope climbing while sprinting',
  m_roll: 'Bigger time window for the Recovery Roll',
  m_climber: 'Faster climbing and vaulting',
  m_fight: 'Stamina back when hit in combat (with a cooldown)',
  m_spring: 'Jump at the end of a vault',
  m_vaults: 'Vaulting costs no stamina',
  m_effortless: 'Dodging costs less stamina',
  m_slide: 'Longer and faster slide',
  m_back: 'Faster recovery after a hard landing',
  m_wall: 'Longer Wall Leap',
  m_marathon: 'Movement costs less stamina',
  m_swift: 'Longer acceleration at the start of a sprint',
  m_fumes: 'Stamina never fully runs out while sprinting',
  m_wallrun: 'A few steps along a wall while sprinting',
  m_flow: 'Chaining movements speeds you up and saves stamina',
  s_craft: 'Crafting right in the raid',
  s_instincts: 'Loot in a container is revealed faster',
  s_silent: 'Quieter looting',
  s_ankles: 'Less fall damage',
  s_croucher: 'Faster movement while crouched',
  s_quickroll: 'Faster, cheaper and shorter dodge',
  s_mines: 'Defuse mines and explosives up close',
  s_pressure: 'Quieter breaching',
  s_extra: 'Breaching yields resources',
  s_tinker: 'More items for crafting in the raid',
  s_luck: 'Chance to reveal 2 items at once',
  s_landing: 'Recovery Roll even from a greater height',
  s_turtle: 'Less damage while lying on the ground',
  s_warrior: 'More ammo and Powercells from ARC, full recycling in the raid',
  s_nomadic: 'Many more items for crafting in the raid',
  s_repair: 'Repair weapons, shields and gadgets to 30% in the raid',
};
/* Buildy z deníku: pro koho (stejné pořadí jako BUILDS). */
export const BUILDS_WHO_EN: string[] = ['Money runs, quests, solo', 'Aggressive play against players', 'Fast movement, hit and run, escapes', 'Group play'];
