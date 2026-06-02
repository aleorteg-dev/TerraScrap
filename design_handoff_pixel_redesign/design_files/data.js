/* ============================================================================
   TerraScrap — demo data
   Stand-in for the backend item-catalog + tile-search responses, so the
   mockup behaves like the real product without a server.
   Coordinates: world (x,y) for display; px/py are % positions on the map mock.
   ============================================================================ */

const SOURCE_META = {
  chest:  { label: 'Cofre',  color: 'var(--src-chest)',  icon: 'chest' },
  block:  { label: 'Bloque', color: 'var(--src-block)',  icon: 'block' },
  wall:   { label: 'Pared',  color: 'var(--src-wall)',   icon: 'wall' },
  object: { label: 'Objeto', color: 'var(--src-object)', icon: 'object' },
};

const ICONS = {
  chest:  '<path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Z"/><path d="M3 8 5 4h14l2 4"/><path d="M12 8v4M9 12h6"/>',
  block:  '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9h16M9 4v16"/>',
  wall:   '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 16h18M9 4v6M15 10v6"/>',
  object: '<path d="M12 2 4 7v10l8 5 8-5V7l-8-5Z"/><path d="m4 7 8 5 8-5M12 12v10"/>',
};

// Item catalog (name + id) for autocomplete
const CATALOG = [
  { id: 4956, name: 'Zenith' },
  { id: 3032, name: 'Aglet' },
  { id: 421,  name: 'Chlorophyte Ore' },
  { id: 54,   name: 'Hermes Boots' },
  { id: 50,   name: 'Magic Mirror' },
  { id: 49,   name: 'Cloud in a Bottle' },
  { id: 29,   name: 'Life Crystal' },
  { id: 8,    name: 'Torch' },
  { id: 53,   name: 'Band of Regeneration' },
  { id: 938,  name: 'Honey Block' },
  { id: 159,  name: 'Mythril Ore' },
  { id: 364,  name: 'Demonite Ore' },
];

// Search results keyed by item id. px/py = percentage on the map mock.
const RESULTS = {
  // Zenith — a single legendary chest stash
  4956: [
    { x: 2840, y: 412,  source: 'chest', chest: 217, stack: 1, px: 24, py: 16,
      chestName: 'Cofre de oro', items: [
        { name: 'Zenith', qty: 1, found: true }, { name: 'Terra Blade', qty: 1 },
        { name: 'Gold Coin', qty: 18 }, { name: 'Healing Potion', qty: 9 },
        { name: 'Hallowed Bar', qty: 12 }, { name: 'Soul of Might', qty: 24 } ] },
  ],
  // Aglet — accessory tucked in a couple of chests
  3032: [
    { x: 1320, y: 348, source: 'chest', chest: 41, stack: 1, px: 12, py: 22,
      chestName: 'Cofre de madera', items: [ { name: 'Aglet', qty: 1, found: true }, { name: 'Wood', qty: 80 }, { name: 'Rope', qty: 50 } ] },
    { x: 6180, y: 520, source: 'chest', chest: 903, stack: 1, px: 70, py: 28,
      chestName: 'Cofre de selva', items: [ { name: 'Aglet', qty: 1, found: true }, { name: 'Stinger', qty: 14 } ] },
  ],
  // Chlorophyte — lots of ore + a couple stashes
  421: [
    { x: 5260, y: 1640, source: 'block', stack: 1, px: 58, py: 70 },
    { x: 5310, y: 1672, source: 'block', stack: 1, px: 60, py: 72 },
    { x: 5198, y: 1708, source: 'block', stack: 1, px: 56, py: 74 },
    { x: 4980, y: 1590, source: 'block', stack: 1, px: 52, py: 67 },
    { x: 6020, y: 1750, source: 'block', stack: 1, px: 66, py: 76 },
    { x: 3120, y: 1820, source: 'block', stack: 1, px: 30, py: 80 },
    { x: 7240, y: 1880, source: 'chest', chest: 612, stack: 47, px: 82, py: 82,
      chestName: 'Cofre de musgo', items: [ { name: 'Chlorophyte Ore', qty: 47, found: true }, { name: 'Turtle Shell', qty: 2 } ] },
    { x: 2480, y: 1560, source: 'block', stack: 1, px: 22, py: 66 },
  ],
  // Mythril — ore veins
  159: [
    { x: 3680, y: 1280, source: 'block', stack: 1, px: 36, py: 56 },
    { x: 3720, y: 1320, source: 'block', stack: 1, px: 38, py: 58 },
    { x: 5840, y: 1410, source: 'block', stack: 1, px: 64, py: 61 },
    { x: 6120, y: 1380, source: 'block', stack: 1, px: 68, py: 60 },
    { x: 2210, y: 1450, source: 'block', stack: 1, px: 20, py: 62 },
  ],
  // Torch — extremely common: blocks + many chests + walls (shows scale + filters)
  8: [
    { x: 4210, y: 360, source: 'object', stack: 1, px: 47, py: 17 },
    { x: 3980, y: 980, source: 'object', stack: 1, px: 44, py: 44 },
    { x: 5400, y: 1240, source: 'object', stack: 1, px: 61, py: 55 },
    { x: 2600, y: 1500, source: 'object', stack: 1, px: 26, py: 64 },
    { x: 1840, y: 720, source: 'chest', chest: 88, stack: 32, px: 16, py: 34,
      chestName: 'Cofre de madera', items: [ { name: 'Torch', qty: 32, found: true }, { name: 'Wood', qty: 120 } ] },
    { x: 6680, y: 600, source: 'chest', chest: 455, stack: 18, px: 76, py: 30,
      chestName: 'Cofre de cielo', items: [ { name: 'Torch', qty: 18, found: true }, { name: 'Lucky Horseshoe', qty: 1 } ] },
    { x: 7020, y: 1320, source: 'block', stack: 1, px: 80, py: 57 },
    { x: 4520, y: 1700, source: 'object', stack: 1, px: 50, py: 75 },
  ],
};

const NPCS = [
  { name: 'Guide',        emoji: '🧭', x: 4248, y: 352 },
  { name: 'Merchant',     emoji: '💰', x: 4180, y: 354 },
  { name: 'Nurse',        emoji: '💉', x: 4310, y: 356 },
  { name: 'Demolitionist',emoji: '🧨', x: 3120, y: 1180 },
  { name: 'Dryad',        emoji: '🌿', x: 4400, y: 350 },
  { name: 'Arms Dealer',  emoji: '🔫', x: 4150, y: 358 },
  { name: 'Goblin Tinkerer', emoji: '🔧', x: 5680, y: 1240 },
  { name: 'Wizard',       emoji: '🪄', x: 2980, y: 1320 },
  { name: 'Mechanic',     emoji: '⚙️', x: 6100, y: 1480 },
];
