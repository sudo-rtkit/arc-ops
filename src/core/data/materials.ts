// Kategorie materiálů. Deník kategorie neměl; tohle je orientační rozdělení pro přehled v Inventory a uživatel ho může změnit.

export const MATERIAL_CATEGORIES = [
  'Základní suroviny', 'Komponenty', 'ARC díly', 'Předměty z lootu', 'Stavební materiál', 'Jídlo a rostliny', 'Výzkum', 'Ostatní',
] as const;

const group = (category: string, names: string[]): [string, string][] => names.map(n => [n, category]);

export const MATERIAL_CATEGORY: Record<string, string> = Object.fromEntries([
  ...group('Základní suroviny', ['Metal Parts', 'Rubber Parts', 'Plastic Parts', 'Fabric', 'Chemicals']),
  ...group('Komponenty', ['Mechanical Components', 'Advanced Mechanical Components', 'Electrical Components',
    'Advanced Electrical Components', 'Durable Cloth', 'Antiseptic', 'Crude Explosives', 'Explosive Compound']),
  ...group('ARC díly', ['Wasp Driver', 'Hornet Driver', 'Fireball Burner', 'Tick Pod', 'Snitch Scanner', 'Pop Trigger',
    'Sentinel Firing Core', 'Bastion Cell', 'Bombardier Cell', 'Surveyor Vault', 'Leaper Pulse Unit', 'Rocketeer Driver',
    'ARC Motion Core', 'ARC Alloy', 'ARC Powercell', 'ARC Circuitry', 'Magnetic Accelerator', 'Skulker Targeter',
    'Bully Fragmenter', 'Frigate Inductor', 'Emperor Modulator']),
  ...group('Předměty z lootu', ['Rusted Tools', 'Rusted Gear', 'Radial Press', 'Power Cable', 'Industrial Battery',
    'Cracked Bioscanner', 'Rusted Shut Medical Kit', 'Toaster', 'Motor', 'Damaged Heat Sink', 'Fried Motherboard',
    'Synthesized Fuel', 'Laboratory Reagents', 'Dog Collar', 'Cat Bed', 'Very Comfortable Pillow', 'Battered Paperback',
    'Calculator', 'Differential Microphone', 'Thermal Shaker']),
  ...group('Stavební materiál', ['Planks', 'Sheet Metal', 'Steel Cable', 'Cable Stripper', 'Epoxy Bucket', 'Hand Drill',
    'Laser Level', 'Insulation Roll', 'Mini Pump']),
  ...group('Jídlo a rostliny', ['Lemon', 'Apricot', 'Prickly Pear', 'Olives', 'Mushroom']),
  ...group('Výzkum', ['Raider Logbook', 'Exodus Technical Handbook', 'ARC Data Module']),
  /* 0.13.1: předměty z požadavků úkolů, workshopu a projektů (ARC Tracker), které deník neměl. Jako materiál je jde
     počítat v Zásobě, takže s nimi počítá i nákupní seznam, Planner a postup úkolů. Klíče a předměty k použití
     (Emperor Gateway Conduit, Remote Raider Flare) se evidují ve Vybavení. Hlídá tests/core/requirement-items.test.ts. */
  ...group('ARC díly', ['ARC Conductive Coupler', 'ARC Performance Steel', 'ARC Synthetic Resin', 'ARC Thermo Lining',
    'Advanced ARC Powercell', 'Comet Igniter', 'Firefly Burner', 'Glitched ARC Circuitry', 'Glitched ARC Light Ring',
    'Glitched ARC Phased Array', 'Glitched ARC Power Converter', 'Glitched ARC Transmitter', 'Matriarch Reactor',
    'Queen Reactor', 'Shredder Gyro', 'Spotter Relay']),
  ...group('Komponenty', ['Battery', 'Wires', 'Power Rod', 'Exodus Modules', 'Syringe']),
  ...group('Předměty z lootu', ['Bicycle Pump', 'Dead Flowers', 'Deflated Football', 'Equatorial Sundial', 'Expired Respirator',
    'Fancy Plate', 'Flow Controller', 'Geiger Counter', 'Ion Sputter', 'Magnetron', 'Mask Fragment', 'Portable TV',
    'Railway Lantern', 'Rock Salt', 'Rotary Encoder', 'Rusted Bolts']),
  ...group('Jídlo a rostliny', ['Great Mullein', 'Fertilizer']),
]);

/* 0.13.1: materiály, které aplikace vedla pod jiným názvem než hra (převzato z deníku). Uložený stav se při načtení
   převede na herní název (src/core/state.ts, migrateMaterialNames), takže počty v Zásobě zůstanou. */
export const MATERIAL_RENAMES: Readonly<Record<string, string>> = {
  'Cable Strippers': 'Cable Stripper',
};
