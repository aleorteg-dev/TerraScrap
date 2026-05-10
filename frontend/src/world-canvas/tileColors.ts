const TILE_COLORS: Readonly<Record<number, string>> = {
  0: '#4a3728', // Dirt
  1: '#7a7a7a', // Stone
  2: '#2d5a1e', // Grass
  3: '#2d6b1e', // Plants
  6: '#cc8833', // Iron Ore
  7: '#7fc7c7', // Copper Ore
  8: '#ffd700', // Gold Ore
  9: '#c0c0c0', // Silver Ore
  20: '#4a7a2e', // Jungle Grass
  22: '#7038c0', // Ebonstone
  23: '#5a1a5a', // Corrupt Grass
  25: '#3a1a5a', // Ebonwood
  30: '#7a4a28', // Wood
  37: '#cc6020', // Meteorite
  38: '#8a3a00', // Clay
  40: '#a08060', // Obsidian
  41: '#cc4444', // Hellstone
  48: '#ccaa88', // Hardened Sand
  53: '#e0c870', // Sand
  57: '#444455', // Ash
  58: '#993333', // Hellstone (ore form)
  59: '#332211', // Mud
  60: '#2e5e1e', // Jungle Grass underground
  63: '#5555ff', // Sapphire
  64: '#ff5555', // Ruby
  65: '#55ff55', // Emerald
  66: '#ffaaff', // Amethyst
  67: '#ffff55', // Topaz
  68: '#55ffff', // Diamond
  70: '#1a3a0a', // Mushroom Grass
  107: '#ff8888', // Crimstone
  116: '#ff4444', // Crimsand
  147: '#eeeeff', // Snow Block
  161: '#aaaaff', // Ice Block
  162: '#7777ff', // Purple Ice
  163: '#ff7777', // Red Ice
  165: '#ffddaa', // Marble
};

const WALL_COLORS: Readonly<Record<number, string>> = {
  1: '#5a4a38', // Stone Wall
  2: '#3d2d1e', // Dirt Wall
  4: '#4a3a28', // Wood Wall
  5: '#3a2a18', // Gray Brick Wall
  7: '#4a3a28', // Copper Brick Wall
  10: '#5a5a5a', // Obsidian Brick Wall
  14: '#4a4a6a', // Pearlstone Brick Wall
  16: '#5a3a3a', // Red Brick Wall
  17: '#5a4a3a', // Clay Brick Wall
  23: '#3a4a5a', // Blue Brick Wall
  24: '#3a3a5a', // Ice Brick Wall
  28: '#3a5a3a', // Jungle Wall
  63: '#3a3a3a', // Ebonstone Brick Wall
  64: '#5a5a5a', // Crimstone Brick Wall
  65: '#6a5a3a', // Sandstone Brick Wall
  68: '#4a3a2a', // Mushroom Wall
  83: '#3a5a6a', // Glass Wall
  87: '#3a3a5a', // Blue Dungeon Brick Wall
  88: '#5a3a3a', // Green Dungeon Brick Wall
  89: '#5a3a2a', // Pink Dungeon Brick Wall
  168: '#6a5a5a', // Marble Wall
  175: '#5a5a6a', // Granite Wall
};

const LIQUID_COLORS: Readonly<Record<number, string>> = {
  1: '#2266cc', // water
  2: '#cc4400', // lava
  3: '#ddaa00', // honey
  4: '#cc88ff', // shimmer
};

const AIR_COLOR = '#1a1a2e';
const DEFAULT_TILE_COLOR = '#555555';
const DEFAULT_WALL_COLOR = '#3a3a3a';
const DEFAULT_LIQUID_COLOR = '#2266cc';

export function getTileColor(tileId: number): string {
  if (tileId < 0) return AIR_COLOR;
  return TILE_COLORS[tileId] ?? DEFAULT_TILE_COLOR;
}

export function getWallColor(wallId: number): string {
  return WALL_COLORS[wallId] ?? DEFAULT_WALL_COLOR;
}

export function getLiquidColor(liquidType: number): string {
  return LIQUID_COLORS[liquidType] ?? DEFAULT_LIQUID_COLOR;
}
