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
  ...group('Stavební materiál', ['Planks', 'Sheet Metal', 'Steel Cable', 'Cable Strippers', 'Epoxy Bucket', 'Hand Drill',
    'Laser Level', 'Insulation Roll', 'Mini Pump']),
  ...group('Jídlo a rostliny', ['Lemon', 'Apricot', 'Prickly Pear', 'Olives', 'Mushroom']),
  ...group('Výzkum', ['Raider Logbook', 'Exodus Technical Handbook', 'ARC Data Module']),
]);
