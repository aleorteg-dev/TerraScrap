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

const AIR_COLOR = '#1a1a2e';
const DEFAULT_TILE_COLOR = '#555555';

export function getTileColor(tileId: number): string {
  if (tileId < 0) return AIR_COLOR;
  return TILE_COLORS[tileId] ?? DEFAULT_TILE_COLOR;
}
