import { describe, it, expect } from 'vitest';
import { getTileColor, getWallColor, getLiquidColor } from '../tileColors';

const DEFAULT_TILE = '#555555';
const DEFAULT_WALL = '#3a3a3a';
const AIR = '#1a1a2e';

describe('tileColors palette (extended)', () => {
  it('air tile (tileId < 0) returns the air color', () => {
    expect(getTileColor(-1)).toBe(AIR);
  });

  it('legacy core tile ids still map (Dirt/Stone/Grass)', () => {
    expect(getTileColor(0)).not.toBe(DEFAULT_TILE);
    expect(getTileColor(1)).not.toBe(DEFAULT_TILE);
    expect(getTileColor(2)).not.toBe(DEFAULT_TILE);
  });

  it('hardmode ores cobalt/mythril/adamantite/chlorophyte have non-default colors', () => {
    for (const id of [107, 108, 111, 211]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('ice variants and snow are mapped (147, 161, 162, 163, 164)', () => {
    for (const id of [147, 161, 162, 163, 164]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('biome stones (Pearlstone, Sandstone variants) are mapped', () => {
    for (const id of [117, 397, 400, 404]) {
      expect(getTileColor(id)).not.toBe(DEFAULT_TILE);
    }
  });

  it('unknown tile id falls back to default tile color', () => {
    expect(getTileColor(99999)).toBe(DEFAULT_TILE);
  });

  it('walls: dungeon and cavern variants mapped (41, 121, 122, 351)', () => {
    for (const id of [41, 121, 122, 351]) {
      expect(getWallColor(id)).not.toBe(DEFAULT_WALL);
    }
  });

  it('unknown wall id falls back to default wall color', () => {
    expect(getWallColor(99999)).toBe(DEFAULT_WALL);
  });

  it('shimmer liquid (type 4) returns a non-default color', () => {
    expect(getLiquidColor(4)).not.toBe(getLiquidColor(1));
  });

  it('chest tiles (21, 441, 467, 468) are visually distinct from wood/stone', () => {
    const wood = getTileColor(30);
    const stone = getTileColor(1);
    for (const id of [21, 441, 467, 468]) {
      const color = getTileColor(id);
      expect(color).not.toBe(DEFAULT_TILE);
      expect(color).not.toBe(wood);
      expect(color).not.toBe(stone);
    }
  });

  it('hardmode walls (dungeon, hallowed) mapped vividly', () => {
    for (const id of [7, 8, 9, 347]) {
      expect(getWallColor(id)).not.toBe(DEFAULT_WALL);
    }
  });
});
